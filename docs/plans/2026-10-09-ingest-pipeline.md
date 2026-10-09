# Ingest Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `snapsort ingest`: a CLI that turns image and video files into frames (1 per second for video), runs them through pluggable modules concurrently, and stores validated results in SQLite.

**Architecture:** One Python process. `snapsort/contract.py` defines the `Frame`/`Result`/`Module` interface. `snapsort/ingest.py` resolves inputs, extracts frames with ffmpeg, runs each batch of 16 frames through all pending modules on a thread pool, validates outputs, and owns every DB write. `snapsort/modules/` auto-discovers module files, and `snapsort/cli.py` wires it together.

**Tech Stack:** Python 3.12, uv, ffmpeg (subprocess), Pillow + pillow-heif, numpy, stdlib sqlite3 / concurrent.futures / argparse / pkgutil, pytest.

**Spec:** `docs/design/2026-10-09-ingest-pipeline.md`

## Global Constraints

- macOS on Apple Silicon only. `ffmpeg` must be on PATH (`brew install ffmpeg`).
- Python 3.12, pinned in `.python-version`, with `requires-python = ">=3.12"`. All commands run through `uv run`.
- Runtime dependencies are exactly `numpy`, `pillow` and `pillow-heif`. The only dev dependency is `pytest`. Add nothing else.
- Fixed values: `FPS = 1`, `BATCH = 16`, data dir `.snapsort/` in the current working directory.
- Images: `.jpg .jpeg .png .webp .heic`. Videos: `.mp4 .mov .m4v .mkv .webm`. Both are matched case-insensitively.
- Module names match `[a-z0-9_]+`.
- Modules never write to the DB or to files. The runner owns all writes.
- Exit codes: 0 when everything succeeded. 1 when any file was skipped or any module errored. 2 for configuration errors (invalid or duplicate module names, unknown `--modules` name, no modules).
- Commit messages have no `Co-Authored-By` lines.

## Review Focus

1. `snapsort ingest .` run from the project root must not ingest its own `.snapsort/frames`. Tested by `test_ingest_dot_ignores_own_data_dir` (Task 3) and `test_resolve_paths_recurses_and_filters_directories` (Task 2).
2. A teammate's module file whose dependency isn't installed must not break `ingest` for everyone. It is skipped with a warning. Tested by `test_skips_underscore_files_and_broken_imports` (Task 4).
3. A corrupt or truncated video is skipped and leaves no `media` row and no frame dir, so the next run retries cleanly. Tested by `test_missing_unsupported_and_corrupt_files_skipped` (Task 3) and `test_extract_frames_fails_cleanly_on_garbage` (Task 2).
4. A module whose model fails to load in `setup()` (for example, weights can't download) lets the other modules finish. Nothing is recorded for the failed module, so the next run retries it. Tested by `test_setup_failure_drops_module_without_recording` (Task 3).
5. Phone photos with EXIF rotation reach modules upright. Tested by `test_load_image_applies_exif_orientation` (Task 2).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `pyproject.toml`, `.python-version`, `.gitignore`, `uv.lock` | Project, dependencies, console script, pytest config | 1 |
| `snapsort/__init__.py` | Package marker (empty) | 1 |
| `snapsort/contract.py` | `Frame`, `Result`, `Module` | 1 |
| `snapsort/ingest.py` | `validate` (Task 1); inputs, frame extraction, DB (Task 2); runner (Task 3) | 1–3 |
| `snapsort/modules/__init__.py` | `discover()` | 4 |
| `snapsort/modules/example.py` | Template module | 4 |
| `snapsort/cli.py` | `main()`: `ingest` and `modules` commands | 5 |
| `tests/conftest.py` | Shared fixtures | 2 |
| `tests/pipeline/test_validate.py` | Contract validation | 1 |
| `tests/pipeline/test_inputs.py` | Path resolution, image loading, frame extraction, schema | 2 |
| `tests/pipeline/test_discovery.py` | Module discovery | 4 |
| `tests/e2e/test_ingest.py` | `run_ingest` end to end | 3 |
| `tests/e2e/test_cli.py` | Installed `snapsort` command | 5 |
| `tests/modules/test_example.py` | Template module test | 4 |

All paths are relative to the repo root, `/Users/a1234/Business/snapsort`.

---

### Task 1: Project scaffold, contract, and `validate`

**Files:**
- Create: `pyproject.toml`, `.gitignore`, `snapsort/__init__.py`, `snapsort/contract.py`, `snapsort/ingest.py`
- Generated: `.python-version`, `uv.lock`
- Test: `tests/pipeline/test_validate.py`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `snapsort.contract.Frame(media_id: int, media_path: str, media_kind: str, idx: int, ts: float | None, image: PIL.Image.Image)`, a frozen dataclass
  - `snapsort.contract.Result(frame_idx: int, label=None, score=None, bbox=None, vector=None, data=None)`, a dataclass
  - `snapsort.contract.Module`: attributes `name: str` and `version: str = "1"`, methods `setup() -> None` and `process(frames: list[Frame]) -> list[Result]`
  - `snapsort.ingest.ContractError(Exception)`, `snapsort.ingest.SetupError(Exception)`
  - `snapsort.ingest.validate(results: list[Result], frames: list[Frame]) -> list[Result]`
  - `snapsort.ingest` constants `IMAGE_EXTS`, `VIDEO_EXTS`, `FPS = 1`, `BATCH = 16`, `SCHEMA`

- [ ] **Step 1: Scaffold the project**

Create `pyproject.toml`:

```toml
[project]
name = "snapsort"
version = "0.1.0"
description = "Local image and video processing pipeline"
requires-python = ">=3.12"
dependencies = []

[project.scripts]
snapsort = "snapsort.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "--import-mode=importlib"
```

`--import-mode=importlib` lets test files in different folders share a base name, so `tests/modules/test_ingest.py` could exist next to `tests/e2e/test_ingest.py`.

Create `.gitignore`:

```
.snapsort/
.venv/
__pycache__/
.pytest_cache/
```

Then run:

```bash
mkdir -p snapsort tests/pipeline tests/e2e tests/modules
touch snapsort/__init__.py
uv python pin 3.12
uv add numpy pillow pillow-heif
uv add --dev pytest
```

Expected: `.python-version` contains `3.12`. `pyproject.toml` now lists `numpy`, `pillow` and `pillow-heif` under `dependencies`, and `pytest` under `[dependency-groups] dev`. `uv.lock` exists.

- [ ] **Step 2: Write the failing test**

Create `tests/pipeline/test_validate.py`:

```python
import numpy as np
import pytest
from PIL import Image

from snapsort.contract import Frame, Result
from snapsort.ingest import ContractError, validate

FRAMES = [Frame(1, "/x.jpg", "image", 0, None, Image.new("RGB", (4, 4)))]


def test_normalizes_valid_result():
    raw = Result(0, label="  Dog ", score=np.float32(0.5), bbox=[0, 0, 1, 1], vector=np.ones(3), data={"k": 1})
    [r] = validate([raw], FRAMES)
    assert r.label == "dog"
    assert r.score == 0.5 and type(r.score) is float
    assert r.bbox == (0.0, 0.0, 1.0, 1.0)
    assert r.vector.dtype == np.dtype("<f4") and r.vector.tolist() == [1.0, 1.0, 1.0]
    assert r.data == {"k": 1}


def test_empty_output_is_valid():
    assert validate([], FRAMES) == []


@pytest.mark.parametrize("bad, match", [
    ("not a result", "expected Result"),
    (Result(5), "frame_idx"),
    (Result(0, label=3), "label"),
    (Result(0, score=1.5), "score"),
    (Result(0, score=True), "score"),
    (Result(0, score=float("nan")), "score"),
    (Result(0, bbox=(0, 0, 2, 1)), "bbox"),
    (Result(0, bbox=(0, 0, 1)), "bbox"),
    (Result(0, vector=np.ones((2, 2))), "vector"),
    (Result(0, vector=[1.0, 2.0]), "vector"),
    (Result(0, vector=np.array([np.nan])), "vector"),
    (Result(0, data=[1]), "data"),
    (Result(0, data={"x": object()}), "data"),
])
def test_rejects_contract_violations(bad, match):
    with pytest.raises(ContractError, match=match):
        validate([bad], FRAMES)


def test_rejects_mixed_vector_dims():
    with pytest.raises(ContractError, match="dim"):
        validate([Result(0, vector=np.ones(3)), Result(0, vector=np.ones(4))], FRAMES)


def test_rejects_non_list():
    with pytest.raises(ContractError, match="list"):
        validate(None, FRAMES)
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/pipeline/test_validate.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'snapsort.contract'`

- [ ] **Step 4: Write the contract**

Create `snapsort/contract.py`:

```python
"""The module contract. Every module builds against these three types.

Changes here require agreement from both developers.
"""
from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class Frame:
    media_id: int
    media_path: str        # absolute path of the source file
    media_kind: str        # "image" | "video"
    idx: int               # 0-based; always 0 for images
    ts: float | None       # seconds into the video; None for images
    image: Image.Image     # RGB, full resolution. Shared across modules: do not mutate.


@dataclass
class Result:
    frame_idx: int
    label: str | None = None
    score: float | None = None                                  # 0-1
    bbox: tuple[float, float, float, float] | None = None       # x, y, w, h normalized 0-1
    vector: np.ndarray | None = None                            # 1-D embedding
    data: dict | None = None                                    # JSON-serializable extras


class Module:
    name: str               # unique, matches [a-z0-9_]+, stored with every result
    version: str = "1"      # bump to reprocess all media for this module

    def setup(self) -> None:
        """Load models. Called once per run, before the first process() call.
        Never called if the module has no pending work."""

    def process(self, frames: list[Frame]) -> list[Result]:
        """Return any number of results (zero or many per frame)."""
        raise NotImplementedError
```

- [ ] **Step 5: Write `validate`**

Create `snapsort/ingest.py` (Tasks 2 and 3 append to it):

```python
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `uv run pytest tests/pipeline/test_validate.py -q`
Expected: `17 passed`

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml .python-version .gitignore uv.lock snapsort tests
git commit -m "Add project scaffold, module contract and result validation"
```

---

### Task 2: Inputs, frame extraction, storage, shared fixtures

**Files:**
- Modify: `snapsort/ingest.py` (append)
- Create: `tests/conftest.py`
- Test: `tests/pipeline/test_inputs.py`

**Interfaces:**
- Consumes: `Frame` (Task 1), `IMAGE_EXTS`, `VIDEO_EXTS`, `FPS`, `SCHEMA` (Task 1)
- Produces:
  - `classify(path: Path) -> str | None`, which returns `"image"`, `"video"` or `None`
  - `resolve_paths(paths: list[Path]) -> list[Path]`
  - `load_image(path: str | Path) -> PIL.Image.Image`, upright RGB
  - `extract_frames(video: Path, out: Path) -> list[Path]`, which writes `out/000000.jpg ...` and raises `RuntimeError` on failure
  - `connect(db_path: Path) -> sqlite3.Connection`, with the schema applied, WAL and foreign keys on
  - Fixtures `data_dir`, `sample_image` (a red 64×48 PNG), `sample_video` (3 s mp4) and `sample_frames` (the image frame first, then 3 video frames)

- [ ] **Step 1: Write the shared fixtures**

Create `tests/conftest.py`:

```python
"""Shared fixtures. Media is generated per test, so no binary files are committed."""
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from snapsort.contract import Frame
from snapsort.ingest import extract_frames, load_image


@pytest.fixture
def data_dir(tmp_path) -> Path:
    return tmp_path / ".snapsort"


@pytest.fixture
def sample_image(tmp_path) -> Path:
    path = tmp_path / "media" / "red.png"
    path.parent.mkdir(exist_ok=True)
    Image.new("RGB", (64, 48), (220, 30, 30)).save(path)
    return path


@pytest.fixture
def sample_video(tmp_path) -> Path:
    path = tmp_path / "media" / "clip.mp4"
    path.parent.mkdir(exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
         "-i", "testsrc=duration=3:size=320x240:rate=10", str(path)],
        check=True,
    )
    return path


@pytest.fixture
def sample_frames(sample_image, sample_video, tmp_path) -> list[Frame]:
    """The red image (frames[0]) followed by the video's 3 frames."""
    frames = [Frame(1, str(sample_image), "image", 0, None, load_image(sample_image))]
    for i, f in enumerate(extract_frames(sample_video, tmp_path / "frames")):
        frames.append(Frame(2, str(sample_video), "video", i, float(i), load_image(f)))
    return frames
```

- [ ] **Step 2: Write the failing test**

Create `tests/pipeline/test_inputs.py`:

```python
from pathlib import Path

import pytest
from PIL import Image

from snapsort.ingest import classify, connect, extract_frames, load_image, resolve_paths


def test_classify_is_case_insensitive():
    assert classify(Path("a.JPG")) == "image"
    assert classify(Path("a.heic")) == "image"
    assert classify(Path("a.MOV")) == "video"
    assert classify(Path("a.txt")) is None


def test_resolve_paths_recurses_and_filters_directories(tmp_path):
    for name in ["a.jpg", "sub/b.mp4", ".hidden/c.jpg", "sub/.cache/d.jpg", "notes.txt"]:
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_bytes(b"")
    root = tmp_path.resolve()
    assert resolve_paths([tmp_path]) == [root / "a.jpg", root / "sub/b.mp4"]


def test_resolve_paths_keeps_explicit_files_as_given(tmp_path):
    hidden = tmp_path / ".hidden" / "c.jpg"
    hidden.parent.mkdir()
    hidden.write_bytes(b"")
    explicit = [hidden, tmp_path / "notes.txt", tmp_path / "missing.jpg"]
    assert resolve_paths(explicit) == [p.resolve() for p in explicit]


def test_load_image_applies_exif_orientation(tmp_path):
    path = tmp_path / "rotated.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° to display upright
    Image.new("L", (40, 20)).save(path, exif=exif)
    img = load_image(path)
    assert img.size == (20, 40)
    assert img.mode == "RGB"


def test_extract_frames_one_per_second(sample_video, tmp_path):
    files = extract_frames(sample_video, tmp_path / "out")
    assert [f.name for f in files] == ["000000.jpg", "000001.jpg", "000002.jpg"]


def test_extract_frames_replaces_stale_output(sample_video, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    (out / "000099.jpg").write_bytes(b"stale")
    assert len(extract_frames(sample_video, out)) == 3


def test_extract_frames_fails_cleanly_on_garbage(tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(RuntimeError):
        extract_frames(bad, tmp_path / "out")
    assert not (tmp_path / "out").exists()


def test_connect_creates_schema_idempotently(tmp_path):
    connect(tmp_path / "db").close()
    conn = connect(tmp_path / "db")
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert tables == {"media", "frames", "results", "runs"}
    assert conn.execute("PRAGMA journal_mode").fetchone() == ("wal",)
    assert conn.execute("PRAGMA foreign_keys").fetchone() == (1,)
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `uv run pytest tests/pipeline/test_inputs.py -q`
Expected: `ImportError while loading conftest`, caused by `cannot import name 'extract_frames' from 'snapsort.ingest'`

- [ ] **Step 4: Implement**

Append to `snapsort/ingest.py`:

```python
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
        ["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"fps={FPS}", "-q:v", "2",
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
```

`-start_number 0` makes ffmpeg number files from `000000.jpg`, so the file number equals `idx` and no renaming is needed.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest -q`
Expected: `25 passed`

- [ ] **Step 6: Commit**

```bash
git add snapsort/ingest.py tests/conftest.py tests/pipeline/test_inputs.py
git commit -m "Add input resolution, frame extraction and storage schema"
```

---

### Task 3: Runner (`run_ingest`)

**Files:**
- Modify: `snapsort/ingest.py` (append)
- Test: `tests/e2e/test_ingest.py`

**Interfaces:**
- Consumes: everything from Tasks 1–2
- Produces: `run_ingest(paths: list[Path], modules: list[Module], data_dir: Path) -> bool`. It prints one status line per file to stdout and `skip <path> (<reason>)` and warnings to stderr.

Behavior, from the spec:
- **Pending modules:** a module is pending for a file unless it has a `runs` row with `status='done'` and the same `version`.
- **Batches:** each batch of `BATCH` frames comes from one file and is decoded once. All pending modules get it concurrently, and the runner waits for all of them before the next batch.
- **Setup:** `setup()` runs lazily inside the module's first task. If it raises, the module is dropped for the run and no `runs` row is written for it.
- **Errors:** if `process()` raises, or validation or the dimension check fails, that module gets no more batches for this file and gets an `error` row. Its existing results are kept.
- **Success:** the module's old results for this file are replaced, and the `runs` row is upserted with `done`. Each module's write is one transaction.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/test_ingest.py`:

```python
"""Pipeline end to end: real ffmpeg and SQLite, test-only modules."""
import sqlite3
import threading
from pathlib import Path

import numpy as np

import snapsort.ingest as ingest
from snapsort.contract import Module, Result
from snapsort.ingest import run_ingest


class Counter(Module):
    def __init__(self, name: str, version: str = "1"):
        self.name, self.version = name, version
        self.setups = self.calls = 0

    def setup(self):
        self.setups += 1

    def process(self, frames):
        self.calls += 1
        return [Result(f.idx, label="Thing", score=np.float32(0.5), bbox=(0.1, 0.1, 0.5, 0.5),
                       vector=np.ones(4)) for f in frames]


class Boom(Counter):
    def process(self, frames):
        raise RuntimeError("boom")


class BadBox(Counter):
    def process(self, frames):
        return [Result(f.idx, bbox=(0, 0, 2, 2)) for f in frames]


class BadSetup(Counter):
    def setup(self):
        raise RuntimeError("no model")


class Rendezvous(Counter):
    """Blocks until every module sharing the barrier is inside process() at the same time."""
    def __init__(self, name: str, barrier: threading.Barrier):
        super().__init__(name)
        self.barrier = barrier

    def process(self, frames):
        self.barrier.wait()
        return super().process(frames)


def q(data_dir: Path, sql: str, *args):
    with sqlite3.connect(data_dir / "snapsort.db") as conn:
        return conn.execute(sql, args).fetchall()


def test_frames_per_media(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a")], data_dir)
    rows = q(data_dir, "SELECT m.kind, f.idx, f.ts, f.path FROM frames f "
                       "JOIN media m ON m.id = f.media_id ORDER BY m.kind, f.idx")
    assert [r[:3] for r in rows] == [("image", 0, None), ("video", 0, 0.0), ("video", 1, 1.0), ("video", 2, 2.0)]
    assert rows[0][3] == str(sample_image.resolve())
    assert all(Path(r[3]).is_file() for r in rows)


def test_results_and_runs_stored(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a"), Counter("b")], data_dir)
    assert q(data_dir, "SELECT module, count(*) FROM results GROUP BY module") == [("a", 4), ("b", 4)]
    assert q(data_dir, "SELECT DISTINCT status, version FROM runs") == [("done", "1")]
    label, score, bbox, vector = q(data_dir, "SELECT label, score, bbox, vector FROM results LIMIT 1")[0]
    assert (label, score, bbox) == ("thing", 0.5, "[0.1, 0.1, 0.5, 0.5]")
    assert np.frombuffer(vector, "<f4").tolist() == [1.0, 1.0, 1.0, 1.0]


def test_rerun_is_noop(sample_image, sample_video, data_dir, capsys):
    assert run_ingest([sample_image, sample_video], [Counter("a")], data_dir)
    again = Counter("a")
    assert run_ingest([sample_image, sample_video], [again], data_dir)
    assert (again.setups, again.calls) == (0, 0)
    assert capsys.readouterr().out.count("up to date") == 2


def test_new_module_runs_alone_on_existing_media(sample_video, data_dir):
    assert run_ingest([sample_video], [Counter("a")], data_dir)
    a, b = Counter("a"), Counter("b")
    assert run_ingest([sample_video], [a, b], data_dir)
    assert (a.calls, b.calls) == (0, 1)
    assert q(data_dir, "SELECT count(*) FROM media") == [(1,)]


def test_version_bump_reprocesses_only_that_module(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a"), Counter("b")], data_dir)
    a2, b = Counter("a", version="2"), Counter("b")
    assert run_ingest([sample_image, sample_video], [a2, b], data_dir)
    assert a2.calls == 2 and b.calls == 0
    assert q(data_dir, "SELECT DISTINCT version FROM runs WHERE module = 'a'") == [("2",)]
    assert q(data_dir, "SELECT count(*) FROM results WHERE module = 'a'") == [(4,)]


def test_failing_module_recorded_others_continue_and_retried(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a"), Boom("boom")], data_dir) is False
    assert q(data_dir, "SELECT DISTINCT status, error FROM runs WHERE module = 'boom'") == [("error", "RuntimeError: boom")]
    assert q(data_dir, "SELECT count(*) FROM results WHERE module = 'a'") == [(4,)]
    fixed = Counter("boom")
    assert run_ingest([sample_image, sample_video], [Counter("a"), fixed], data_dir)
    assert fixed.calls == 2
    assert q(data_dir, "SELECT DISTINCT status FROM runs") == [("done",)]


def test_contract_violation_is_module_error(sample_image, data_dir):
    assert run_ingest([sample_image], [BadBox("bad")], data_dir) is False
    [(status, error)] = q(data_dir, "SELECT status, error FROM runs")
    assert status == "error" and "bbox" in error
    assert q(data_dir, "SELECT count(*) FROM results") == [(0,)]


def test_setup_failure_drops_module_without_recording(sample_image, sample_video, data_dir):
    bad = BadSetup("s")
    assert run_ingest([sample_image, sample_video], [Counter("a"), bad], data_dir) is False
    assert q(data_dir, "SELECT DISTINCT module, status FROM runs") == [("a", "done")]
    assert bad.calls == 0


def test_missing_unsupported_and_corrupt_files_skipped(tmp_path, data_dir):
    notes = tmp_path / "notes.txt"
    notes.write_text("x")
    corrupt = tmp_path / "bad.mp4"
    corrupt.write_bytes(b"not a video")
    for path in [tmp_path / "missing.jpg", notes, corrupt]:
        assert run_ingest([path], [Counter("a")], data_dir) is False
    assert q(data_dir, "SELECT count(*) FROM media") == [(0,)]
    assert not any((data_dir / "frames").glob("*"))


def test_ingest_dot_ignores_own_data_dir(tmp_path, sample_video, data_dir):
    (tmp_path / "notes.txt").write_text("ignored silently")
    assert run_ingest([tmp_path], [Counter("a")], data_dir)
    assert run_ingest([tmp_path], [Counter("a")], data_dir)
    assert q(data_dir, "SELECT path FROM media") == [(str(sample_video.resolve()),)]


def test_modules_run_concurrently(sample_image, data_dir):
    barrier = threading.Barrier(2, timeout=5)  # sequential calls would time out and fail
    assert run_ingest([sample_image], [Rendezvous("a", barrier), Rendezvous("b", barrier)], data_dir)


def test_frames_are_batched_per_file(sample_video, data_dir, monkeypatch):
    monkeypatch.setattr(ingest, "BATCH", 2)
    sizes = []

    class Sizes(Counter):
        def process(self, frames):
            sizes.append(len(frames))
            return []

    assert run_ingest([sample_video], [Sizes("s")], data_dir)
    assert sizes == [2, 1]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/e2e/test_ingest.py -q`
Expected: collection error, `ImportError: cannot import name 'run_ingest' from 'snapsort.ingest'`

- [ ] **Step 3: Implement**

Append to `snapsort/ingest.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest -q`
Expected: `37 passed`. If `test_modules_run_concurrently` fails with `BrokenBarrierError`, the modules are being called one after another instead of concurrently.

- [ ] **Step 5: Commit**

```bash
git add snapsort/ingest.py tests/e2e/test_ingest.py
git commit -m "Add concurrent ingest runner with reprocessing and error isolation"
```

---

### Task 4: Module discovery and the template module

**Files:**
- Create: `snapsort/modules/__init__.py`, `snapsort/modules/example.py`
- Test: `tests/pipeline/test_discovery.py`, `tests/modules/test_example.py`

**Interfaces:**
- Consumes: `Module`, `Result`, `Frame` (Task 1), `validate` (Task 1), fixture `sample_frames` (Task 2)
- Produces:
  - `snapsort.modules.discover(package: str = "snapsort.modules") -> list[Module]`, sorted by name. It raises `ValueError` on an invalid or duplicate name.
  - `snapsort.modules.example.Example` with `name = "example"`

- [ ] **Step 1: Write the failing tests**

Create `tests/pipeline/test_discovery.py`:

```python
import pytest

from snapsort.modules import discover

MODULE_SRC = """
from snapsort.contract import Module

class M(Module):
    name = {name!r}

    def process(self, frames):
        return []
"""


def make_package(tmp_path, monkeypatch, files: dict[str, str]) -> str:
    """Write a throwaway package of module files and make it importable. Returns its name."""
    name = f"mods_{tmp_path.name}"
    pkg = tmp_path / name
    pkg.mkdir()
    (pkg / "__init__.py").write_text("")
    for filename, src in files.items():
        (pkg / filename).write_text(src)
    monkeypatch.syspath_prepend(str(tmp_path))
    return name


def test_finds_real_example_module():
    assert "example" in [m.name for m in discover()]


def test_skips_underscore_files_and_broken_imports(tmp_path, monkeypatch, capsys):
    pkg = make_package(tmp_path, monkeypatch, {
        "good.py": MODULE_SRC.format(name="good"),
        "_off.py": MODULE_SRC.format(name="off"),
        "broken.py": "import not_a_real_dependency\n",
    })
    assert [m.name for m in discover(pkg)] == ["good"]
    assert "broken.py failed to import" in capsys.readouterr().err


def test_rejects_duplicate_names(tmp_path, monkeypatch):
    pkg = make_package(tmp_path, monkeypatch, {
        "one.py": MODULE_SRC.format(name="same"),
        "two.py": MODULE_SRC.format(name="same"),
    })
    with pytest.raises(ValueError, match="duplicate"):
        discover(pkg)


def test_rejects_invalid_names(tmp_path, monkeypatch):
    pkg = make_package(tmp_path, monkeypatch, {"one.py": MODULE_SRC.format(name="Bad-Name")})
    with pytest.raises(ValueError, match="invalid"):
        discover(pkg)
```

Create `tests/modules/test_example.py`:

```python
"""Template module test. Copy to tests/modules/test_<name>.py for each new module."""
from snapsort.ingest import validate
from snapsort.modules.example import Example


def test_output_passes_contract(sample_frames):
    module = Example()
    module.setup()
    results = validate(module.process(sample_frames), sample_frames)
    assert len(results) == len(sample_frames)


def test_red_image_is_labeled_red(sample_frames):
    image_frame = sample_frames[:1]
    [r] = validate(Example().process(image_frame), image_frame)
    assert r.label == "red"
    assert r.vector.shape == (3,)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/pipeline/test_discovery.py tests/modules -q`
Expected: collection errors, `ModuleNotFoundError: No module named 'snapsort.modules'`

- [ ] **Step 3: Implement discovery**

Create `snapsort/modules/__init__.py`:

```python
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
```

- [ ] **Step 4: Implement the template module**

Create `snapsort/modules/example.py`:

```python
"""Template module. Copy this file to start a new one.

Labels each frame with its dominant color channel and stores the mean RGB as a 3-dim vector.
"""
import numpy as np

from snapsort.contract import Frame, Module, Result

CHANNELS = ("red", "green", "blue")


class Example(Module):
    name = "example"
    version = "1"

    def setup(self) -> None:
        pass  # load models here

    def process(self, frames: list[Frame]) -> list[Result]:
        results = []
        for f in frames:
            mean = np.asarray(f.image, dtype=np.float32).reshape(-1, 3).mean(axis=0) / 255
            results.append(Result(f.idx, label=CHANNELS[int(mean.argmax())], score=1.0, vector=mean))
        return results
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest -q`
Expected: `43 passed`

- [ ] **Step 6: Commit**

```bash
git add snapsort/modules tests/pipeline/test_discovery.py tests/modules
git commit -m "Add module discovery and example template module"
```

---

### Task 5: CLI

**Files:**
- Create: `snapsort/cli.py`
- Test: `tests/e2e/test_cli.py`

**Interfaces:**
- Consumes: `run_ingest` (Task 3), `discover` (Task 4)
- Produces: `snapsort.cli.main(argv: list[str] | None = None) -> int`, installed as the `snapsort` command by `[project.scripts]` (Task 1)

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/test_cli.py`:

```python
"""The installed `snapsort` command, run as a subprocess."""
import sqlite3
import subprocess
import sys
from pathlib import Path

SNAPSORT = str(Path(sys.executable).parent / "snapsort")


def run(*args, cwd):
    return subprocess.run([SNAPSORT, *args], cwd=cwd, capture_output=True, text=True)


def test_ingest_video_with_example_module(tmp_path, sample_video):
    proc = run("ingest", str(sample_video), "--modules", "example", cwd=tmp_path)
    assert proc.returncode == 0, proc.stderr
    assert "3 frames  example:done" in proc.stdout
    with sqlite3.connect(tmp_path / ".snapsort" / "snapsort.db") as conn:
        assert conn.execute("SELECT count(*) FROM results WHERE module = 'example'").fetchone() == (3,)


def test_unknown_module_exits_2(tmp_path, sample_video):
    proc = run("ingest", str(sample_video), "--modules", "nope", cwd=tmp_path)
    assert proc.returncode == 2
    assert "unknown module(s): nope" in proc.stderr and "example" in proc.stderr


def test_failed_file_exits_1(tmp_path):
    proc = run("ingest", str(tmp_path / "missing.jpg"), cwd=tmp_path)
    assert proc.returncode == 1
    assert "skip" in proc.stderr and "not found" in proc.stderr


def test_modules_lists_example(tmp_path):
    proc = run("modules", cwd=tmp_path)
    assert proc.returncode == 0
    assert proc.stdout.startswith("example\t1\t")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest tests/e2e/test_cli.py -q`
Expected: 4 failures. Each subprocess exits 1 with `ModuleNotFoundError: No module named 'snapsort.cli'` in stderr.

- [ ] **Step 3: Implement**

Create `snapsort/cli.py`:

```python
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
    args = parser.parse_args(argv)

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
        wanted = [n.strip() for n in args.modules.split(",") if n.strip()]
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
```

- [ ] **Step 4: Run the full suite**

Run: `uv run pytest -q`
Expected: `47 passed`

- [ ] **Step 5: Smoke test by hand**

```bash
uv run snapsort modules
uv run snapsort ingest README.md
```

Expected: the first prints `example	1	<path>/snapsort/modules/example.py`. The second prints `skip <path>/README.md (unsupported file type)` to stderr and exits 1, and creates `.snapsort/snapsort.db`, which is git-ignored.

- [ ] **Step 6: Commit and push**

```bash
git add snapsort/cli.py tests/e2e/test_cli.py
git commit -m "Add snapsort CLI with ingest and modules commands"
git push
```
