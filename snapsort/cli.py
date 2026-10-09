"""snapsort command line."""
import argparse
import inspect
import sys
from pathlib import Path

from snapsort.group import run_grouping
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
    sub.add_parser("group", help="group face results into persons")
    args = parser.parse_args(argv)

    if args.cmd == "group":
        if not (DATA_DIR / "snapsort.db").is_file():
            print(f"error: no database at {DATA_DIR / 'snapsort.db'}", file=sys.stderr)
            return 2
        return 0 if _group() else 1
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
    ok = run_ingest(args.paths, modules, DATA_DIR)
    if any(m.name == "faces" for m in modules):  # the frontend expects people to refresh when ingest ends
        ok = _group() and ok
    return 0 if ok else 1


def _group() -> bool:
    """Run grouping and print its one-line summary. False if it failed, in which case nothing was written."""
    try:
        s = run_grouping(DATA_DIR)
    except Exception as e:
        print(f"error: grouping failed: {type(e).__name__}: {e}", file=sys.stderr)
        return False
    print(f"grouping  {s.faces} faces  {s.new_persons} new persons  {s.joined} joined existing")
    return True
