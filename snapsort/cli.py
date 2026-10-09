"""snapsort command line."""
import argparse
import inspect
import sys
from pathlib import Path

from snapsort.ingest import run_ingest
from snapsort.modules import discover

DATA_DIR = Path(".snapsort")


def format_match(m) -> str:
    """One output line for a search Match: score, path, and m:ss of the best frame for videos."""
    at = "" if m.ts is None else f" @ {int(m.ts) // 60}:{int(m.ts) % 60:02d}"
    return f"{m.score:.3f}  {m.path}{at}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="snapsort")
    sub = parser.add_subparsers(dest="cmd", required=True)
    ingest = sub.add_parser("ingest", help="process image/video files or folders")
    ingest.add_argument("paths", nargs="+", type=Path)
    ingest.add_argument("--modules", help="comma-separated module names (default: all)")
    sub.add_parser("modules", help="list discovered modules")
    search_cmd = sub.add_parser("search", help="find media that look like an image")
    search_cmd.add_argument("query", type=Path)
    search_cmd.add_argument("--limit", type=int, default=20)
    search_cmd.add_argument("--min-score", type=float, default=0.5)
    args = parser.parse_args(argv)

    if args.cmd == "search":
        # Imported here so a disabled or broken image_embed module can't break `ingest`.
        from snapsort.search import SearchError, search
        try:
            matches = search(args.query, DATA_DIR, args.limit, args.min_score)
        except SearchError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        if not matches:
            print(f"no matches at or above {args.min_score:.2f}")
        for m in matches:
            print(format_match(m))
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
