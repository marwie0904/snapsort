# snapsort

Local image and video processing. Nothing leaves the machine.

## Features

- **People**: face detection and grouping of the same person across media
- **Similar image search** by look (DINOv2)
- **Semantic text search**: type a description, get matching images and videos (SigLIP 2)
- **Object detection** (YOLO11m)
- **Location**: GPS plus offline place names
- **Capture date** filter
- **Desktop app** (Electron) over every library: the Mac's own and one per external drive
- **AI chat**: a local model turns a message into the search
- **Outfits**: TBD, needs feasibility check

## AI chat

The Ask AI panel sends each message to Granite 4.0 H 350M (284 MB, Apache 2.0), run locally by llama-server. The model answers with one `search_library` call: text, people, objects, place, photo or video, dates, similar to the open file, and sort. Its people, places and objects come from your libraries, and llama.cpp holds it to that schema, so every value exists. Each message replaces the whole search. The code is in `snapsort/chat.py`.

On a real library it gets about half of the queries exactly right, see the [eval report](experiments/tool_eval/REPORT.md). Its known weak spots are text search, relative dates ("last month") and declining requests it can't do. Fine-tuning on this tool is the next step.

## Status

| Part | State |
|---|---|
| Ingest pipeline (CLI, frames, module runner, storage) | Done |
| Modules | `faces`, `objects`, `clip_embed`, `image_embed`, `location`, `capture_date`, `metadata` |
| Search | Done: person, place, kind, date, text, similar image. Objects filter in the app only |
| Desktop app | Wired to the backend. Scenes has no backend module, so it stays empty |
| AI chat | Granite, off the shelf. Fine-tuning not started |

## Setup

Apple Silicon Mac, [uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io), ffmpeg, and llama.cpp for the chat.

```bash
brew install ffmpeg llama.cpp
uv sync
pnpm install
curl -L --create-dirs -o ~/.cache/snapsort/granite-4.0-h-350m-Q6_K.gguf \
  https://huggingface.co/ibm-granite/granite-4.0-h-350m-GGUF/resolve/main/granite-4.0-h-350m-Q6_K.gguf
```

`SNAPSORT_CHAT_MODEL` points the chat at another GGUF.

## Desktop app

```bash
pnpm dev                          # spawns `uv run snapsort serve` from the repo
SNAPSORT_BACKEND=mock pnpm dev    # mock data, no backend
```

Start it from a terminal so `uv` and `llama-server` are on PATH. The Mac's library is `~/Library/Application Support/snapsort` (`SNAPSORT_INTERNAL_DATA` moves it). A folder on an external drive goes to `<drive>/snapsort/`, so the drive carries its own library. `SNAPSORT_CMD` replaces `uv run snapsort`.

## CLI

```bash
uv run snapsort modules                                   # list modules
uv run snapsort ingest ~/Pictures/trip                    # all modules, then groups faces
uv run snapsort ingest ~/Pictures/trip --modules objects,clip_embed
uv run snapsort people                                    # person ids and names
uv run snapsort places
uv run snapsort search "people near a bus" --limit 10
uv run snapsort search --person 1,4 --from 2026-05-01 --kind video
uv run snapsort search --similar ~/Desktop/ref.jpg
```

Text search encodes the query as "this is a photo of {query}." with SigLIP 2 and ranks frames by match probability (0-1), keeping those at or above `--min-score`. Every filter stacks with AND; `--or` matches any filter instead. See `snapsort search --help`.

The CLI uses `.snapsort/` in the current directory unless `--data-dir` says otherwise. A library holds `snapsort.db` (SQLite: `media`, `frames`, `results`, `runs`, `sources`, and after grouping `persons`, `person_faces`, `person_centroids`) and `previews.noindex/` (video frames). Delete it to start over. The first run of each model downloads its weights.

Exit codes: `0` all good, `1` a file was skipped or a module failed, `2` configuration error.

## How ingest works

1. Load every module in `snapsort/modules/`.
2. Collect files: images (`jpg png webp heic`) and videos (`mp4 mov m4v mkv webm`); folders are searched recursively, hidden folders skipped.
3. Videos become 1 frame per second (ffmpeg, at most 1080p); an image is its own single frame.
4. Frames go to all modules in batches of 16, modules running in parallel.
5. Module output is validated against the contract, then stored. A failing module doesn't stop the others.
6. Re-running only does missing work: new files, new modules, bumped module versions, previously failed modules.
7. When `faces` ran, faces are grouped into persons.

## Adding a module

1. Copy `snapsort/modules/example.py` to `snapsort/modules/<name>.py`; set `name`, implement `setup()` (load models) and `process(frames)`.
2. `uv add <dependencies>`.
3. Copy `tests/modules/test_example.py` to `tests/modules/test_<name>.py`.
4. `uv run pytest tests/modules/test_<name>.py`, then `uv run snapsort ingest <path> --modules <name>`.

The contract (`Frame`, `Result`, `Module`) is in `snapsort/contract.py`; result conventions are in the [design doc](docs/design/2026-10-09-ingest-pipeline.md#module-contract-snapsortcontractpy). Disable a module by renaming it to `_<name>.py`.

## Tests

```bash
uv run pytest                  # everything in Python
uv run pytest tests/e2e        # whole pipeline + CLI
uv run pytest tests/modules    # modules
pnpm test                      # frontend
pnpm typecheck
```

## Docs

Every feature goes design → plan → build. Designs live in `docs/design/`, plans in `docs/plans/` under the same file name.

- Ingest pipeline: [design](docs/design/2026-10-09-ingest-pipeline.md), [plan](docs/plans/2026-10-09-ingest-pipeline.md)
- Location module: [design](docs/design/2026-10-09-location-module.md), [plan](docs/plans/2026-10-09-location-module.md)
- Faces: [design](docs/design/2026-10-09-faces.md), [plan](docs/plans/2026-10-09-faces.md), [grouping plan](docs/plans/2026-10-09-faces-grouping.md)
- Image embedder: [design](docs/design/2026-10-09-image-embedder.md), [plan](docs/plans/2026-10-09-image-embedder.md)
- Filters: [design](docs/design/2026-10-09-filters.md), [plan](docs/plans/2026-10-09-filters.md)
- Date filter: [design](docs/design/2026-10-10-date-filter.md), [plan](docs/plans/2026-10-10-date-filter.md)
- Frontend ↔ backend wiring: [roadmap](docs/plans/2026-10-10-frontend-backend-wiring-roadmap.md)
- AI chat model: [eval report](experiments/tool_eval/REPORT.md)

## Credits

Place names from GeoNames (geonames.org), CC BY 4.0.
