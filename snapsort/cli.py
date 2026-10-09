"""snapsort command line."""
import argparse
import inspect
import sys
from pathlib import Path

from snapsort.ingest import run_ingest
from snapsort.modules import discover

DATA_DIR = Path(".snapsort")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="snapsort")
    sub = parser.add_subparsers(dest="cmd", required=True)
    ingest = sub.add_parser("ingest", help="process image/video files or folders")
    ingest.add_argument("paths", nargs="+", type=Path)
    ingest.add_argument("--modules", help="comma-separated module names (default: all)")
    sub.add_parser("modules", help="list discovered modules")
    search_p = sub.add_parser("search", help="rank media by text query")
    search_p.add_argument("query", help="natural-language description")
    search_p.add_argument("--limit", type=int, default=10, help="max hits (default: 10)")
    args = parser.parse_args(argv)

    if args.cmd == "search":
        try:
            # Imported here so other commands don't need clip_embed's deps (torch etc.).
            from snapsort.search import search
            hits = search(args.query, DATA_DIR, limit=args.limit)
        except (FileNotFoundError, LookupError) as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        except Exception as e:
            print(f"error: {type(e).__name__}: {e}", file=sys.stderr)
            return 1
        for h in hits:
            ts = "" if h.ts is None else f"\tts={h.ts:.3f}"
            print(f"{h.score:.4f}\t{h.path}\tframe={h.frame_idx}{ts}")
        return 0

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
    return 0 if run_ingest(args.paths, modules, DATA_DIR) else 1
