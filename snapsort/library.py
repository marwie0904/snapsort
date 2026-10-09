"""Where libraries live. One per drive: <drive>/snapsort/ on external volumes, Application Support for the
internal disk. Media paths are stored relative to the library root, so a drive can mount anywhere."""
import json
import os
import uuid
from pathlib import Path

# the internal disk's library; SNAPSORT_INTERNAL_DATA moves it, e.g. for tests
INTERNAL_DATA = Path(os.environ.get("SNAPSORT_INTERNAL_DATA") or Path.home() / "Library" / "Application Support" / "snapsort")
VOLUMES = Path("/Volumes")


def root_for(data_dir: Path) -> Path:
    """The folder media paths are relative to: the drive for <drive>/snapsort, else /."""
    d = data_dir.resolve()
    return d.parent if d.name == "snapsort" and d != INTERNAL_DATA.resolve() else Path("/")


def library_for(path: Path) -> Path:
    """The data dir of the library a file or folder belongs to."""
    p = path.resolve()
    if p.parts[:2] == ("/", "Volumes") and len(p.parts) > 2:
        return VOLUMES / p.parts[2] / "snapsort"
    return INTERNAL_DATA


def ensure_library(data_dir: Path) -> str:
    """Create the data dir and library.json if missing. Returns the library id."""
    data_dir.mkdir(parents=True, exist_ok=True)
    f = data_dir / "library.json"
    if not f.is_file():
        f.write_text(json.dumps({"id": str(uuid.uuid4()), "version": 1}))
    return read_id(data_dir)


def read_id(data_dir: Path) -> str:
    return json.loads((data_dir / "library.json").read_text())["id"]


def mounted() -> list[Path]:
    """Data dirs of every library on a mounted drive, internal first."""
    out = [INTERNAL_DATA] if (INTERNAL_DATA / "library.json").is_file() else []
    try:
        vols = sorted(VOLUMES.iterdir())
    except OSError:
        vols = []
    for v in vols:
        if not v.is_symlink() and (v / "snapsort" / "library.json").is_file():  # skips "Macintosh HD" -> /
            out.append(v / "snapsort")
    return out


def disk_usage(path: Path) -> tuple[int, int]:
    """(total, free) bytes of the filesystem holding path."""
    st = os.statvfs(path)
    return st.f_blocks * st.f_frsize, st.f_bavail * st.f_frsize
