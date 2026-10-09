# Date filter design

Date: 2026-10-10
Status: draft, pending review

## Goal

Narrow search to files captured in a date range, stacked with the existing filters (person, place, media kind, similar image) under AND or `--or`. The newest/oldest sorts follow capture time too. Builds on `docs/design/2026-10-09-filters.md`.

## Scope

In:

- `snapsort/modules/capture_date.py`: a new ingest module that reads each file's capture time
- a `date` filter and capture-time sorting in `snapsort/search.py`
- `--from` / `--to` on `snapsort search` in `snapsort/cli.py`
- `tests/modules/test_capture_date.py`, plus additions to `tests/search/test_search.py`

Out:

- turning phrases like "last July" into dates. The chatbot will produce `from`/`to`.
- time-of-day ranges
- a time zone lookup from GPS for UTC-only videos
- a date column in the text output, and a `snapsort dates` listing
- adding the `date` filter kind, `capturedAt` and the new newest/oldest meaning to `packages/contract`. That needs agreement from the frontend side.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Where it lives | A `capture_date` module: one result per file on frame 0, like `location` | No schema change. It's versioned in `runs`, and an existing library backfills with `snapsort ingest --modules capture_date <folder>`. |
| What "the date" means | The local time where the file was captured. A photo taken at 00:23 on Jul 25 in Manila is Jul 25. | That's the date people remember and type |
| iPhone videos | `com.apple.quicktime.creationdate` wins over `creation_time` | On the user's iPhone clips `creation_time` is the copy date (2026-09-22 for a clip shot 2026-05-26) |
| UTC-only times | Converted to this computer's time zone | Correct for footage shot at home. A GPS time zone lookup needs a new dependency. |
| No capture date | No result. Date filters exclude the file. | No wrong matches. A file's mtime is often its download or copy date. |
| Sort | newest/oldest order by capture time, falling back to `added_at`, then id | What a photo app is expected to do. The fallback mixes local time and UTC, only for undated files. |

## Module (`snapsort/modules/capture_date.py`)

`name = "capture_date"`, `version = "1"`. `process()` reads frame 0 of each file and returns at most one result:

- `label`: local capture time as `YYYY-MM-DD HH:MM:SS`, the same shape as `media.added_at`, so the two sort together
- `data`: `{"utc": "2026-07-24T12:35:36Z" | None, "offset": "+08:00" | None, "source": "exif" | "quicktime" | "creation_time"}`. `utc` and `offset` are None when the source gives a local time without an offset (PNG screenshots). For `creation_time`, `offset` is this computer's offset at that moment.

Sources, first one present wins:

| File | Source | Handling |
|---|---|---|
| image | EXIF `DateTimeOriginal` (36867), with `OffsetTimeOriginal` (36881) when present | `YYYY:MM:DD HH:MM:SS` is already local |
| video | ffprobe format tag `com.apple.quicktime.creationdate`, e.g. `2026-07-15T15:13:55+0800` | Local time is the time as written |
| video | ffprobe format tag `creation_time`, e.g. `2026-09-20T02:31:02.000000Z` | Converted from UTC to this computer's time zone |

A value is ignored, and the next source tried, when it doesn't parse (EXIF `0000:00:00 00:00:00`, empty strings) or its year is before 1971 (the 1904 and 1970 epochs some cameras write). A file with no usable source gets no result.

The parsing is two pure functions so tests don't need real files:

```python
def exif_date(exif: dict) -> Capture | None          # the EXIF IFD as PIL returns it
def video_date(tags: dict, tz=None) -> Capture | None  # ffprobe format tags; tz None = this computer's zone

@dataclass
class Capture:
    local: datetime        # naive, local wall clock
    offset: str | None     # "+08:00"
    source: str
```

## Search (`snapsort/search.py`)

### Date filter

`{"kind": "date", "from": "2026-07-01", "to": "2026-07-31"}`

- Either bound may be missing or None, but not both. Both days are included.
- Matches files whose `capture_date` label's date part (`substr(label, 1, 10)`) is in range.
- Returns whole-file matches (`{media_id: None}`), like place: it marks no frames, and `scope="frame"` doesn't narrow by it.
- An empty range is a normal empty result, not an error.

### Sort and output

- `newest` / `oldest`: by capture time when the file has one, else `added_at`, then id.
- `Hit` gets `captured_at: str | None`, the label. `--json` adds it as `capturedAt`.
- The text output is unchanged.

### Errors

`search()` raises `QueryError` for:

- a date filter with neither bound: `date filter needs from or to`
- a bound that isn't a real `YYYY-MM-DD` date: `date must be YYYY-MM-DD, got '2026-7-1'`
- `from` after `to`: `date range starts after it ends: 2026-08-01 > 2026-07-01`
- a date filter when the library has no `capture_date` results at all: `no capture dates in this library. run snapsort ingest --modules capture_date`. A library ingested before this module would otherwise return a silent zero.

## CLI (`snapsort/cli.py`)

```
snapsort search [--from YYYY-MM-DD] [--to YYYY-MM-DD] [... existing flags]
```

Either flag adds one date filter. The engine validates the values, so a bad date exits 2 with the message above.

## Tests

`tests/modules/test_capture_date.py`:

- `exif_date`: with an offset, without one, the `0000:00:00` placeholder, a 1970 date
- `video_date`: the QuickTime tag wins over `creation_time`; a UTC-only time converts to a fixed test zone; bad or missing tags give None
- `process()` on a JPEG written with EXIF dates by PIL, and on an ffmpeg-generated video with `-metadata creation_time=...`
- a file without a date gives no result

`tests/search/test_search.py`, inserting `capture_date` rows directly:

- `from` alone, `to` alone, both, and both edges included
- undated files are excluded
- date + person under AND and under `combine="any"`
- each `QueryError` case
- newest/oldest by capture time with the `added_at` fallback
- `captured_at` on hits and `capturedAt` in `--json`
- the CLI maps `--from` / `--to`

## Done when

- the full suite passes
- on the 43-file calibration library:
  - `snapsort ingest --modules capture_date` backfills it
  - `search --from 2026-07-15 --to 2026-07-15` returns exactly the 6 iPhone videos
  - IMG_1937 (00:23 on Jul 25) falls under Jul 25
  - the undated JPG never appears
  - `--person` with `--from` stacks
