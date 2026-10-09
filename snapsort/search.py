"""Search: stack filters over stored results and return the matching media, with time segments for videos.

Design: docs/design/2026-10-09-filters.md."""
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from snapsort.ingest import connect, load_image

GAP = 2.0   # seconds; matches this close merge into one segment, which bridges one missed 1 fps frame
SORTS = ("similarity", "newest", "oldest", "name")
MIN_SCORE = 0.5   # calibrated on a real folder, see the design's Findings
CHUNK = 900       # media ids per IN (...) query, under SQLite's oldest variable limit (999)

Match = dict[int, set[int] | None]   # media id -> matched frame ids; None = the whole file, no frame marks

FRAMES =("SELECT f.id, f.media_id, f.ts, m.path, m.kind, m.added_at "
          "FROM frames f JOIN media m ON m.id = f.media_id")


class QueryError(ValueError):
    """The query names something the library doesn't have. The message is shown to the user."""


@dataclass
class Segment:
    start: float          # ts of the first matched frame
    end: float            # ts of the last matched frame
    score: float | None   # best frame score in the segment; None without similar


@dataclass
class Hit:
    media_id: int
    path: str
    kind: str                                   # "image" | "video"
    added_at: str
    score: float | None                         # best frame score; None without similar
    matches: list[tuple[float, float | None]]   # (ts, score) per matched frame; videos only
    segments: list[Segment]                     # videos only
    best_ts: float | None                       # videos only


def open_db(data_dir: Path) -> sqlite3.Connection:
    """The library database. Never creates the grouping tables: that write would wait on a running ingest."""
    return connect(data_dir / "snapsort.db")


def _grouped(conn) -> bool:
    """Whether grouping has ever run, i.e. the persons tables exist."""
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'persons'").fetchone() is not None


def search(conn, filters: list[dict], similar: dict | None = None, min_score: float = MIN_SCORE,
           sort: str | None = None, limit: int | None = None, gap: float = GAP,
           combine: str = "all", scope: str = "file") -> list[Hit]:
    """Media matching the filters (similar counts as one), sorted, cut to limit.
    combine: "all" = every filter matches the file, "any" = at least one does.
    scope: "file" = frame-based filters (person, similar) may match on different frames of the file,
    "frame" = they must match on the same frame. Raises QueryError (see the design's Errors)."""
    sort = sort or ("similarity" if similar else "newest")
    if sort not in SORTS:
        raise QueryError(f"unknown sort {sort!r}. choose from {', '.join(SORTS)}")
    if sort == "similarity" and similar is None:
        raise QueryError("sort by similarity needs a similar image")
    if limit is not None and limit < 1:
        raise QueryError(f"limit must be at least 1, got {limit}")
    if combine not in ("all", "any"):
        raise QueryError(f"combine must be all or any, got {combine!r}")
    if scope not in ("file", "frame"):
        raise QueryError(f"scope must be file or frame, got {scope!r}")
    matches = [_run(conn, f, scope) for f in filters]
    scores: dict[int, float] = {}
    if similar is not None:
        # under AND only files every other filter matched can match, so only their vectors are read
        media = set.intersection(*(set(m) for m in matches)) if matches and combine == "all" else None
        match, scores = _similar(conn, _query_vector(conn, similar), media, min_score)
        matches.append(match)
    if not matches:
        matched = dict.fromkeys(r[0] for r in conn.execute("SELECT id FROM media"))
    elif combine == "any":
        matched = _union(matches)
    else:
        matched = _same_frame(matches) if scope == "frame" else _same_file(matches)
    return _rank(_hits(conn, matched, scores, gap), sort, limit)


def segments(matches: list[tuple[float, float | None]], gap: float = GAP) -> list[Segment]:
    """Merge (ts, score) matches, sorted by ts, into segments. A step greater than gap starts a new one."""
    out: list[Segment] = []
    for ts, score in matches:
        if out and ts - out[-1].end <= gap:
            last = out[-1]
            last.end = ts
            if score is not None and (last.score is None or score > last.score):
                last.score = score
        else:
            out.append(Segment(ts, ts, score))
    return out


def _run(conn, f: dict, scope: str) -> Match:
    fn = FILTERS.get(f.get("kind"))
    if fn is None:
        raise QueryError(f"unsupported filter kind: {f.get('kind')!r}")
    return fn(conn, f, scope)


def _marks(frame_sets: list[set[int] | None], op) -> set[int] | None:
    """Combine the frame marks of one file. Whole-file matches (None) add no marks; all None stays None."""
    given = [s for s in frame_sets if s is not None]
    return op(*given) if given else None


def _union(matches: list[Match]) -> Match:
    """Files any match has, marked with the frames of all of them."""
    return {mid: _marks([m[mid] for m in matches if mid in m], set.union) for mid in set().union(*matches)}


def _same_file(matches: list[Match]) -> Match:
    """Files every match has, possibly on different frames, marked with the frames of all of them."""
    both = set.intersection(*(set(m) for m in matches))
    return {mid: _marks([m[mid] for m in matches], set.union) for mid in both}


def _same_frame(matches: list[Match]) -> Match:
    """Files where every frame-based match hits a shared frame, marked with the shared frames.
    Whole-file matches only require the file."""
    out = {}
    for mid in set.intersection(*(set(m) for m in matches)):
        frames = _marks([m[mid] for m in matches], set.intersection)
        if frames is None or frames:
            out[mid] = frames
    return out


def _by_media(rows) -> Match:
    """(media id, frame id) rows -> Match."""
    out: Match = {}
    for mid, fid in rows:
        out.setdefault(mid, set()).add(fid)
    return out


def _person(conn, f: dict, scope: str) -> Match:
    """Files with the persons: all of them (in the same file, or frame under scope "frame") or any of them.
    Marked with the frames the persons appear in."""
    ids = list(dict.fromkeys(f.get("ids") or []))
    match = f.get("match", "all")
    if not ids:
        raise QueryError("person filter needs at least one id")
    if not all(isinstance(i, int) and not isinstance(i, bool) for i in ids):
        raise QueryError(f"person ids must be integers, got {ids!r}")
    if match not in ("all", "any"):
        raise QueryError(f"person match must be all or any, got {match!r}")
    known = {r[0] for r in conn.execute(
        f"SELECT id FROM persons WHERE id IN ({','.join('?' * len(ids))})", ids)} if _grouped(conn) else set()
    missing = [str(i) for i in ids if i not in known]
    if missing:
        raise QueryError(f"unknown person id(s): {', '.join(missing)}. see snapsort people")
    each = [_by_media(conn.execute(
        "SELECT f.media_id, r.frame_id FROM person_faces pf JOIN results r ON r.id = pf.result_id "
        "JOIN frames f ON f.id = r.frame_id WHERE pf.person_id = ?", (i,))) for i in ids]
    if match == "any":
        return _union(each)
    return _same_frame(each) if scope == "frame" else _same_file(each)


def _place(conn, f: dict, scope: str) -> Match:
    """The whole files whose location label is the name. Ingest stores labels stripped and lowercased."""
    name = str(f.get("name") or "").strip().lower()
    rows = conn.execute(
        "SELECT DISTINCT f.media_id FROM results r JOIN frames f ON f.id = r.frame_id "
        "WHERE r.module = 'location' AND r.label = ?", (name,)).fetchall()
    if not rows:
        raise QueryError(f"no media at place {name!r}. see snapsort places")
    return dict.fromkeys(r[0] for r in rows)


def _media_kind(conn, f: dict, scope: str) -> Match:
    """The whole files of that kind."""
    value = f.get("value")
    if value not in ("image", "video"):
        raise QueryError(f"mediaKind must be image or video, got {value!r}")
    return dict.fromkeys(r[0] for r in conn.execute("SELECT id FROM media WHERE kind = ?", (value,)))


FILTERS = {"person": _person, "place": _place, "mediaKind": _media_kind}


def _query_vector(conn, similar: dict) -> np.ndarray:
    """The unit vector frames are compared against: a stored frame's, or a query image's."""
    if "mediaId" in similar:
        mid, ts = similar["mediaId"], similar.get("ts")
        if conn.execute("SELECT 1 FROM media WHERE id = ?", (mid,)).fetchone() is None:
            raise QueryError(f"unknown media id {mid}")
        sql = ("SELECT r.vector FROM frames f JOIN results r ON r.frame_id = f.id AND r.module = 'image_embed' "
               "WHERE f.media_id = ? ORDER BY ")
        if ts is None:
            row = conn.execute(sql + "f.idx LIMIT 1", (mid,)).fetchone()
        else:
            row = conn.execute(sql + "abs(coalesce(f.ts, 0) - ?), f.idx LIMIT 1", (mid, ts)).fetchone()
        if row is None:
            raise QueryError(f"media {mid} has no image_embed vectors. run snapsort ingest --modules image_embed")
        return np.frombuffer(row[0], "<f4")
    if "path" in similar:
        path = Path(similar["path"])
        try:
            image = load_image(path)
        except Exception as e:  # missing, not an image, unreadable
            raise QueryError(f"cannot read query image {path}: {type(e).__name__}: {e}") from e
        if conn.execute("SELECT 1 FROM results WHERE module = 'image_embed' LIMIT 1").fetchone() is None:
            raise QueryError("no image_embed vectors in this library. run snapsort ingest --modules image_embed")
        from snapsort.modules.image_embed import ImageEmbed  # torch loads only for a path query
        try:
            model = ImageEmbed()
            model.setup()
            return model.embed([image])[0]
        except Exception as e:  # e.g. weights not cached and no network
            raise QueryError(f"image_embed model failed: {type(e).__name__}: {e}") from e
    raise QueryError("similar needs mediaId or path")


def _similar(conn, q: np.ndarray, media: set[int] | None,
             min_score: float) -> tuple[Match, dict[int, float]]:
    """Frames with an image_embed vector scoring at least min_score against q, as a Match plus their scores.
    Only the frames of `media` are read; None means every file."""
    # ponytail: reads every candidate vector per query (~300 MB at 100k frames when no other filter narrows them);
    # cache the matrix in a file or move to sqlite-vec if queries get slow
    sql = ("SELECT r.frame_id, f.media_id, r.vector FROM results r JOIN frames f ON f.id = r.frame_id "
           "WHERE r.module = 'image_embed'")
    if media is None:
        rows = conn.execute(sql).fetchall()
    else:
        ids, rows = list(media), []
        for s in range(0, len(ids), CHUNK):
            chunk = ids[s:s + CHUNK]
            rows += conn.execute(f"{sql} AND f.media_id IN ({','.join('?' * len(chunk))})", chunk).fetchall()
    if not rows:
        return {}, {}
    cos = np.stack([np.frombuffer(v, "<f4") for _, _, v in rows]) @ q
    hits = [(mid, fid, float(c)) for (fid, mid, _), c in zip(rows, cos) if c >= min_score]
    return _by_media((mid, fid) for mid, fid, _ in hits), {fid: c for _, fid, c in hits}


def _hits(conn, matched: Match, scores: dict[int, float], gap: float) -> list[Hit]:
    """One Hit per matched file, with its marked frames (every frame for a whole-file match) and their scores."""
    by_media: dict[int, tuple] = {}
    for fid, mid, ts, path, kind, added_at in conn.execute(FRAMES):
        if mid in matched and (matched[mid] is None or fid in matched[mid]):
            entry = by_media.setdefault(mid, (path, kind, added_at, []))
            entry[3].append((ts, scores.get(fid)))
    return [_hit(mid, *entry, gap) for mid, entry in by_media.items()]


def _hit(media_id, path, kind, added_at, matches, gap) -> Hit:
    score = max((s for _, s in matches if s is not None), default=None)
    if kind == "image":
        return Hit(media_id, path, kind, added_at, score, [], [], None)
    matches.sort(key=lambda m: m[0])
    best_ts = matches[0][0] if score is None else next(t for t, s in matches if s == score)
    return Hit(media_id, path, kind, added_at, score, matches, segments(matches, gap), best_ts)


def _rank(hits: list[Hit], sort: str, limit: int | None) -> list[Hit]:
    hits.sort(key=lambda h: h.media_id)  # ties keep id order
    if sort == "similarity":  # under OR a file can match without a score: those go last
        hits.sort(key=lambda h: (h.score is None, -(h.score or 0)))
    elif sort == "newest":  # added_at has 1 s resolution: a tie goes to the later insert
        hits.sort(key=lambda h: (h.added_at, h.media_id), reverse=True)
    elif sort == "oldest":
        hits.sort(key=lambda h: (h.added_at, h.media_id))
    else:
        hits.sort(key=lambda h: Path(h.path).name.lower())
    return hits[:limit]


def list_people(conn) -> list[tuple[int, str | None, int, int]]:
    """(id, name, faces, files) per person with at least one face, most files first."""
    if not _grouped(conn):
        return []
    return conn.execute(
        "SELECT p.id, p.name, count(*), count(DISTINCT f.media_id) FROM persons p "
        "JOIN person_faces pf ON pf.person_id = p.id JOIN results r ON r.id = pf.result_id "
        "JOIN frames f ON f.id = r.frame_id GROUP BY p.id ORDER BY 4 DESC, p.id").fetchall()


def list_places(conn) -> list[tuple[str, int]]:
    """(place, files) per place name, most files first. Location results without a place name are skipped."""
    return conn.execute(
        "SELECT r.label, count(DISTINCT f.media_id) FROM results r JOIN frames f ON f.id = r.frame_id "
        "WHERE r.module = 'location' AND r.label IS NOT NULL GROUP BY r.label ORDER BY 2 DESC, 1").fetchall()
