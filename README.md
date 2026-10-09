# snapsort

Local image and video processing. Nothing leaves the machine.

## Features

- **Reverse image search** by vibe / theme
- **Person detection + grouping** (cluster the same person across media)
- **Location** detection
- **Object detection**
- **Semantic text search**: type a description, get matching images and videos
- **Outfits**: TBD, needs feasibility check

## AI chatbot

A chatbot with tool calling access to every filter above, so queries like "photos of Anna at the beach wearing red" resolve to person + location + object/outfit filters.

## Status

| Part | State |
|---|---|
| Ingest pipeline (CLI, frames, module runner, storage) | Done |
| Location module (GPS + offline place names) | Done |
| Feature modules | `objects` (YOLO11m), `clip_embed` (SigLIP 2 base); people not started |
| Text search (`snapsort search`) | Done over stored `clip_embed` vectors |
| Chatbot | Not started |

## Setup

Apple Silicon Mac, [uv](https://docs.astral.sh/uv/) and ffmpeg.

```bash
brew install ffmpeg
uv sync
```

## Usage

```bash
uv run snapsort modules                                         # list modules
uv run snapsort ingest ~/Pictures/trip --modules objects,clip_embed
uv run snapsort search "people near a bus" --limit 10
uv run snapsort ingest photos --modules example                 # template module only
```

`objects` writes one result per detection (label, score, normalized bbox). `clip_embed` stores one L2-normalized vector per frame. `snapsort search` encodes the query as "this is a photo of {query}." with the same SigLIP 2 model and ranks by match probability (0-1) against stored vectors, keeping frames at or above `--min-score` (requires a prior `clip_embed` ingest). The text stacks with the filter flags (`--person`, `--place`, `--kind`, `--from`/`--to`, `--or`); see `snapsort search --help`.

Results go to `.snapsort/` in the current directory: `snapsort.db` (SQLite: `media`, `frames`, `results`, `runs`) and `frames/` (extracted video frames). Delete `.snapsort/` to start over. First run of YOLO/SigLIP downloads model weights.

Exit codes: `0` all good, `1` a file was skipped or a module failed, `2` configuration error.

## How ingest works

1. Load every module in `snapsort/modules/`.
2. Collect files: images (`jpg png webp heic`) and videos (`mp4 mov m4v mkv webm`); folders are searched recursively, hidden folders skipped.
3. Videos become 1 frame per second (ffmpeg); an image is its own single frame.
4. Frames go to all modules in batches of 16, modules running in parallel.
5. Module output is validated against the contract, then stored. A failing module doesn't stop the others.
6. Re-running only does missing work: new files, new modules, bumped module versions, previously failed modules.

## Adding a module

1. Copy `snapsort/modules/example.py` to `snapsort/modules/<name>.py`; set `name`, implement `setup()` (load models) and `process(frames)`.
2. `uv add <dependencies>`.
3. Copy `tests/modules/test_example.py` to `tests/modules/test_<name>.py`.
4. `uv run pytest tests/modules/test_<name>.py`, then `uv run snapsort ingest <path> --modules <name>`.

The contract (`Frame`, `Result`, `Module`) is in `snapsort/contract.py`; result conventions are in the [design doc](docs/design/2026-10-09-ingest-pipeline.md#module-contract-snapsortcontractpy). Disable a module by renaming it to `_<name>.py`.

## Tests

```bash
uv run pytest                  # everything
uv run pytest tests/e2e        # whole pipeline + CLI
uv run pytest tests/pipeline   # pipeline units
uv run pytest tests/modules    # modules
```

## Docs

Every feature goes design → plan → build. Designs live in `docs/design/`, plans in `docs/plans/` under the same file name.

- Ingest pipeline: [design](docs/design/2026-10-09-ingest-pipeline.md), [plan](docs/plans/2026-10-09-ingest-pipeline.md)
- Location module: [design](docs/design/2026-10-09-location-module.md), [plan](docs/plans/2026-10-09-location-module.md)

## Credits

Place names from GeoNames (geonames.org), CC BY 4.0.
