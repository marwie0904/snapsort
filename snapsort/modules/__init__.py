"""Module discovery. Every file in this package not starting with "_" is imported and each
Module subclass defined in it is instantiated. Add a file to add a module; rename it to
_<name>.py to disable it; delete it to remove it."""
import importlib
import inspect
import pkgutil
import re
import sys

from snapsort.contract import Module

NAME = re.compile(r"[a-z0-9_]+")


def discover(package: str = __name__) -> list[Module]:
    """Instances of every Module in the package, sorted by name. A file that fails to import
    is skipped with a warning. Raises ValueError on an invalid or duplicate name."""
    pkg = importlib.import_module(package)
    found: list[Module] = []
    for info in pkgutil.iter_modules(pkg.__path__):
        if info.name.startswith("_"):
            continue
        try:
            mod = importlib.import_module(f"{package}.{info.name}")
        except Exception as e:
            print(f"warning: {info.name}.py failed to import, skipped: {type(e).__name__}: {e}",
                  file=sys.stderr)
            continue
        found += [cls() for _, cls in inspect.getmembers(mod, inspect.isclass)
                  if issubclass(cls, Module) and cls is not Module and cls.__module__ == mod.__name__]
    names = [getattr(m, "name", None) for m in found]
    bad = [n for n in names if not isinstance(n, str) or not NAME.fullmatch(n)]
    if bad:
        raise ValueError(f"invalid module name(s) {bad}: must match [a-z0-9_]+")
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        raise ValueError(f"duplicate module name(s): {', '.join(dupes)}")
    return sorted(found, key=lambda m: m.name)
