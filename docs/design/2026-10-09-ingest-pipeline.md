# Ingest pipeline design

Date: 2026-10-09
Status: draft, pending review

## Goal

A CLI that takes image/video paths, turns each into frames, and runs every frame through a set of pluggable modules in parallel, storing results locally. Two developers build modules independently against one fixed contract. Hackathon scope: Apple Silicon Macs, under 50k frames.

## Scope

In: input handling, frame extraction, module contract, module discovery, concurrent execution, storage schema, error handling, reprocessing rules, CLI.

Out (separate specs later): which models each module uses, search, chatbot, person grouping (a separate command that clusters stored face vectors), file change detection, `--force`, pruning rows of deleted modules, configurable fps, processing several files concurrently, non-macOS support.

## Stack

Pipeline only. Modules bring their own dependencies.

- Python 3.12, managed with `uv` (`.python-version` pins 3.12 for ML wheel compatibility)
- `ffmpeg` CLI via `subprocess` (`brew install ffmpeg`)
- `pillow`, `pillow-heif`, `numpy`
- stdlib: `sqlite3`, `concurrent.futures`, `argparse`, `pkgutil`
- `pytest` (dev)

## Layout

```
README.md
pyproject.toml              # console script: snapsort = snapsort.cli:main; pytest testpaths = ["tests"]
.python-version             # 3.12
.gitignore                  # .snapsort/, .venv/, __pycache__/
docs/
  design/                   # what and why, approved before building: YYYY-MM-DD-<topic>.md
  plans/                    # step-by-step build plan for one design, same file name
snapsort/
  contract.py               # Frame, Result, Module. The shared interface.
  ingest.py                 # input resolution, frame extraction, runner, validate(), DB writes
  cli.py                    # argparse entry point
  modules/
    __init__.py             # discovery
    example.py              # template module
tests/
  conftest.py               # shared fixtures: tmp data dir, generated PNG + 3 s video, sample Frames
  e2e/
    test_ingest.py          # whole pipeline: run_ingest with test-only modules, plus one CLI run
  modules/
    test_example.py         # one file per module: test_<name>.py
.snapsort/                  # runtime data, git-ignored, created in the current working directory
  snapsort.db
  frames/<media_id>/<idx:06d>.jpg
```

- A design and its plan share a file name, so `docs/design/X.md` pairs with `docs/plans/X.md`.
- Every module has a test file at `tests/modules/test_<name>.py`. Removing a module means deleting `snapsort/modules/<name>.py` and that test file.
- Changes to `contract.py` require agreement from both developers.

## Flow

```
snapsort ingest <path>... [--modules a,b]
  1. resolve paths: files as given, directories recursed; sorted
  2. per file, in order:
     a. classify by extension → image | video | skip
     b. find pending modules (see Reprocessing); none → skip file
     c. get frames: existing rows in `frames`, else extract + insert
     d. per batch of 16 frames: load images once, run all pending modules concurrently
     e. per module: write results + runs row in one transaction
     f. print one status line
```

## Inputs

- Images: `.jpg .jpeg .png .webp .heic` (case-insensitive). HEIC via `pillow_heif.register_heif_opener()`. Loaded with `ImageOps.exif_transpose(img).convert("RGB")`.
- Videos: `.mp4 .mov .m4v .mkv .webm` (case-insensitive).
- Other extensions: a file passed explicitly is skipped with a warning. Inside a recursed directory it is ignored silently.
- When recursing a directory, entries whose path below that directory has a component starting with `.` are ignored. This keeps `ingest .` from ingesting `.snapsort/frames`. Explicitly passed paths are never filtered this way.
- Paths are stored absolute (`Path.resolve()`).

## Frame extraction

- Image: one frame, `idx = 0`, `ts = NULL`, `frames.path` = the original file. Nothing is copied.
- Video: `ffmpeg -v error -i <path> -vf fps=1 -q:v 2 .snapsort/frames/<media_id>/%06d.jpg`. ffmpeg's `%06d` starts at 1, so file `n` maps to `idx = n - 1` and `ts = idx` (seconds). Files are renamed to `<idx:06d>.jpg` after extraction. ffmpeg applies rotation metadata by default. Verified: a 3 s clip yields exactly 3 frames.
- The `media` row, extraction and `frames` rows happen in one transaction. If ffmpeg fails or yields 0 frames: roll back, delete the frame dir, skip the file with a warning.
- Frames are kept on disk so new modules can run without re-decoding and search can display results.

## Module contract (`snapsort/contract.py`)

```python
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
    score: float | None = None                                  # 0–1
    bbox: tuple[float, float, float, float] | None = None       # x, y, w, h normalized 0–1
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

- Modules never write to the database or to files, apart from their own model caches. Reading `media_path` is allowed. The runner owns all writes.
- `process()` is never called concurrently on the same module instance, so modules need no locking.
- Location-type modules that read file metadata do it once per file, when `frame.idx == 0`.
- Changing a module's vector dimension requires a version bump and re-ingesting all media.

### Result conventions

| Feature kind | Fields set |
|---|---|
| Embedding | `vector` |
| Detection | `label`, `score`, `bbox` |
| Face | `label`, `score`, `bbox`, `vector` |
| Tag | `label`, `score` |
| Location | `label` (place name), `data` (`{"lat": .., "lon": ..}`) |

### Validation

The runner checks every `Result` before storing it with `validate(results, frames) -> list[Result]` in `ingest.py`. It returns normalized copies or raises `ContractError`. Any failure counts as that module's error for the current file. Module tests call the same function.

- It is a `Result`, and `frame_idx` is one of the batch's frame idx values.
- `label`: `None` or `str`. The runner strips it and lowercases it.
- `score`: `None` or a number in [0, 1].
- `bbox`: `None` or 4 numbers, each in [0, 1].
- `vector`: `None` or a 1-D numeric `np.ndarray` with all values finite. Cast to float32. Every vector from one module in one run must have the same dimension.
- `data`: `None` or a `dict` that `json.dumps` accepts.

## Discovery (`snapsort/modules/__init__.py`)

- Import every module file in `snapsort/modules/` via `pkgutil.iter_modules`, skipping names that start with `_`.
- Collect each `Module` subclass defined in that file and instantiate it with no arguments.
- Duplicate or invalid `name` → exit with an error at startup.
- Add a module: add a file. Disable: rename to `_<name>.py`. Remove: delete the file.
- `--modules a,b` limits the run to those names. An unknown name → exit code 2, listing the available names.

## Storage

One SQLite file, `.snapsort/snapsort.db`, opened with `PRAGMA journal_mode=WAL` (readers can query during ingest) and `PRAGMA foreign_keys=ON`.

```sql
CREATE TABLE media (
  id       INTEGER PRIMARY KEY,
  path     TEXT NOT NULL UNIQUE,
  kind     TEXT NOT NULL CHECK (kind IN ('image','video')),
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE frames (
  id       INTEGER PRIMARY KEY,
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  idx      INTEGER NOT NULL,
  ts       REAL,
  path     TEXT NOT NULL,
  UNIQUE (media_id, idx)
);
CREATE TABLE results (
  id       INTEGER PRIMARY KEY,
  frame_id INTEGER NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
  module   TEXT NOT NULL,
  label    TEXT,
  score    REAL,
  bbox     TEXT,      -- JSON [x, y, w, h]
  vector   BLOB,      -- little-endian float32; dim = length / 4
  data     TEXT       -- JSON
);
CREATE INDEX results_module_label ON results(module, label);
CREATE TABLE runs (
  media_id    INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  version     TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('done','error')),
  error       TEXT,
  finished_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (media_id, module)
);
```

### Embeddings

Embeddings are stored as float32 blobs in `results.vector`. There is no separate vector store. Search (later spec) loads one module's vectors into an N×D numpy matrix, normalizes the rows and ranks by cosine similarity with a matrix multiply. Each module can have its own dimension because searches never mix modules. At 50k × 768 that is about 150 MB of RAM and roughly 10–50 ms per query. Move to sqlite-vec or LanceDB only past about 1M vectors.

## Runner

Entry point used by the CLI and the tests:

```python
def run_ingest(paths: list[Path], modules: list[Module], data_dir: Path) -> bool:
    """Returns True if every file and module succeeded."""
```

### Reprocessing

A module is pending for a file when its `runs` row is missing, has a different `version`, or has `status = 'error'`. Results:

- Re-running `ingest` on the same paths does nothing.
- Adding a module and re-running processes only that module, from frames already on disk.
- Bumping a module's `version` reprocesses that module for every file passed in.
- Deleting `.snapsort/` resets everything.

### Concurrency

- A `ThreadPoolExecutor` with one worker per enabled module is created once per run.
- For each batch of 16 frames: load the images once, submit `process(batch)` for every pending module, and wait for all of them before the next batch. The slowest module sets the pace of each batch, which is acceptable because all modules share the one GPU.
- Threads give real parallelism because torch and ONNX Runtime release the GIL during compute.
- `setup()` runs lazily inside the module's first submitted task.
- Files are processed one at a time.
- Results are held in memory per file and module until the file finishes.

### Writes

The main thread does all DB writes. Per file and module, in one transaction:

- On success: delete the module's existing results for this file's frames, insert the new results, and upsert `runs` with `status='done'` and the current `version`.
- On error: upsert `runs` with `status='error'`, the current `version` and the exception message. Existing results are left unchanged.

### Errors

| Failure | Behavior |
|---|---|
| `setup()` raises | Module dropped for the rest of the run. Warning printed. Its pending files are not written to `runs`, so the next run retries them. |
| `process()` raises, or validation fails | Module stops receiving batches for this file. Its partial results are discarded and an error row is written to `runs`. Other modules continue. |
| Missing or undecodable file, or unsupported file passed explicitly | Skipped with a warning. |

### Output

- One line per file: `<path>  <n> frames  example:done objects:error(<message>)`.
- Skipped files: `skip <path> (<reason>)`.
- Exit code 0 if everything succeeded, 1 if any file was skipped or any module errored.

## CLI

```
snapsort ingest <path>... [--modules a,b]   # files or directories
snapsort modules                            # list discovered modules: name, version, file
```

## Adding a module (for both developers)

1. Copy `snapsort/modules/example.py` to `snapsort/modules/<name>.py`.
2. Set `name`, then implement `setup()` and `process()`.
3. `uv add <dependencies>`.
4. Copy `tests/modules/test_example.py` to `tests/modules/test_<name>.py` and add checks specific to the module.
5. `uv run pytest tests/modules/test_<name>.py`, then `uv run snapsort ingest <path> --modules <name>`.

`example.py` returns one result per frame: `label` = the name of the channel with the highest mean (`"red"`, `"green"` or `"blue"`), `score = 1.0`, and `vector` = the mean RGB scaled to 0–1. This exercises both label and vector storage.

## Testing

pytest. `uv run pytest` runs everything. `uv run pytest tests/e2e` or `uv run pytest tests/modules` runs one suite.

### Shared fixtures (`tests/conftest.py`)

Fixtures are generated into a temp dir at test time, so no binary files are committed:

- `data_dir`: an empty temp `.snapsort` directory
- `sample_image`: a PNG
- `sample_video`: a 3 s video from `ffmpeg -f lavfi -i testsrc=duration=3:size=320x240:rate=10`
- `sample_frames`: a list of `Frame` objects built from the image and video, for module tests

### Module tests (`tests/modules/test_<name>.py`)

At minimum, each one calls `setup()`, runs `process(sample_frames)`, and passes the output through `validate` without an error. Module-specific checks are added on top.

### E2E suite (`tests/e2e/test_ingest.py`)

This suite tests the pipeline, not real modules. It calls `run_ingest` with test-only modules defined in the file. Checks:

1. The video produces 3 frames with `ts` 0, 1, 2. The image produces 1 frame with `ts` NULL.
2. Results and `done` runs rows exist for each module.
3. A second run calls no module's `process()`.
4. Bumping a module's `version` reprocesses only that module.
5. A module whose `process()` raises gets an `error` runs row. The other modules still store results. The return value is `False`.
6. A module returning an out-of-range `bbox` is treated as an error.
7. `snapsort ingest <sample_video> --modules example`, run as a subprocess, exits 0 and stores results.
