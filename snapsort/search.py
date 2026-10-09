"""Search: stack filters over stored results and return the matching media, with time segments for videos.

Design: docs/design/2026-10-09-filters.md."""
import sqlite3
from dataclasses import dataclass
from pathlib import Path

from snapsort.group import SCHEMA as GROUP_SCHEMA
from snapsort.ingest import connect

GAP = 2.0   # seconds; matches this close merge into one segment, which bridges one missed 1 fps frame
SORTS = ("similarity", "newest", "oldest", "name")

FRAMES = ("SELECT f.id, f.media_id, f.ts, m.path, m.kind, m.added_at "
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
    """The library database with the grouping tables present, so a library that was never grouped has no persons."""
    conn = connect(data_dir / "snapsort.db")
    conn.executescript(GROUP_SCHEMA)
    return conn


def search(conn, filters: list[dict], sort: str | None = None,
           limit: int | None = None, gap: float = GAP) -> list[Hit]:
    """Media matching every filter, sorted, cut to limit. Raises QueryError (see the design's Errors)."""
    sort = sort or "newest"
    if sort not in SORTS:
        raise QueryError(f"unknown sort {sort!r}. choose from {', '.join(SORTS)}")
    if sort == "similarity":
        raise QueryError("sort by similarity needs a similar image")
    if limit is not None and limit < 1:
        raise QueryError(f"limit must be at least 1, got {limit}")
    frames = _filter(conn, filters)
    scores = None if frames is None else dict.fromkeys(frames)
    return _rank(_hits(conn, scores, gap), sort, limit)


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


def _filter(conn, filters: list[dict]) -> set[int] | None:
    """Frame ids matching every filter. None when there are no filters, meaning every frame."""
    frames = None
    for f in filters:
        fn = FILTERS.get(f.get("kind"))
        if fn is None:
            raise QueryError(f"unsupported filter kind: {f.get('kind')!r}")
        got = fn(conn, f)
        frames = got if frames is None else frames & got
    return frames


def _person(conn, f: dict) -> set[int]:
    """Frames with a face of the persons: all of them (intersection) or any of them (union)."""
    ids = list(dict.fromkeys(f.get("ids") or []))
    match = f.get("match", "all")
    if not ids:
        raise QueryError("person filter needs at least one id")
    if not all(isinstance(i, int) and not isinstance(i, bool) for i in ids):
        raise QueryError(f"person ids must be integers, got {ids!r}")
    if match not in ("all", "any"):
        raise QueryError(f"person match must be all or any, got {match!r}")
    known = {r[0] for r in conn.execute(f"SELECT id FROM persons WHERE id IN ({','.join('?' * len(ids))})", ids)}
    missing = [str(i) for i in ids if i not in known]
    if missing:
        raise QueryError(f"unknown person id(s): {', '.join(missing)}. see snapsort people")
    sets = [{r[0] for r in conn.execute(
        "SELECT r.frame_id FROM person_faces pf JOIN results r ON r.id = pf.result_id WHERE pf.person_id = ?",
        (i,))} for i in ids]
    return set.union(*sets) if match == "any" else set.intersection(*sets)


def _place(conn, f: dict) -> set[int]:
    """Every frame of the files whose location label is the name. Ingest stores labels stripped and lowercased."""
    name = str(f.get("name") or "").strip().lower()
    rows = conn.execute(
        "SELECT g.id FROM results r JOIN frames f ON f.id = r.frame_id JOIN frames g ON g.media_id = f.media_id "
        "WHERE r.module = 'location' AND r.label = ?", (name,)).fetchall()
    if not rows:
        raise QueryError(f"no media at place {name!r}. see snapsort places")
    return {r[0] for r in rows}


def _media_kind(conn, f: dict) -> set[int]:
    """Every frame of the files of that kind."""
    value = f.get("value")
    if value not in ("image", "video"):
        raise QueryError(f"mediaKind must be image or video, got {value!r}")
    return {r[0] for r in conn.execute(
        "SELECT f.id FROM frames f JOIN media m ON m.id = f.media_id WHERE m.kind = ?", (value,))}


FILTERS = {"person": _person, "place": _place, "mediaKind": _media_kind}


def _hits(conn, scores: dict[int, float | None] | None, gap: float) -> list[Hit]:
    """One Hit per file. scores maps each matched frame id to its score. None means every frame, unscored."""
    by_media: dict[int, tuple] = {}
    for fid, mid, ts, path, kind, added_at in conn.execute(FRAMES):
        if scores is None or fid in scores:
            entry = by_media.setdefault(mid, (path, kind, added_at, []))
            entry[3].append((ts, None if scores is None else scores[fid]))
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
    if sort == "similarity":
        hits.sort(key=lambda h: -h.score)
    elif sort == "newest":  # added_at has 1 s resolution: a tie goes to the later insert
        hits.sort(key=lambda h: (h.added_at, h.media_id), reverse=True)
    elif sort == "oldest":
        hits.sort(key=lambda h: (h.added_at, h.media_id))
    else:
        hits.sort(key=lambda h: Path(h.path).name.lower())
    return hits[:limit]
