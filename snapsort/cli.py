"""snapsort command line."""
import argparse
import inspect
import json
import os
import signal
import sys
import traceback
from pathlib import Path

from snapsort.group import run_grouping
from snapsort.ingest import IngestError, run_ingest
from snapsort.library import root_for
from snapsort.modules import discover
from snapsort.search import (GAP, MIN_SCORE, SORTS, TEXT_MIN_SCORE, Hit, QueryError, Segment, list_people,
                             list_places, open_db, search)

DATA_DIR = Path(".snapsort")
READS = ("group", "search", "people", "places")  # commands that need an existing database


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="snapsort")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--data-dir", type=Path, default=DATA_DIR,
                        help=f"library folder (default {DATA_DIR}). media paths are stored relative to its drive")
    sub = parser.add_subparsers(dest="cmd", required=True)
    ingest = sub.add_parser("ingest", parents=[common], help="process image/video files or folders")
    ingest.add_argument("paths", nargs="+", type=Path)
    ingest.add_argument("--modules", help="comma-separated module names (default: all)")
    ingest.add_argument("--json", action="store_true", help="progress as JSON lines on stdout, logs on stderr")
    ingest.add_argument("--prune", action="store_true", help="forget files under the folders that no longer exist")
    sub.add_parser("modules", help="list discovered modules")
    sub.add_parser("group", parents=[common], help="group face results into persons")
    sub.add_parser("serve", help="JSON-lines server on stdio for the desktop app")
    s = sub.add_parser("search", parents=[common], help="find media matching every given filter")
    s.add_argument("text", nargs="?", help="describe what to find (needs clip_embed vectors)")
    s.add_argument("--person", type=_ids, help="comma-separated person ids, all in the same file (see `snapsort people`)")
    s.add_argument("--any", action="store_true", help="match any --person id instead of all")
    s.add_argument("--or", dest="any_filter", action="store_true",
                   help="match files that pass any filter instead of every filter")
    s.add_argument("--same-frame", action="store_true",
                   help="persons and similar image must match on the same frame, not anywhere in the file")
    s.add_argument("--place", help="place name (see `snapsort places`)")
    s.add_argument("--kind", choices=("image", "video"))
    s.add_argument("--from", dest="date_from", metavar="YYYY-MM-DD", help="captured on or after this day")
    s.add_argument("--to", dest="date_to", metavar="YYYY-MM-DD", help="captured on or before this day")
    similar = s.add_mutually_exclusive_group()
    similar.add_argument("--similar", type=Path, metavar="PATH", help="image to compare frames against")
    similar.add_argument("--similar-media", type=_media_ref, metavar="ID[@TS]",
                         help="stored file, and second for a video, to compare frames against")
    s.add_argument("--min-score", type=float,
                   help=f"score cutoff (default {MIN_SCORE} for --similar, {TEXT_MIN_SCORE} for text)")
    s.add_argument("--sort", choices=SORTS)
    s.add_argument("--limit", type=int)
    s.add_argument("--gap", type=float, default=GAP,
                   help=f"seconds between matches that still merge into one segment (default {GAP:g})")
    s.add_argument("--json", action="store_true")
    sub.add_parser("people", parents=[common], help="list persons: id, name, faces, files")
    sub.add_parser("places", parents=[common], help="list place names: place, files")
    args = parser.parse_args(argv)

    if args.cmd == "serve":
        from snapsort.serve import serve
        return serve()
    if args.cmd in READS:
        if not (args.data_dir / "snapsort.db").is_file():
            print(f"error: no database at {args.data_dir / 'snapsort.db'}", file=sys.stderr)
            return 2
        return (0 if _group(args.data_dir) else 1) if args.cmd == "group" else _read(args)
    try:
        modules = discover()
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if args.cmd == "modules":
        for m in modules:
            print(f"{m.name}\t{m.version}\t{inspect.getfile(type(m))}")
        return 0
    if args.modules:
        by_name = {m.name: m for m in modules}
        wanted = list(dict.fromkeys(n.strip() for n in args.modules.split(",") if n.strip()))
        unknown = [n for n in wanted if n not in by_name]
        if unknown:
            print(f"error: unknown module(s): {', '.join(unknown)}. "
                  f"available: {', '.join(by_name) or 'none'}", file=sys.stderr)
            return 2
        modules = [by_name[n] for n in wanted]
    if not modules:
        print("error: no modules to run", file=sys.stderr)
        return 2
    emit = _events() if args.json else (lambda e: None)
    end = {"event": "end", "ok": False}
    try:
        ok = run_ingest(args.paths, modules, args.data_dir, emit, args.prune)
        if any(m.name == "faces" for m in modules):  # the frontend expects people to refresh when ingest ends
            emit({"event": "grouping"})
            ok = _group(args.data_dir) and ok
        end["ok"] = ok
        return 0 if ok else 1
    except IngestError as e:
        print(f"error: {e}", file=sys.stderr)
        end.update(code=e.code, message=str(e))
        return 2
    except Exception as e:  # SystemExit from SIGTERM is not an Exception: a cancel ends without a code
        traceback.print_exc()
        if not args.data_dir.exists():  # the drive was pulled; its database is intact, a rescan resumes
            end.update(code="DRIVE_GONE", message="the drive was disconnected")
        else:
            end.update(code="INGEST_FAILED", message=f"{type(e).__name__}: {e}")
        return 1
    finally:
        emit(end)


def _events():
    """Under --json: protocol lines go to the real stdout, and everything else printed (ours, ffmpeg's,
    model loaders') goes to stderr. SIGTERM exits through finally blocks, so ffmpeg is killed and end is sent."""
    sys.stdout.flush()
    proto = os.fdopen(os.dup(1), "w", buffering=1)
    os.dup2(2, 1)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    return lambda e: (proto.write(json.dumps(e, allow_nan=False) + "\n"), proto.flush())


def _group(data_dir: Path) -> bool:
    """Run grouping and print its one-line summary. False if it failed, in which case nothing was written."""
    try:
        s = run_grouping(data_dir)
    except Exception as e:
        print(f"error: grouping failed: {type(e).__name__}: {e}", file=sys.stderr)
        return False
    print(f"grouping  {s.faces} faces  {s.new_persons} new persons  {s.joined} joined existing")
    return True


def _read(args) -> int:
    """search, people and places. 2 on a QueryError."""
    conn = open_db(args.data_dir)
    root = root_for(args.data_dir)
    try:
        if args.cmd == "people":
            for pid, name, faces, files in list_people(conn):
                print(f"{pid}\t{name or ''}\t{faces}\t{files}")
            return 0
        if args.cmd == "places":
            for name, files in list_places(conn):
                print(f"{name}\t{files}")
            return 0
        filters = []
        if args.person is not None:
            filters.append({"kind": "person", "ids": args.person, "match": "any" if args.any else "all"})
        if args.place is not None:
            filters.append({"kind": "place", "name": args.place})
        if args.kind:
            filters.append({"kind": "mediaKind", "value": args.kind})
        if args.date_from is not None or args.date_to is not None:
            filters.append({"kind": "date", "from": args.date_from, "to": args.date_to})
        similar = {"path": str(args.similar)} if args.similar else args.similar_media
        try:
            hits = search(conn, filters, similar, min_score=args.min_score, sort=args.sort, limit=args.limit,
                          gap=args.gap, combine="any" if args.any_filter else "all",
                          scope="frame" if args.same_frame else "file", q=args.text)
        except QueryError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        total = conn.execute("SELECT count(*) FROM media").fetchone()[0]
    finally:
        conn.close()
    for h in hits:
        h.path = str(root / h.path)
    if args.json:
        print(json.dumps([_json(h) for h in hits], ensure_ascii=False))
        return 0
    for h in hits:
        cols = [h.path, h.kind]
        if similar or args.text is not None:
            cols.append("-" if h.score is None else f"{h.score:.2f}")  # unscored: matched another filter under --or
        if h.segments:
            cols.append(", ".join(_span(g) for g in h.segments))
        print("  ".join(cols))
    print(f"{len(hits)} of {total} files")
    return 0


def _ids(s: str) -> list[int]:
    try:
        return [int(x) for x in s.split(",") if x.strip()]
    except ValueError:
        raise argparse.ArgumentTypeError(
            f"expected comma-separated person ids, got {s!r}. see snapsort people") from None


def _media_ref(s: str) -> dict:
    mid, sep, ts = s.partition("@")
    try:
        return {"mediaId": int(mid), "ts": float(ts)} if sep else {"mediaId": int(mid)}
    except ValueError:
        raise argparse.ArgumentTypeError(f"expected ID or ID@SECONDS, got {s!r}") from None


def _clock(t: float) -> str:
    """Seconds as m:ss, or h:mm:ss from one hour on."""
    t = int(t)
    h, m, s = t // 3600, t // 60 % 60, t % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _span(seg: Segment) -> str:
    return _clock(seg.start) if seg.start == seg.end else f"{_clock(seg.start)}–{_clock(seg.end)}"


def _json(h: Hit) -> dict:
    """A Hit with the frontend contract's field names where they overlap."""
    return {"id": h.media_id, "kind": h.kind, "path": h.path, "name": Path(h.path).name, "addedAt": h.added_at,
            "capturedAt": h.captured_at,
            "score": h.score, "matches": [{"ts": t, "score": s} for t, s in h.matches],
            "segments": [{"start": g.start, "end": g.end, "score": g.score} for g in h.segments],
            "bestFrameTs": h.best_ts}
