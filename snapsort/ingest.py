"""Ingest: resolve inputs, extract frames, run modules, validate and store results."""
import json
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

pillow_heif.register_heif_opener()

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".webm"}
FPS = 1
BATCH = 16

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
                json.dumps(r.data)
            except (TypeError, ValueError) as e:
                raise ContractError(f"data is not JSON-serializable: {e}") from e
        score = None if r.score is None else float(r.score)
        out.append(Result(int(r.frame_idx), label, score, bbox, vector, r.data))
    return out


def classify(path: Path) -> str | None:
    """'image', 'video', or None for unsupported extensions."""
    ext = path.suffix.lower()
    return "image" if ext in IMAGE_EXTS else "video" if ext in VIDEO_EXTS else None


def resolve_paths(paths: list[Path]) -> list[Path]:
    """Absolute file paths to process. Explicit files are kept as given (even unsupported or
    missing, so the runner can report them). Directories are recursed, keeping supported files
    and ignoring anything under a dot-folder below the directory."""
    out = []
    for p in paths:
        p = p.resolve()
        if p.is_dir():
            out += sorted(
                f for f in p.rglob("*")
                if f.is_file() and classify(f)
                and not any(part.startswith(".") for part in f.relative_to(p).parts)
            )
        else:
            out.append(p)
    return out


def load_image(path: str | Path) -> Image.Image:
    """Decode any supported image (HEIC included) as upright RGB."""
    with Image.open(path) as im:
        return ImageOps.exif_transpose(im).convert("RGB")


def extract_frames(video: Path, out: Path) -> list[Path]:
    """Write one JPEG per second of video to out/<idx:06d>.jpg (idx from 0). Returns them in order.
    Raises RuntimeError and leaves no out dir if ffmpeg fails or yields no frames."""
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-i", str(video), "-vf", f"fps={FPS}", "-q:v", "2",
         "-start_number", "0", str(out / "%06d.jpg")],
        capture_output=True, text=True,
    )
    files = sorted(out.glob("*.jpg"))
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


def run_ingest(paths: list[Path], modules: list[Module], data_dir: Path) -> bool:
    """Process every file with every module that hasn't run on it at its current version.
    Returns True if every file and module succeeded."""
    data_dir.mkdir(parents=True, exist_ok=True)
    conn = connect(data_dir / "snapsort.db")
    active: list[Module] = list(modules)   # modules whose setup() fails are removed
    ready: set[str] = set()                # modules whose setup() has run
    dims: dict[str, int] = {}              # vector dim per module, fixed for the run
    ok = True
    try:
        with ThreadPoolExecutor(max_workers=max(1, len(modules))) as pool:
            for path in resolve_paths(paths):
                if not active:
                    print("error: no modules left to run", file=sys.stderr)
                    return False
                ok &= _ingest_file(conn, pool, path, active, ready, dims, data_dir / "frames")
    finally:
        conn.close()
    return ok


def _ingest_file(conn, pool, path, active, ready, dims, frames_root) -> bool:
    if not path.is_file():
        return _skip(path, "not found")
    kind = classify(path)
    if kind is None:
        return _skip(path, "unsupported file type")
    row = conn.execute("SELECT id FROM media WHERE path = ?", (str(path),)).fetchone()
    if row:
        media_id = row[0]
        pending = _pending(conn, media_id, active)
        if not pending:
            print(f"{path}  up to date")
            return True
    else:
        pending = list(active)
        try:
            media_id = _register(conn, path, kind, frames_root)
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
            batch = [Frame(media_id, str(path), kind, idx, ts, load_image(fp))
                     for _, idx, ts, fp in frames[i:i + BATCH]]
        except Exception as e:
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


def _register(conn, path: Path, kind: str, frames_root: Path) -> int:
    """Insert the media row and its frames in one transaction. Raises if extraction fails."""
    with conn:
        media_id = conn.execute(
            "INSERT INTO media (path, kind) VALUES (?, ?)", (str(path), kind)
        ).lastrowid
        if kind == "image":
            load_image(path)
            rows = [(media_id, 0, None, str(path))]
        else:
            files = extract_frames(path, frames_root / str(media_id))
            rows = [(media_id, i, i / FPS, str(f)) for i, f in enumerate(files)]
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
                  None if r.data is None else json.dumps(r.data)) for r in results])
        conn.execute(
            "INSERT OR REPLACE INTO runs (media_id, module, version, status, error) "
            "VALUES (?, ?, ?, ?, ?)",
            (media_id, module.name, module.version, "done" if error is None else "error", error))


def _skip(path: Path, reason: str) -> bool:
    print(f"skip {path} ({reason})", file=sys.stderr)
    return False


def _msg(e: Exception) -> str:
    return f"{type(e).__name__}: {e}"
