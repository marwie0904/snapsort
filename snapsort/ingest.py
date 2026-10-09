"""Ingest: resolve inputs, extract frames, run modules, validate and store results."""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pillow_heif
from PIL import Image, ImageOps

from snapsort.contract import Frame, Module, Result
from snapsort.library import ensure_library, root_for

pillow_heif.register_heif_opener()

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}
FPS = 1
BATCH = 16
PREVIEW = 512
JUNK = {"$RECYCLE.BIN", "System Volume Information"}
PACKAGES = (".photoslibrary", ".photolibrary", ".fcpbundle", ".imovielibrary")  # app libraries: duplicates
DATALESS = 0x40000000  # SF_DATALESS: in iCloud, reading it starts a download
MIN_FREE = 500 * 1024 ** 2  # stop before a file when the library's drive has less free: an hour of video takes ~1 GB

SCHEMA = """
CREATE TABLE IF NOT EXISTS media (
  id       INTEGER PRIMARY KEY,
  path     TEXT NOT NULL UNIQUE,
  kind     TEXT NOT NULL CHECK (kind IN ('image','video')),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS frames (
  id       INTEGER PRIMARY KEY,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  idx      INTEGER NOT NULL,
  ts       REAL,
  path     TEXT NOT NULL,
  UNIQUE (media_id, idx)
);
CREATE TABLE IF NOT EXISTS results (
  id       INTEGER PRIMARY KEY,
  frame_id INTEGER NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
  module   TEXT NOT NULL,
  label    TEXT,
  score    REAL,
  bbox     TEXT,
  vector   BLOB,
  data     TEXT
);
CREATE INDEX IF NOT EXISTS results_module_label ON results(module, label);
CREATE INDEX IF NOT EXISTS results_module_frame ON results(module, frame_id);
CREATE INDEX IF NOT EXISTS results_frame ON results(frame_id);  -- deleting media scans results by frame
CREATE TABLE IF NOT EXISTS sources (
  id       INTEGER PRIMARY KEY,
  path     TEXT NOT NULL UNIQUE,   -- folder given to ingest, relative to the library root
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS runs (
  media_id    INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  version     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('done','error')),
  error       TEXT,
  finished_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (media_id, module)
);
"""


class ContractError(Exception):
    """A module returned output that breaks the contract."""


class SetupError(Exception):
    """A module's setup() raised."""


def _is_num(v) -> bool:
    return isinstance(v, (int, float, np.integer, np.floating)) and not isinstance(v, (bool, np.bool_))


def validate(results: list[Result], frames: list[Frame]) -> list[Result]:
    """Check results against the contract. Returns normalized copies or raises ContractError."""
    if not isinstance(results, list):
        raise ContractError(f"process() must return a list, got {type(results).__name__}")
    idxs = {f.idx for f in frames}
    out, dim = [], None
    for r in results:
        if not isinstance(r, Result):
            raise ContractError(f"expected Result, got {type(r).__name__}")
        if r.frame_idx not in idxs:
            raise ContractError(f"frame_idx {r.frame_idx} is not in this batch")
        label = r.label
        if label is not None:
            if not isinstance(label, str):
                raise ContractError(f"label must be str, got {type(label).__name__}")
            label = label.strip().lower()
        if r.score is not None and not (_is_num(r.score) and 0 <= r.score <= 1):
            raise ContractError(f"score must be a number in [0, 1], got {r.score!r}")
        bbox = r.bbox
        if bbox is not None:
            if not isinstance(bbox, (tuple, list, np.ndarray)) or len(bbox) != 4 \
                    or not all(_is_num(v) and 0 <= v <= 1 for v in bbox):
                raise ContractError(f"bbox must be 4 numbers in [0, 1], got {bbox!r}")
            bbox = tuple(float(v) for v in bbox)
        vector = r.vector
        if vector is not None:
            if not isinstance(vector, np.ndarray) or vector.ndim != 1 or vector.size == 0 \
                    or not (np.issubdtype(vector.dtype, np.integer) or np.issubdtype(vector.dtype, np.floating)):
                raise ContractError("vector must be a non-empty 1-D numeric np.ndarray")
            vector = vector.astype("<f4")
            if not np.isfinite(vector).all():
                raise ContractError("vector has NaN or inf values")
            if dim is None:
                dim = vector.size
            elif vector.size != dim:
                raise ContractError(f"vector dim {vector.size} != {dim} in the same output")
        if r.data is not None:
            if not isinstance(r.data, dict):
                raise ContractError(f"data must be a dict, got {type(r.data).__name__}")
            try:
                json.dumps(r.data, allow_nan=False)  # NaN isn't JSON: the app's reader would fail on it
            except (TypeError, ValueError) as e:
                raise ContractError(f"data is not JSON-serializable: {e}") from e
        score = None if r.score is None else float(r.score)
        out.append(Result(int(r.frame_idx), label, score, bbox, vector, r.data))
    return out


def classify(path: Path) -> str | None:
    """'image', 'video', or None for unsupported extensions."""
    ext = path.suffix.lower()
    return "image" if ext in IMAGE_EXTS else "video" if ext in VIDEO_EXTS else None


def resolve_paths(paths: list[Path], exclude: Path | None = None, errors: list | None = None) -> list[Path]:
    """Absolute file paths to process. Explicit files are kept as given (even unsupported or
    missing, so the runner can report them). Directories are recursed, keeping supported files
    and ignoring dot files and folders, `exclude` (the library's own data dir), junk folders,
    app library packages and iCloud files not downloaded. Unreadable subfolders go to `errors`."""
    out = []
    for p in paths:
        p = p.resolve()
        if not p.is_dir():
            out.append(p)
            continue
        found = []
        for dirpath, dirnames, filenames in os.walk(p, onerror=None if errors is None else errors.append):
            d = Path(dirpath)
            dirnames[:] = [n for n in dirnames if not n.startswith(".") and n not in JUNK
                           and not n.lower().endswith(PACKAGES) and d / n != exclude]
            for n in filenames:
                f = d / n
                if not n.startswith(".") and classify(f) and f.is_file() and not os.stat(f).st_flags & DATALESS:
                    found.append(f)
        out += sorted(found)
    return out


def load_image(path: str | Path) -> Image.Image:
    """Decode any supported image (HEIC included) as upright RGB."""
    with Image.open(path) as im:
        return ImageOps.exif_transpose(im).convert("RGB")


def dense_keyframes(video: Path) -> bool:
    """True if the first 30 s have a keyframe at least every 1/FPS s (reads packet flags, no
    decoding). Then decoding only keyframes still yields every sample, at a fraction of the cost:
    DJI clips have one every 0.5 s. Sparse keyframes (x264's default allows 10 s) need a full decode."""
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-read_intervals", "%+30",
         "-show_entries", "packet=pts_time,flags", "-of", "csv=p=0", str(video)],
        capture_output=True, text=True,
    )
    rows = [line.split(",") for line in proc.stdout.splitlines() if "," in line]
    keys = sorted(float(r[0]) for r in rows if "K" in r[1] and r[0] != "N/A")
    return len(keys) > 1 and max(b - a for a, b in zip(keys, keys[1:])) <= 1 / FPS + 0.01


def extract_frames(video: Path, out: Path) -> list[Path]:
    """Write one JPEG per second of video to out/<idx:06d>.jpg (idx from 0). Returns them in order.
    Raises RuntimeError and leaves no out dir if ffmpeg fails or yields no frames."""
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    if dense_keyframes(video):
        # On keyframe-only input, fps drops the last sample at EOF unless told to pass it through.
        skip, vf = ["-skip_frame", "nokey"], f"fps={FPS}:eof_action=pass"
    else:
        skip, vf = [], f"fps={FPS}"
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", *skip, "-i", str(video), "-vf", vf, "-q:v", "2",
         "-start_number", "0", str(out / "%06d.jpg")],
        capture_output=True, text=True,
    )
    files = sorted(out.glob("[0-9]*.jpg"))  # not the ._*.jpg AppleDouble files macOS adds on exFAT/FAT
    if proc.returncode or not files:
        shutil.rmtree(out, ignore_errors=True)
        lines = proc.stderr.strip().splitlines()
        raise RuntimeError(lines[-1] if lines else "ffmpeg produced no frames")
    return files


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


class IngestError(Exception):
    """The whole run can't start. code is one of the frontend's error codes."""
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def run_ingest(paths: list[Path], modules: list[Module], data_dir: Path, progress=None,
               prune: bool = False) -> bool:
    """Process every file with every module that hasn't run on it at its current version.
    progress(event) gets {"event": "start" | "file", ...} dicts. prune deletes media under the given
    folders whose file is gone, unless a subfolder couldn't be read. Returns True if every file and
    module succeeded. Raises IngestError if an input is outside the library or unreadable."""
    progress = progress or (lambda e: None)
    root = root_for(data_dir)
    for p in paths:
        p = p.resolve()
        if p != root and root not in p.parents:
            raise IngestError("OUTSIDE_LIBRARY", f"{p} is not under the library root {root}")
        if p.is_dir():
            try:  # listing catches a macOS privacy (TCC) denial too, which os.access doesn't see
                with os.scandir(p) as it:
                    next(it, None)
            except PermissionError as e:
                raise IngestError("PERMISSION_DENIED", f"can't read {p}: {e.strerror}. "
                                  "allow access in System Settings > Privacy & Security") from e
    try:
        ensure_library(data_dir)
    except OSError as e:
        raise IngestError("READ_ONLY", f"can't write {data_dir}: {e}") from e
    conn = connect(data_dir / "snapsort.db")
    active: list[Module] = list(modules)   # modules whose setup() fails are removed
    ready: set[str] = set()                # modules whose setup() has run
    dims: dict[str, int] = {}              # vector dim per module, fixed for the run
    ok = True
    try:
        dirs = [p.resolve() for p in paths if p.is_dir()]
        with conn:
            conn.executemany("INSERT OR IGNORE INTO sources (path) VALUES (?)",
                             [(_rel(d, root),) for d in dirs])
        unreadable: list[OSError] = []
        files = resolve_paths(paths, data_dir.resolve(), unreadable)
        progress({"event": "start", "total": len(files)})
        with ThreadPoolExecutor(max_workers=max(1, len(modules))) as pool:
            for i, path in enumerate(files):
                if not active:
                    print("error: no modules left to run", file=sys.stderr)
                    return False
                free = shutil.disk_usage(data_dir).free
                if free < MIN_FREE:
                    raise IngestError("DISK_FULL", f"only {free // 1024 ** 2} MB free on the library's drive. "
                                      "free some space, then rescan")
                done = _ingest_file(conn, pool, path, active, ready, dims, data_dir, root)
                ok &= done
                progress({"event": "file", "done": i + 1, "total": len(files), "path": str(path), "ok": done})
        if unreadable:
            ok = False
            for e in unreadable:
                print(f"skip {e.filename} (can't read: {e.strerror})", file=sys.stderr)
            progress({"event": "error", "code": "PERMISSION_DENIED",
                      "message": f"couldn't read {len(unreadable)} folder(s), e.g. {unreadable[0].filename}. "
                                 "nothing was removed"})
        elif prune:
            _prune(conn, dirs, data_dir, root)
    finally:
        conn.close()
    return ok


def _rel(path: Path, root: Path) -> str:
    """A path as stored: relative to the library root, "" for the root itself."""
    rel = path.relative_to(root).as_posix()
    return "" if rel == "." else rel


def frame_file(data_dir: Path, root: Path, kind: str, media_path: str, frame_path: str) -> Path:
    """The image file of a frame: the original for an image, the extracted JPEG for a video."""
    return root / media_path if kind == "image" else data_dir / frame_path


def preview_file(data_dir: Path, media_id: int, idx: int) -> Path:
    return data_dir / "previews.noindex" / str(media_id) / f"{idx:06d}.jpg"


def _preview(image: Image.Image, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    small = image.copy()
    small.thumbnail((PREVIEW, PREVIEW))
    small.save(out, "JPEG", quality=82)


def _prune(conn, dirs: list[Path], data_dir: Path, root: Path) -> None:
    """Delete media under dirs whose file no longer exists, with their frames and previews."""
    gone = []
    for d in dirs:
        prefix = _rel(d, root)
        rows = conn.execute("SELECT id, path FROM media").fetchall() if not prefix else conn.execute(
            "SELECT id, path FROM media WHERE path = ? OR substr(path, 1, ?) = ?",
            (prefix, len(prefix) + 1, prefix + "/")).fetchall()
        gone += [mid for mid, p in rows if not (root / p).exists()]
    with conn:
        conn.executemany("DELETE FROM media WHERE id = ?", [(m,) for m in gone])
    for m in gone:
        shutil.rmtree(data_dir / "frames.noindex" / str(m), ignore_errors=True)
        shutil.rmtree(data_dir / "previews.noindex" / str(m), ignore_errors=True)
    if gone:
        print(f"pruned {len(gone)} missing files")


def _ingest_file(conn, pool, path, active, ready, dims, data_dir, root) -> bool:
    if not path.is_file():
        return _skip(path, "not found")
    kind = classify(path)
    if kind is None:
        return _skip(path, "unsupported file type")
    rel = _rel(path, root)
    row = conn.execute("SELECT id FROM media WHERE path = ?", (rel,)).fetchone()
    if row:
        media_id = row[0]
        pending = _pending(conn, media_id, active)
        if not pending:
            print(f"{path}  up to date")
            return True
    else:
        pending = list(active)
        try:
            media_id = _register(conn, path, rel, kind, data_dir)
        except Exception as e:
            return _skip(path, _msg(e))

    frames = conn.execute(
        "SELECT id, idx, ts, path FROM frames WHERE media_id = ? ORDER BY idx", (media_id,)
    ).fetchall()
    results: dict[str, list[Result]] = {m.name: [] for m in pending}
    errors: dict[str, str] = {}
    ok = True
    for i in range(0, len(frames), BATCH):
        try:
            batch = [Frame(media_id, str(path), kind, idx, ts, load_image(frame_file(data_dir, root, kind, rel, fp)))
                     for _, idx, ts, fp in frames[i:i + BATCH]]
            for f in batch:
                out = preview_file(data_dir, media_id, f.idx)
                if not out.is_file():
                    _preview(f.image, out)
        except Exception as e:
            # forget the file so the next run extracts it again: frames can be missing after a drive was pulled
            with conn:
                conn.execute("DELETE FROM media WHERE id = ?", (media_id,))
            shutil.rmtree(data_dir / "frames.noindex" / str(media_id), ignore_errors=True)
            shutil.rmtree(data_dir / "previews.noindex" / str(media_id), ignore_errors=True)
            return _skip(path, f"cannot read frame: {_msg(e)}")
        futures = {m: pool.submit(_call, m, batch, ready)
                   for m in pending if m in active and m.name not in errors}
        for m, fut in futures.items():
            try:
                out = validate(fut.result(), batch)
                _check_dim(out, dims, m.name)
                results[m.name] += out
            except SetupError as e:
                active.remove(m)
                ok = False
                print(f"warning: {m.name} setup failed, dropped for this run: {e}", file=sys.stderr)
            except Exception as e:
                errors[m.name] = _msg(e)

    frame_ids = {idx: fid for fid, idx, _, _ in frames}
    status = []
    for m in pending:
        if m not in active:
            continue
        err = errors.get(m.name)
        _write(conn, media_id, frame_ids, m, results[m.name], err)
        status.append(f"{m.name}:done" if err is None else f"{m.name}:error({err})")
        ok = ok and err is None
    print(f"{path}  {len(frames)} frames  {' '.join(status)}")
    return ok


def _pending(conn, media_id: int, modules: list[Module]) -> list[Module]:
    done = dict(conn.execute(
        "SELECT module, version FROM runs WHERE media_id = ? AND status = 'done'", (media_id,)
    ).fetchall())
    return [m for m in modules if done.get(m.name) != m.version]


def _register(conn, path: Path, rel: str, kind: str, data_dir: Path) -> int:
    """Insert the media row and its frames in one transaction. Raises if extraction fails.
    Frame paths are stored relative: the media path for an image, the data dir for a video."""
    with conn:
        media_id = conn.execute(
            "INSERT INTO media (path, kind) VALUES (?, ?)", (rel, kind)
        ).lastrowid
        if kind == "image":
            rows = [(media_id, 0, None, rel)]
        else:
            shutil.rmtree(data_dir / "previews.noindex" / str(media_id), ignore_errors=True)  # a reused id's
            files = extract_frames(path, data_dir / "frames.noindex" / str(media_id))
            rows = [(media_id, i, i / FPS, f.relative_to(data_dir).as_posix()) for i, f in enumerate(files)]
        conn.executemany("INSERT INTO frames (media_id, idx, ts, path) VALUES (?, ?, ?, ?)", rows)
    return media_id


def _call(module: Module, batch: list[Frame], ready: set[str]) -> list[Result]:
    """Runs in a worker thread. setup() happens lazily before the module's first batch."""
    if module.name not in ready:
        try:
            module.setup()
        except Exception as e:
            raise SetupError(_msg(e)) from e
        ready.add(module.name)
    return module.process(batch)


def _check_dim(results: list[Result], dims: dict[str, int], name: str) -> None:
    for r in results:
        if r.vector is not None and dims.setdefault(name, r.vector.size) != r.vector.size:
            raise ContractError(f"vector dim {r.vector.size} != {dims[name]} earlier in this run")


def _write(conn, media_id: int, frame_ids: dict[int, int], module: Module,
           results: list[Result], error: str | None) -> None:
    with conn:
        if error is None:
            conn.execute(
                "DELETE FROM results WHERE module = ? AND frame_id IN "
                "(SELECT id FROM frames WHERE media_id = ?)", (module.name, media_id))
            conn.executemany(
                "INSERT INTO results (frame_id, module, label, score, bbox, vector, data) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(frame_ids[r.frame_idx], module.name, r.label, r.score,
                  None if r.bbox is None else json.dumps(r.bbox),
                  None if r.vector is None else r.vector.tobytes(),
                  None if r.data is None else json.dumps(r.data, allow_nan=False)) for r in results])
        conn.execute(
            "INSERT OR REPLACE INTO runs (media_id, module, version, status, error) "
            "VALUES (?, ?, ?, ?, ?)",
            (media_id, module.name, module.version, "done" if error is None else "error", error))


def _skip(path: Path, reason: str) -> bool:
    print(f"skip {path} ({reason})", file=sys.stderr)
    return False


def _msg(e: Exception) -> str:
    return f"{type(e).__name__}: {e}"
