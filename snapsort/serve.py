"""snapsort serve: the desktop app's backend, as JSON lines on stdio.

Request {"id", "method", "params"} -> {"id", "result"} or {"id", "error": {"code", "message"}}.
Every mounted library is served at once. Media, person and folder ids are global numbers:
library key * 2**32 + local id, where the key comes from the library's uuid. That keeps the frontend's
numeric ids and still routes every id back to its library."""
import json
import os
import sqlite3
import sys
import threading
import zlib
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

import numpy as np

import snapsort.search as search_mod
from snapsort.group import PICK_FACE, _save_centroids
from snapsort.ingest import frame_file, load_image
from snapsort.library import INTERNAL_DATA, disk_usage, library_for, mounted, read_id, root_for
from snapsort.search import QueryError, search

SHIFT = 2 ** 32
DISPLAY = 2560   # longest side of the JPEG shown for a HEIC
FACE = 256


class ApiError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass
class Lib:
    id: str
    key: int
    data_dir: Path
    root: Path
    name: str
    external: bool

    @contextmanager
    def db(self):
        """A connection for one request, committed and closed after: no handle stays open to block an eject."""
        conn = sqlite3.connect(self.data_dir / "snapsort.db", timeout=10)
        try:
            conn.execute("PRAGMA foreign_keys=ON")
            with conn:
                yield conn
        finally:
            conn.close()

    def gid(self, local: int) -> int:
        return self.key * SHIFT + local

    def folder_gid(self, rel_dir: str) -> int:
        return self.key * SHIFT + zlib.crc32(rel_dir.encode())


def _key(lib_id: str) -> int:
    return int(lib_id.replace("-", "")[:5], 16)  # 20 bits, so ids stay under 2**53


def libraries() -> list[Lib]:
    out = []
    for d in mounted():
        if not (d / "snapsort.db").is_file():
            continue
        try:
            lid = read_id(d)
        except (OSError, ValueError, KeyError):
            continue
        external = d != INTERNAL_DATA
        lib = Lib(lid, _key(lid), d, root_for(d), d.parent.name if external else "This Mac", external)
        try:  # a corrupt or half-copied database hides that library, not every library
            with lib.db() as conn:
                conn.execute("SELECT 1 FROM media LIMIT 1")
        except sqlite3.DatabaseError as e:
            print(f"serve: skipping {d}: {e}", file=sys.stderr)
            continue
        if any(o.id == lid for o in out):  # a cloned drive: its ids would route to the original
            print(f"serve: skipping {d}: same library id as {next(o for o in out if o.id == lid).data_dir}",
                  file=sys.stderr)
            continue
        out.append(lib)
    return out


def _lib(gid: int) -> tuple[Lib, int]:
    key, local = divmod(int(gid), SHIFT)
    for lib in libraries():
        if lib.key == key:
            return lib, local
    raise ApiError("LIBRARY_GONE", "that drive isn't connected")


def _parent(path: str) -> str:
    p = str(PurePosixPath(path).parent)
    return "" if p == "." else p


def _grouped(conn) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'persons'").fetchone() is not None


# ---- libraries and folders

def list_libraries(params=None) -> list[dict]:
    out = []
    for lib in libraries():
        with lib.db() as conn:
            sources = [r[0] for r in conn.execute("SELECT path FROM sources")]
            paths = [r[0] for r in conn.execute("SELECT path FROM media")]
        try:
            total, free = disk_usage(lib.data_dir)
        except OSError:
            total = free = 0
        out.append({"id": lib.id, "key": lib.key, "name": lib.name, "root": str(lib.root),
                    "dataDir": str(lib.data_dir), "isExternal": lib.external,
                    "totalBytes": total, "freeBytes": free, "folders": _tree(lib, sources, paths)})
    return out


def _tree(lib: Lib, sources: list[str], paths: list[str]) -> list[dict]:
    """Added folders as roots, with every subfolder that holds media below them, and media counts."""
    def under(d: str, s: str) -> bool:
        return d == s or s == "" or d.startswith(s + "/")

    counts: dict[str, int] = {}
    for p in paths:
        d = _parent(p)
        while True:
            if any(under(d, s) for s in sources):
                counts[d] = counts.get(d, 0) + 1
            if d == "":
                break
            d = _parent(d)
    for s in sources:
        counts.setdefault(s, 0)
    nodes = {d: {"id": lib.folder_gid(d), "name": PurePosixPath(d).name or lib.name,
                 "path": str(lib.root / d), "count": n, "children": []} for d, n in counts.items()}
    roots = []
    for d in sorted(nodes):
        parent = _parent(d) if d else None
        while parent is not None and parent not in nodes:
            parent = _parent(parent) if parent else None
        (nodes[parent]["children"] if parent is not None else roots).append(nodes[d])
    return roots


def _folder(gid: int) -> tuple[Lib, str]:
    lib, crc = _lib(gid)
    with lib.db() as conn:
        dirs = {r[0] for r in conn.execute("SELECT path FROM sources")}
        for (p,) in conn.execute("SELECT path FROM media"):
            d = _parent(p)
            while d not in dirs:
                dirs.add(d)
                if d == "":
                    break
                d = _parent(d)
    for d in dirs:
        if zlib.crc32(d.encode()) == crc:
            return lib, d
    raise ApiError("NOT_FOUND", "folder not found")


def library_for_path(params) -> dict:
    p = Path(params["path"])
    d = library_for(p)
    return {"dataDir": str(d), "root": str(root_for(d)), "exists": (d / "library.json").is_file()}


# ---- query

def _sort(s: dict) -> str:
    sort = s.get("sort") or "newest"
    if sort in ("relevance", "similarity"):
        return "relevance" if s.get("q") else "similarity" if s.get("similarTo") else "newest"
    return sort


def _query_vector(libs: list[Lib], similar: dict) -> np.ndarray:
    """The similar-image vector, computed once so every library compares against the same one."""
    if "mediaId" in similar:
        lib, local = _lib(similar["mediaId"])
        with lib.db() as conn:
            return search_mod._query_vector(conn, {"mediaId": local, "ts": similar.get("ts")})
    for lib in libs:
        with lib.db() as conn:
            if conn.execute("SELECT 1 FROM results WHERE module = 'image_embed' LIMIT 1").fetchone():
                return search_mod._query_vector(conn, {"path": similar["imageRef"]})
    raise QueryError("no library has image_embed vectors")


def _local_filters(lib: Lib, filters: list[dict]) -> list[dict] | None:
    """The filters for one library, or None when no file in it can match: a person filter naming only
    other libraries' persons under "all"."""
    out = []
    for f in filters:
        kind = f.get("kind")
        if kind == "person":
            ids = [divmod(int(i), SHIFT) for i in f.get("ids", [])]
            mine = [local for key, local in ids if key == lib.key]
            match = f.get("match", "all")
            if not mine or (match == "all" and len(mine) < len(ids)):
                return None
            out.append({"kind": "person", "ids": mine, "match": match})
        elif kind in ("place", "mediaKind", "date"):
            out.append({k: v for k, v in f.items() if k != "source"})
        elif kind == "label":
            out.append({"kind": "label", "module": f.get("module") or "objects",
                        "labelIds": f.get("labelIds") or [f.get("labelId")], "match": f.get("match", "all")})
        # folder is applied after search; scene has no backend module
    return out


def _run(lib: Lib, conn, filters, similar, q, sort, folder: str | None) -> list:
    try:
        hits = search(conn, filters, similar, sort=sort, q=q)
    except QueryError as e:
        if "no media at place" in str(e) or "unknown person" in str(e):  # just not in this library
            return []
        raise
    if folder is not None and folder != "":
        hits = [h for h in hits if h.path.startswith(folder + "/")]
    # a file shows once ingest has run a module on it: its previews exist by then
    done = {r[0] for r in conn.execute("SELECT DISTINCT media_id FROM runs")}
    return [h for h in hits if h.media_id in done]


def query(params) -> dict:
    s = params["search"]
    limit = int(params.get("limit") or 60)
    offset = int(params.get("cursor") or 0)
    libs = libraries()
    filters = [f for f in s.get("f", []) if isinstance(f, dict)]
    folder_f = next((f for f in filters if f.get("kind") == "folder"), None)
    folder_lib, folder = _folder(folder_f["id"]) if folder_f else (None, None)
    if folder_lib:
        libs = [lib for lib in libs if lib.key == folder_lib.key]
    scope = {"images": "image", "videos": "video"}.get(s.get("scope"))
    base = [{"kind": "mediaKind", "value": scope}] if scope else []
    q = (s.get("q") or "").strip() or None
    sim = s.get("similarTo")
    similar = {"vector": _query_vector(libs, sim)} if sim else None
    if q and similar:
        raise QueryError("use a text query or a similar image, not both")
    sort = _sort(s)
    filtering = bool(q or similar or [f for f in filters if f.get("kind") not in ("folder", "scene")])
    highlight = s.get("view") == "highlight" and filtering

    rows, errors = [], []
    for lib in libs:
        with lib.db() as conn:
            local = _local_filters(lib, filters)
            try:
                hits = [] if local is None else _run(lib, conn, base + local, similar, q, sort, folder)
                if highlight:
                    matched = {h.media_id: h for h in hits}
                    every = _run(lib, conn, base, None, None, sort if sort not in ("relevance", "similarity")
                                 else "newest", folder)
                    rows += [(lib, matched.get(h.media_id, h), h.media_id in matched) for h in every]
                else:
                    rows += [(lib, h, True) for h in hits]
            except QueryError as e:
                errors.append(str(e))
    if errors and not rows:
        raise QueryError(errors[0])

    rows.sort(key=lambda r: (r[0].key, r[1].media_id))  # ties keep library, then id, order
    if sort in ("relevance", "similarity"):
        rows.sort(key=lambda r: (r[1].score is None, -(r[1].score or 0)))
    elif sort == "newest":
        rows.sort(key=lambda r: r[1].captured_at or r[1].added_at, reverse=True)
    elif sort == "oldest":
        rows.sort(key=lambda r: r[1].captured_at or r[1].added_at)
    else:
        rows.sort(key=lambda r: PurePosixPath(r[1].path).name.lower())
    if highlight:  # matches first, each part in sort order
        rows.sort(key=lambda r: not r[2])

    page = rows[offset:offset + limit]
    items = _summaries(page, scored=bool(q or similar))
    return {"items": items, "nextCursor": str(offset + limit) if offset + limit < len(rows) else None,
            "total": len(rows), "matched": sum(1 for r in rows if r[2]),
            "facets": {"images": sum(1 for r in rows if r[1].kind == "image"),
                       "videos": sum(1 for r in rows if r[1].kind == "video")}}


def _per_lib(rows):
    by: dict[int, tuple[Lib, list[int]]] = {}
    for lib, h, *_ in rows:
        by.setdefault(lib.key, (lib, []))[1].append(h.media_id)
    return by.values()


def _in(ids: list[int]) -> str:
    return ",".join(str(int(i)) for i in ids)


def _media_stats(lib: Lib, conn, ids: list[int]) -> dict[int, dict]:
    """Frame count, duration and distinct persons per media id."""
    stats = {i: {"frames": 0, "durationS": None, "faces": 0} for i in ids}
    for mid, n in conn.execute(f"SELECT media_id, count(*) FROM frames WHERE media_id IN ({_in(ids)}) "
                               "GROUP BY media_id"):
        stats[mid]["frames"] = n
    for mid, data in conn.execute(
            f"SELECT f.media_id, r.data FROM results r JOIN frames f ON f.id = r.frame_id "
            f"WHERE r.module = 'metadata' AND f.media_id IN ({_in(ids)})"):
        stats[mid]["durationS"] = json.loads(data or "{}").get("durationS")
    if _grouped(conn):
        for mid, n in conn.execute(
                f"SELECT f.media_id, count(DISTINCT pf.person_id) FROM person_faces pf "
                f"JOIN results r ON r.id = pf.result_id JOIN frames f ON f.id = r.frame_id "
                f"WHERE f.media_id IN ({_in(ids)}) GROUP BY f.media_id"):
            stats[mid]["faces"] = n
    return stats


def _summaries(rows, scored: bool) -> list[dict]:
    stats: dict[tuple[int, int], dict] = {}
    for lib, ids in _per_lib(rows):
        with lib.db() as conn:
            for mid, st in _media_stats(lib, conn, ids).items():
                stats[(lib.key, mid)] = st
    out = []
    for lib, h, matched in rows:
        st = stats.get((lib.key, h.media_id), {"frames": 0, "durationS": None, "faces": 0})
        item = {"id": lib.gid(h.media_id), "kind": h.kind, "name": PurePosixPath(h.path).name,
                "folderId": lib.folder_gid(_parent(h.path)), "addedAt": h.added_at, "faceCount": st["faces"],
                "matched": matched}
        if h.captured_at:
            item["capturedAt"] = h.captured_at
        if h.score is not None:
            item["score"] = h.score
        if h.kind == "video":
            n = st["frames"]
            item["durationS"] = st["durationS"] or float(n)
            partial = matched and (scored or len(h.matches) < n)  # frames picked out by the filters
            if partial and h.matches:
                item["matches"] = [{"ts": t, "score": sc if sc is not None else 1.0} for t, sc in h.matches]
                item["bestFrameTs"] = h.best_ts
            else:
                item["bestFrameTs"] = float(n // 2)  # the first frame is often black
        out.append(item)
    return out


# ---- one file

def get_media(params) -> dict:
    lib, mid = _lib(params["id"])
    with lib.db() as conn:
        row = conn.execute("SELECT path, kind, added_at FROM media WHERE id = ?", (mid,)).fetchone()
        if row is None:
            raise ApiError("NOT_FOUND", "media not found")
        path, kind, added_at = row
        by_module: dict[str, list] = {}
        for module, label, data, ts in conn.execute(
                "SELECT r.module, r.label, r.data, f.ts FROM results r JOIN frames f ON f.id = r.frame_id "
                "WHERE f.media_id = ? AND r.module IN ('metadata', 'capture_date', 'location', 'objects') "
                "ORDER BY f.idx", (mid,)):
            by_module.setdefault(module, []).append((label, json.loads(data) if data else {}, ts))
        people: dict[int, dict] = {}
        if _grouped(conn):
            for pid, name, ts in conn.execute(
                    "SELECT p.id, p.name, f.ts FROM person_faces pf JOIN persons p ON p.id = pf.person_id "
                    "JOIN results r ON r.id = pf.result_id JOIN frames f ON f.id = r.frame_id "
                    "WHERE f.media_id = ? ORDER BY f.idx", (mid,)):
                p = people.setdefault(pid, {"id": lib.gid(pid), "name": name, "timestamps": []})
                if ts is not None and ts not in p["timestamps"]:
                    p["timestamps"].append(ts)
        frames = [r[0] for r in conn.execute("SELECT ts FROM frames WHERE media_id = ? ORDER BY idx", (mid,))]
        st = _media_stats(lib, conn, [mid])[mid]

    meta = (by_module.get("metadata") or [(None, {}, None)])[0][1]
    labels: dict[str, dict] = {}
    for label, _, ts in by_module.get("objects", []):
        entry = labels.setdefault(label, {"module": "objects", "labelId": label, "name": label.title(),
                                          "timestamps": []})
        if ts is not None and ts not in entry["timestamps"]:
            entry["timestamps"].append(ts)
    detail = {
        "id": lib.gid(mid), "kind": kind, "name": PurePosixPath(path).name,
        "folderId": lib.folder_gid(_parent(path)), "folderPath": str(lib.root / _parent(path)),
        "addedAt": added_at, "faceCount": len(people), "path": str(lib.root / path),
        "width": meta.get("width", 0), "height": meta.get("height", 0),
        "people": list(people.values()), "labels": list(labels.values()), "sizeBytes": meta.get("sizeBytes"),
        "libraryName": lib.name,
    }
    camera = " ".join(x for x in (meta.get("make"), meta.get("model")) if x)
    if camera:
        detail["camera"] = camera
    for k in ("codec", "fps"):
        if meta.get(k) is not None:
            detail[k] = meta[k]
    if kind == "video":
        detail["durationS"] = meta.get("durationS") or float(len(frames))
        detail["frames"] = frames
        detail["bestFrameTs"] = float(len(frames) // 2)
    if by_module.get("capture_date"):
        detail["capturedAt"] = by_module["capture_date"][0][0]
    if by_module.get("location"):
        _, data, _ = by_module["location"][0]
        detail["place"] = {"name": data.get("place") or "Unknown place", "lat": data["lat"], "lon": data["lon"]}
    return {k: v for k, v in detail.items() if v is not None}


def get_detections(params) -> dict:
    lib, mid = _lib(params["id"])
    ts = params.get("ts") or 0
    with lib.db() as conn:
        frame = conn.execute("SELECT id FROM frames WHERE media_id = ? ORDER BY abs(coalesce(ts, 0) - ?), idx "
                             "LIMIT 1", (mid, ts)).fetchone()
        if frame is None:
            return {"faces": [], "objects": []}
        person_join = ("LEFT JOIN person_faces pf ON pf.result_id = r.id LEFT JOIN persons p ON p.id = pf.person_id"
                       if _grouped(conn) else "")
        cols = "pf.person_id, p.name" if person_join else "NULL, NULL"
        faces = conn.execute(f"SELECT r.bbox, {cols} FROM results r {person_join} "
                             "WHERE r.frame_id = ? AND r.module = 'faces'", (frame[0],)).fetchall()
        objects = conn.execute("SELECT r.bbox, r.label, r.score FROM results r WHERE r.frame_id = ? "
                               "AND r.module = 'objects'", (frame[0],)).fetchall()
    box = lambda b: dict(zip("xywh", json.loads(b)))
    return {
        "faces": [{"personId": lib.gid(pid) if pid is not None else None, "name": name, "box": box(b)}
                  for b, pid, name in faces if b],
        "objects": [{"labelId": label, "name": label.title(), "box": box(b), "score": score or 0}
                    for b, label, score in objects if b],
    }


# ---- people, places, labels, counts

def list_people(params=None) -> list[dict]:
    out = []
    for lib in libraries():
        with lib.db() as conn:
            for pid, name, faces, files in search_mod.list_people(conn):
                out.append({"id": lib.gid(pid), "name": name, "count": files,
                            "faceRef": f"snapsort-media://face/{lib.gid(pid)}"})
    return sorted(out, key=lambda p: -p["count"])


def rename_person(params) -> None:
    lib, pid = _lib(params["id"])
    name = (params.get("name") or "").strip() or None
    try:
        with lib.db() as conn:
            conn.execute("UPDATE persons SET name = ? WHERE id = ?", (name, pid))
    except sqlite3.OperationalError as e:
        if "locked" in str(e):
            raise ApiError("BUSY", "the library is busy grouping faces. try again in a moment") from e
        raise


def merge_people(params) -> dict:
    """Merge persons into the first id: their faces and centroids move to it, then they are deleted.
    The target keeps its name, or takes the first name among the others when it has none."""
    ids = list(dict.fromkeys(int(i) for i in params.get("ids") or []))
    if len(ids) < 2:
        raise ApiError("BAD_REQUEST", "pick at least two people to merge")
    if len({i // SHIFT for i in ids}) > 1:
        raise ApiError("BAD_REQUEST", "people on different drives can't be merged")
    lib, target = _lib(ids[0])
    others = [i % SHIFT for i in ids[1:]]
    marks = ",".join("?" * len(others))
    try:
        with lib.db() as conn:
            names = dict(conn.execute(f"SELECT id, name FROM persons WHERE id IN (?,{marks})", [target, *others]))
            if len(names) < len(ids):
                raise ApiError("NOT_FOUND", "one of those people no longer exists")
            name = next((names[p] for p in [target, *others] if names[p]), None)
            rows = conn.execute(f"SELECT vector, weight FROM person_centroids WHERE person_id IN (?,{marks})",
                                [target, *others]).fetchall()
            conn.execute(f"UPDATE person_faces SET person_id = ? WHERE person_id IN ({marks})", [target, *others])
            conn.execute(f"DELETE FROM persons WHERE id IN ({marks})", others)  # cascades their centroids
            if rows:
                _save_centroids(conn, target, np.stack([np.frombuffer(v, "<f4") for v, _ in rows]),
                                np.array([w for _, w in rows], np.float64))
            conn.execute("UPDATE persons SET name = ? WHERE id = ?", (name, target))
            conn.execute(PICK_FACE + "id = ? AND face_id IS NULL", (target,))
    except sqlite3.OperationalError as e:
        if "locked" in str(e):
            raise ApiError("BUSY", "the library is busy grouping faces. try again in a moment") from e
        raise
    return {"id": lib.gid(target)}


def list_places(params=None) -> list[dict]:
    places: dict[str, dict] = {}
    for lib in libraries():
        with lib.db() as conn:
            for label, data, n in conn.execute(
                    "SELECT r.label, min(r.data), count(DISTINCT f.media_id) FROM results r "
                    "JOIN frames f ON f.id = r.frame_id WHERE r.module = 'location' AND r.label IS NOT NULL "
                    "GROUP BY r.label"):
                d = json.loads(data or "{}")
                p = places.setdefault(label, {"name": d.get("place") or label, "lat": d.get("lat", 0),
                                              "lon": d.get("lon", 0), "count": 0})
                p["count"] += n
    return sorted(places.values(), key=lambda p: -p["count"])


def _labels() -> dict[str, int]:
    counts: dict[str, int] = {}
    for lib in libraries():
        with lib.db() as conn:
            for label, n in conn.execute(
                    "SELECT r.label, count(DISTINCT f.media_id) FROM results r JOIN frames f ON f.id = r.frame_id "
                    "WHERE r.module = 'objects' GROUP BY r.label"):
                counts[label] = counts.get(label, 0) + n
    return counts


def label_manifest(params=None) -> dict:
    labels = sorted(_labels().items(), key=lambda kv: -kv[1])
    return {"modules": [{"id": "objects", "name": "Objects",
                         "labels": [{"id": k, "name": k.title(), "count": n} for k, n in labels]}]}


def counts(params=None) -> dict:
    c = {"all": 0, "images": 0, "videos": 0, "people": 0, "places": 0, "objects": 0, "scenes": 0}
    for lib in libraries():
        with lib.db() as conn:
            for kind, n in conn.execute("SELECT kind, count(*) FROM media GROUP BY kind"):
                c["all"] += n
                c["images" if kind == "image" else "videos"] += n
    c["people"] = len(list_people())
    c["places"] = len(list_places())
    c["objects"] = len(_labels())
    return c


# ---- files for the media protocol

def resolve_media(params) -> str:
    """Absolute path of what snapsort-media://<kind>/<id> serves: the original, a JPEG for a HEIC, or a face crop."""
    kind = params["kind"]
    lib, local = _lib(params["id"])
    with lib.db() as conn:
        if kind == "face":
            row = conn.execute(
                "SELECT r.id, r.bbox, m.kind, m.path, f.path FROM persons p JOIN results r ON r.id = p.face_id "
                "JOIN frames f ON f.id = r.frame_id JOIN media m ON m.id = f.media_id WHERE p.id = ?",
                (local,)).fetchone()
            if row is None:
                raise ApiError("NOT_FOUND", "no face for that person")
            rid, bbox, mkind, mpath, fpath = row
            out = lib.data_dir / "faces.noindex" / f"{rid}.jpg"
            if not out.is_file():
                image = load_image(frame_file(lib.data_dir, lib.root, mkind, mpath, fpath))
                x, y, w, h = json.loads(bbox)
                W, H = image.size
                pad = 0.35 * max(w * W, h * H)
                cx, cy = (x + w / 2) * W, (y + h / 2) * H
                half = max(w * W, h * H) / 2 + pad
                crop = image.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
                crop.thumbnail((FACE, FACE))
                out.parent.mkdir(parents=True, exist_ok=True)
                crop.save(out, "JPEG", quality=85)
            return str(out)
        row = conn.execute("SELECT path FROM media WHERE id = ?", (local,)).fetchone()
    if row is None:
        raise ApiError("NOT_FOUND", "media not found")
    path = lib.root / row[0]
    if kind == "display" and path.suffix.lower() == ".heic":  # Chromium can't render HEIC
        out = lib.data_dir / "previews.noindex" / "display" / f"{local}.jpg"
        if not out.is_file():
            image = load_image(path)
            image.thumbnail((DISPLAY, DISPLAY))
            out.parent.mkdir(parents=True, exist_ok=True)
            image.save(out, "JPEG", quality=88)
        return str(out)
    return str(path)


METHODS = {
    "listLibraries": list_libraries, "libraryFor": library_for_path, "query": query, "getMedia": get_media,
    "getDetections": get_detections, "listPeople": list_people, "renamePerson": rename_person,
    "mergePeople": merge_people, "listPlaces": list_places, "getLabelManifest": label_manifest, "getCounts": counts,
    "resolveMedia": resolve_media,
}


def handle(req: dict) -> dict:
    rid = req.get("id")
    try:
        fn = METHODS.get(req.get("method"))
        if fn is None:
            raise ApiError("NOT_FOUND", f"unknown method {req.get('method')!r}")
        return {"id": rid, "result": fn(req.get("params") or {})}
    except ApiError as e:
        return {"id": rid, "error": {"code": e.code, "message": str(e)}}
    except QueryError as e:
        return {"id": rid, "error": {"code": "QUERY_ERROR", "message": str(e)}}
    except sqlite3.OperationalError as e:
        code = "BUSY" if "locked" in str(e) else "INTERNAL"
        return {"id": rid, "error": {"code": code, "message": str(e)}}
    except Exception as e:  # never kill the server over one request
        return {"id": rid, "error": {"code": "INTERNAL", "message": f"{type(e).__name__}: {e}"}}


def serve() -> int:
    """Read requests until stdin closes. Stray prints from libraries go to stderr, not the protocol."""
    search_mod.CACHE_MODELS = True
    sys.stdout.flush()
    proto = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)
    lock = threading.Lock()

    def reply(req):
        line = json.dumps(handle(req), allow_nan=False, default=float)
        with lock:
            proto.write(line + "\n")
            proto.flush()

    with ThreadPoolExecutor(max_workers=4) as pool:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except ValueError:
                print(f"serve: not JSON: {line[:200]}", file=sys.stderr)
                continue
            pool.submit(reply, req)
    return 0
