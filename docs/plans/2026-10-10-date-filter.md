# Date Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter and sort search results by the local time each file was captured.

**Architecture:** A new `capture_date` ingest module stores one result per file on frame 0. Its label is the local capture time `YYYY-MM-DD HH:MM:SS`. Search gains a whole-file `date` filter over that label, newest/oldest sorts by it (falling back to `added_at`), and `Hit.captured_at`. The CLI gains `--from` / `--to`.

**Tech Stack:** Python 3.12, uv, SQLite, Pillow + pillow_heif (EXIF), ffprobe (video tags), pytest.

**Spec:** `docs/design/2026-10-10-date-filter.md`

## Global Constraints

- No new dependencies.
- Module `name = "capture_date"`, `version = "1"`. One result per file, on frame 0 only.
- Label format: `YYYY-MM-DD HH:MM:SS`, local wall clock.
- `data`: `{"utc": "YYYY-MM-DDTHH:MM:SSZ" | None, "offset": "+08:00" | None, "source": "exif" | "quicktime" | "creation_time"}`
- Video source order: `com.apple.quicktime.creationdate`, then `creation_time` (UTC, converted to this computer's zone).
- Years before 1971 and unparseable values are ignored. A file with no usable date gets no result.
- Error messages, verbatim:
  - `date filter needs from or to`
  - `date must be YYYY-MM-DD, got '2026-7-1'`
  - `date range starts after it ends: 2026-08-01 > 2026-07-01`
  - `no capture dates in this library. run snapsort ingest --modules capture_date`
- Commits never carry a co-author line.
- Run Python through `uv run` from the worktree root.

## Review Focus

1. A library ingested before this module exists: a date filter must raise the backfill hint, never return a silent zero. Pinned by the `no capture dates` case in Task 2's `test_filter_errors`.
2. EXIF strings padded with NUL bytes or spaces, which some cameras write: they must still parse. Pinned by `test_exif_date_strips_padding_and_drops_a_bad_offset` (Task 1).
3. HEIC photos, the user's main format: EXIF must be read through pillow_heif. Pinned by the `.heic` case in `test_read_capture_from_files` (Task 1).
4. A video ffprobe can't read: it must raise, so ingest records an error for that file instead of silently storing no date. Pinned by `test_read_capture_raises_when_ffprobe_fails` (Task 1).
5. A date filter with a person under `--same-frame`: the date must not narrow the frames to none. Pinned by the `scope="frame"` line in `test_date_stacks_with_person` (Task 2).

---

### Task 1: `capture_date` module

**Files:**
- Create: `snapsort/modules/capture_date.py`
- Create: `tests/modules/test_capture_date.py`
- Modify: `tests/e2e/test_cli.py:52`. `snapsort modules` lists modules sorted by name, so `capture_date` now comes before `example`.

**Interfaces:**
- Consumes: `snapsort.contract.Frame`, `Module`, `Result`; `snapsort.ingest.validate`, `run_ingest`, `connect`; the `data_dir` and `sample_frames` fixtures from `tests/conftest.py`.
- Produces:
  - `results` rows with `module = 'capture_date'` on frame 0, `label = 'YYYY-MM-DD HH:MM:SS'`. Task 2 reads them.
  - `Capture(local: datetime, offset: str | None, source: str)`
  - `exif_date(exif: dict) -> Capture | None`
  - `video_date(tags: dict, tz=None) -> Capture | None`
  - `read_capture(path: str, kind: str) -> Capture | None`

- [ ] **Step 1: Write the failing tests**

Create `tests/modules/test_capture_date.py`:

```python
"""Capture date module: EXIF and video tags to local capture time."""
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from PIL import ExifTags, Image

from snapsort.contract import Frame
from snapsort.ingest import connect, run_ingest, validate
from snapsort.modules.capture_date import Capture, CaptureDate, exif_date, read_capture, video_date

MANILA = timezone(timedelta(hours=8))
SHOT = {36867: "2026:07:24 20:35:36", 36881: "+08:00"}  # DateTimeOriginal, OffsetTimeOriginal
QUICKTIME = ["-movflags", "use_metadata_tags", "-metadata", "com.apple.quicktime.creationdate=2026-07-15T15:13:55+0800"]


def write_image(path: Path, exif_ifd: dict | None = None) -> Path:
    image = Image.new("RGB", (32, 32), "red")
    if exif_ifd is None:
        image.save(path)
    else:
        exif = Image.Exif()
        exif.get_ifd(ExifTags.IFD.Exif).update(exif_ifd)
        image.save(path, exif=exif)
    return path


def write_video(path: Path, meta: list[str] = (), seconds: int = 1) -> Path:
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
         "-i", f"testsrc=duration={seconds}:size=64x48:rate=10", *meta, str(path)],
        check=True,
    )
    return path


def frames_for(path: Path, kind: str, idxs=(0,)) -> list[Frame]:
    return [Frame(1, str(path), kind, i, None if kind == "image" else float(i), Image.new("RGB", (8, 8)))
            for i in idxs]


# --- Parsing ---

def test_exif_date_with_offset():
    assert exif_date(SHOT) == Capture(datetime(2026, 7, 24, 20, 35, 36), "+08:00", "exif")


def test_exif_date_without_offset_keeps_local_time():
    assert exif_date({36867: "2026:09:30 11:18:00"}) == Capture(datetime(2026, 9, 30, 11, 18), None, "exif")


def test_exif_date_strips_padding_and_drops_a_bad_offset():
    assert exif_date({36867: "2026:07:24 20:35:36\x00", 36881: "garbage"}) == \
        Capture(datetime(2026, 7, 24, 20, 35, 36), None, "exif")


@pytest.mark.parametrize("exif", [
    {},
    {36867: ""},
    {36867: "0000:00:00 00:00:00"},   # unset camera clock
    {36867: "    :  :     :  :  "},   # blank EXIF date
    {36867: "1970:01:01 00:00:00"},   # epoch placeholder
])
def test_exif_date_rejects_missing_and_placeholder_dates(exif):
    assert exif_date(exif) is None


def test_video_date_prefers_the_quicktime_tag():
    tags = {"com.apple.quicktime.creationdate": "2026-07-15T15:13:55+0800",
            "creation_time": "2026-07-21T19:00:35.000000Z"}  # on iPhone clips this is the copy time
    assert video_date(tags, tz=MANILA) == Capture(datetime(2026, 7, 15, 15, 13, 55), "+08:00", "quicktime")


def test_video_date_converts_creation_time_from_utc():
    # 17:20 UTC is 01:20 the next day in Manila: the local date moves
    assert video_date({"creation_time": "2026-09-20T17:20:53.000000Z"}, tz=MANILA) == \
        Capture(datetime(2026, 9, 21, 1, 20, 53), "+08:00", "creation_time")


def test_video_date_skips_a_placeholder_quicktime_tag():
    tags = {"com.apple.quicktime.creationdate": "1904-01-01T00:00:00+0000",
            "creation_time": "2026-09-20T02:31:02.000000Z"}
    assert video_date(tags, tz=MANILA).source == "creation_time"


@pytest.mark.parametrize("tags", [
    {},
    {"creation_time": ""},
    {"creation_time": "garbage"},
    {"creation_time": "1970-01-01T00:00:00.000000Z"},
    {"creation_time": "1904-01-01T00:00:00.000000Z"},
])
def test_video_date_rejects_missing_and_placeholder_tags(tags):
    assert video_date(tags, tz=MANILA) is None


# --- Files ---

def test_read_capture_from_files(tmp_path):
    jpg = read_capture(str(write_image(tmp_path / "a.jpg", SHOT)), "image")
    assert jpg == Capture(datetime(2026, 7, 24, 20, 35, 36), "+08:00", "exif")
    heic = read_capture(str(write_image(tmp_path / "a.heic", SHOT)), "image")
    assert heic == Capture(datetime(2026, 7, 24, 20, 35, 36), "+08:00", "exif")
    mov = read_capture(str(write_video(tmp_path / "a.mov", QUICKTIME)), "video")
    assert mov == Capture(datetime(2026, 7, 15, 15, 13, 55), "+08:00", "quicktime")
    mp4 = read_capture(str(write_video(tmp_path / "a.mp4", ["-metadata", "creation_time=2026-09-20T02:31:02Z"])),
                       "video")
    assert mp4.source == "creation_time"


def test_read_capture_none_without_metadata(tmp_path):
    assert read_capture(str(write_image(tmp_path / "plain.jpg")), "image") is None
    assert read_capture(str(write_video(tmp_path / "plain.mp4")), "video") is None


def test_read_capture_raises_when_ffprobe_fails(tmp_path):
    path = tmp_path / "broken.mp4"
    path.write_bytes(b"not a video")
    with pytest.raises(RuntimeError, match="ffprobe failed"):
        read_capture(str(path), "video")


# --- Module ---

def test_output_passes_contract(sample_frames):
    assert validate(CaptureDate().process(sample_frames), sample_frames) == []


def test_one_result_with_local_label_and_utc(tmp_path):
    frames = frames_for(write_image(tmp_path / "a.jpg", SHOT), "image")
    [r] = validate(CaptureDate().process(frames), frames)
    assert (r.frame_idx, r.label) == (0, "2026-07-24 20:35:36")
    assert r.data == {"utc": "2026-07-24T12:35:36Z", "offset": "+08:00", "source": "exif"}
    assert (r.score, r.bbox, r.vector) == (None, None, None)


def test_no_offset_means_no_utc(tmp_path):
    frames = frames_for(write_image(tmp_path / "screenshot.jpg", {36867: "2026:09:30 11:18:00"}), "image")
    [r] = CaptureDate().process(frames)
    assert r.data == {"utc": None, "offset": None, "source": "exif"}


def test_no_result_without_a_date_or_off_frame_zero(tmp_path):
    assert CaptureDate().process(frames_for(write_image(tmp_path / "plain.jpg"), "image")) == []
    mov = write_video(tmp_path / "a.mov", QUICKTIME)
    assert CaptureDate().process(frames_for(mov, "video", range(10, 12))) == []


def test_ingest_stores_one_row_on_frame_zero(tmp_path, data_dir):
    path = write_video(tmp_path / "a.mov", QUICKTIME, seconds=20)  # 20 frames = two batches
    assert run_ingest([path], [CaptureDate()], data_dir)
    conn = connect(data_dir / "snapsort.db")
    rows = conn.execute(
        "SELECT f.idx, r.label FROM results r JOIN frames f ON f.id = r.frame_id "
        "WHERE r.module = 'capture_date'").fetchall()
    assert rows == [(0, "2026-07-15 15:13:55")]
```

In `tests/e2e/test_cli.py`, replace line 52:

```python
    assert proc.stdout.startswith("example\t1\t")
```

with:

```python
    assert any(line.startswith("example\t1\t") for line in proc.stdout.splitlines())
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/modules/test_capture_date.py -q`
Expected: collection error, `ModuleNotFoundError: No module named 'snapsort.modules.capture_date'`

- [ ] **Step 3: Write the module**

Create `snapsort/modules/capture_date.py`:

```python
"""Capture time from file metadata: EXIF for images, QuickTime/MP4 tags for videos.

One result per file, on frame 0, labeled with the local capture time "YYYY-MM-DD HH:MM:SS".
Files without a usable date get no result. Design: docs/design/2026-10-10-date-filter.md.
"""
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone

import pillow_heif
from PIL import ExifTags, Image

from snapsort.contract import Frame, Module, Result

pillow_heif.register_heif_opener()

DATE_TIME_ORIGINAL, OFFSET_TIME_ORIGINAL = 36867, 36881
VIDEO_TAGS = (("com.apple.quicktime.creationdate", "quicktime"), ("creation_time", "creation_time"))
MIN_YEAR = 1971  # earlier years are the 1904/1970 epochs cameras write when their clock was never set
LABEL = "%Y-%m-%d %H:%M:%S"


@dataclass
class Capture:
    local: datetime        # naive, local wall clock
    offset: str | None     # "+08:00"; None when the source gives local time only
    source: str            # "exif" | "quicktime" | "creation_time"


def exif_date(exif: dict) -> Capture | None:
    """The EXIF IFD as PIL returns it -> DateTimeOriginal with OffsetTimeOriginal, or None."""
    try:
        local = datetime.strptime(_clean(exif[DATE_TIME_ORIGINAL]), "%Y:%m:%d %H:%M:%S")
    except (KeyError, ValueError):
        return None
    if local.year < MIN_YEAR:
        return None
    try:
        offset = _offset(datetime.strptime(_clean(exif[OFFSET_TIME_ORIGINAL]), "%z"))
    except (KeyError, ValueError):
        offset = None
    return Capture(local, offset, "exif")


def video_date(tags: dict, tz=None) -> Capture | None:
    """ffprobe format tags -> the QuickTime creation date (local time as written), else creation_time
    (UTC, converted to tz; None = this computer's zone). A tag that doesn't parse or predates MIN_YEAR is skipped."""
    for tag, source in VIDEO_TAGS:
        try:
            when = datetime.fromisoformat(_clean(tags[tag]))
        except (KeyError, ValueError):
            continue
        if source == "creation_time":
            when = (when if when.tzinfo else when.replace(tzinfo=timezone.utc)).astimezone(tz)
        if when.year >= MIN_YEAR:
            return Capture(when.replace(tzinfo=None), _offset(when) if when.tzinfo else None, source)
    return None


def read_capture(path: str, kind: str) -> Capture | None:
    if kind == "image":
        with Image.open(path) as im:
            return exif_date(im.getexif().get_ifd(ExifTags.IFD.Exif))
    out = subprocess.run(  # the same call location.read_gps makes
        ["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", path],
        stdin=subprocess.DEVNULL, capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {out.stderr.strip()}")
    return video_date(json.loads(out.stdout).get("format", {}).get("tags", {}))


def _clean(value) -> str:
    return str(value).strip("\x00 ")


def _offset(aware: datetime) -> str:
    z = aware.strftime("%z")  # "+0800"
    return f"{z[:3]}:{z[3:5]}"


def _data(cap: Capture) -> dict:
    utc = None
    if cap.offset is not None:
        aware = cap.local.replace(tzinfo=datetime.strptime(cap.offset, "%z").tzinfo)
        utc = aware.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"utc": utc, "offset": cap.offset, "source": cap.source}


class CaptureDate(Module):
    name = "capture_date"
    version = "1"

    def process(self, frames: list[Frame]) -> list[Result]:
        results = []
        for f in frames:
            if f.idx != 0:
                continue
            cap = read_capture(f.media_path, f.media_kind)
            if cap is not None:
                results.append(Result(0, label=cap.local.strftime(LABEL), data=_data(cap)))
        return results
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/modules/test_capture_date.py tests/e2e/test_cli.py tests/pipeline -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add snapsort/modules/capture_date.py tests/modules/test_capture_date.py tests/e2e/test_cli.py
git commit -m "Add capture_date module"
```

---

### Task 2: Date filter and capture-time sort

**Files:**
- Modify: `snapsort/search.py`. Imports; `Hit`; a new `_date` after `_media_kind`; `FILTERS`; `_hits`, `_hit` and `_rank`.
- Test: `tests/search/test_search.py`

**Interfaces:**
- Consumes: `results` rows with `module = 'capture_date'` and `label = 'YYYY-MM-DD HH:MM:SS'` from Task 1.
- Produces:
  - the filter `{"kind": "date", "from": str | None, "to": str | None}`
  - `Hit.captured_at: str | None`, a field right after `added_at`
  - newest/oldest ordered by `captured_at or added_at`
  - Task 3 uses all of these.

- [ ] **Step 1: Write the failing tests**

In `tests/search/test_search.py`, add after the `place` helper:

```python
def captured(conn, frame_id, when):
    """A capture_date result as the module stores it: local time 'YYYY-MM-DD HH:MM:SS'."""
    with conn:
        conn.execute("INSERT INTO results (frame_id, module, label) VALUES (?, 'capture_date', ?)", (frame_id, when))
```

Add after `test_media_kind`:

```python
def test_date_range_includes_both_days(db):
    ids = {}
    for day in ("2026-07-14", "2026-07-15", "2026-07-31", "2026-08-01"):
        mid, [fid] = media(db, "image")
        captured(db, fid, f"{day} 23:59:59")
        ids[day] = mid
    media(db, "image")  # no capture date: never matches

    def found(lo, hi):
        return {h.media_id for h in search(db, [{"kind": "date", "from": lo, "to": hi}])}

    assert found("2026-07-15", "2026-07-31") == {ids["2026-07-15"], ids["2026-07-31"]}
    assert found("2026-07-15", None) == {ids["2026-07-15"], ids["2026-07-31"], ids["2026-08-01"]}
    assert found(None, "2026-07-14") == {ids["2026-07-14"]}
    assert found("2026-09-01", None) == set()


def test_date_matches_the_whole_video(db):
    vid, f = media(db, "video", frames=3)
    captured(db, f[0], "2026-07-15 15:13:55")
    [hit] = search(db, [{"kind": "date", "from": "2026-07-15"}])
    assert hit.media_id == vid and ts_of(hit) == [0.0, 1.0, 2.0]
    assert hit.captured_at == "2026-07-15 15:13:55"


def test_date_stacks_with_person(db):
    july, f = media(db, "video", frames=3)
    captured(db, f[0], "2026-07-15 10:00:00")
    august, [g] = media(db, "image")
    captured(db, g, "2026-08-02 10:00:00")
    anna = person(db, [f[2], g])
    filters = [{"kind": "date", "from": "2026-07-01", "to": "2026-07-31"},
               {"kind": "person", "ids": [anna], "match": "all"}]
    [hit] = search(db, filters)
    assert hit.media_id == july and ts_of(hit) == [2.0]  # the person's frame, not the whole video
    [hit] = search(db, filters, scope="frame")
    assert ts_of(hit) == [2.0]  # a whole-file filter doesn't narrow the frames
    assert {h.media_id for h in search(db, filters, combine="any")} == {july, august}


def test_newest_and_oldest_use_capture_time(db):
    old, [f] = media(db, "image", added_at="2026-10-09 12:00:00")
    captured(db, f, "2020-01-01 00:00:00")
    new, [g] = media(db, "image", added_at="2026-10-09 10:00:00")
    captured(db, g, "2026-07-15 10:00:00")
    undated, _ = media(db, "image", added_at="2026-10-09 11:00:00")  # falls back to added_at
    hits = search(db, [], sort="newest")
    assert [h.media_id for h in hits] == [undated, new, old]
    assert [h.captured_at for h in hits] == [None, "2026-07-15 10:00:00", "2020-01-01 00:00:00"]
    assert [h.media_id for h in search(db, [], sort="oldest")] == [old, new, undated]
```

In the `test_filter_errors` parametrize list, add these cases after the `mediaKind` case. The fixture library has no capture dates, so the last case also covers the backfill hint:

```python
    ([{"kind": "date"}], "date filter needs from or to"),
    ([{"kind": "date", "from": "2026-7-1"}], "date must be YYYY-MM-DD, got '2026-7-1'"),
    ([{"kind": "date", "to": "2026-02-30"}], "date must be YYYY-MM-DD, got '2026-02-30'"),
    ([{"kind": "date", "from": "2026-08-01", "to": "2026-07-01"}],
     "date range starts after it ends: 2026-08-01 > 2026-07-01"),
    ([{"kind": "date", "from": "2026-07-01"}],
     "no capture dates in this library. run snapsort ingest --modules capture_date"),
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/search/test_search.py -q -k "date or capture_time or filter_errors"`
Expected: the new tests fail with `QueryError: unsupported filter kind: 'date'`, or with `AttributeError: 'Hit' object has no attribute 'captured_at'`

- [ ] **Step 3: Implement**

In `snapsort/search.py`:

Replace the imports block:

```python
import sqlite3
from dataclasses import dataclass
from pathlib import Path
```

with:

```python
import re
import sqlite3
from dataclasses import dataclass
from datetime import date
from pathlib import Path
```

After the `CHUNK = ...` line, add:

```python
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
```

In `Hit`, after `added_at: str`, add:

```python
    captured_at: str | None                     # local capture time "YYYY-MM-DD HH:MM:SS"; None if unknown
```

After `_media_kind`, add:

```python
def _date(conn, f: dict, scope: str) -> Match:
    """The whole files captured from `from` to `to`, both days included. Files without a capture date never match."""
    lo, hi = f.get("from"), f.get("to")
    if lo is None and hi is None:
        raise QueryError("date filter needs from or to")
    for day in (lo, hi):
        if day is not None and not _is_day(day):
            raise QueryError(f"date must be YYYY-MM-DD, got {day!r}")
    if lo is not None and hi is not None and lo > hi:
        raise QueryError(f"date range starts after it ends: {lo} > {hi}")
    if conn.execute("SELECT 1 FROM results WHERE module = 'capture_date' LIMIT 1").fetchone() is None:
        raise QueryError("no capture dates in this library. run snapsort ingest --modules capture_date")
    rows = conn.execute(
        "SELECT DISTINCT f.media_id FROM results r JOIN frames f ON f.id = r.frame_id "
        "WHERE r.module = 'capture_date' AND substr(r.label, 1, 10) BETWEEN ? AND ?",
        (lo or "0000-00-00", hi or "9999-99-99")).fetchall()
    return dict.fromkeys(r[0] for r in rows)


def _is_day(s) -> bool:
    """A real calendar day written YYYY-MM-DD."""
    if not isinstance(s, str) or not DAY.fullmatch(s):
        return False
    try:
        date.fromisoformat(s)
    except ValueError:
        return False
    return True
```

Replace `FILTERS = ...` with:

```python
FILTERS = {"person": _person, "place": _place, "mediaKind": _media_kind, "date": _date}
```

Replace `_hits` and `_hit` with:

```python
def _hits(conn, matched: Match, scores: dict[int, float], gap: float) -> list[Hit]:
    """One Hit per matched file, with its marked frames (every frame for a whole-file match) and their scores."""
    captured = dict(conn.execute("SELECT f.media_id, r.label FROM results r JOIN frames f ON f.id = r.frame_id "
                                 "WHERE r.module = 'capture_date'"))
    by_media: dict[int, tuple] = {}
    for fid, mid, ts, path, kind, added_at in conn.execute(FRAMES):
        if mid in matched and (matched[mid] is None or fid in matched[mid]):
            entry = by_media.setdefault(mid, (path, kind, added_at, captured.get(mid), []))
            entry[4].append((ts, scores.get(fid)))
    return [_hit(mid, *entry, gap) for mid, entry in by_media.items()]


def _hit(media_id, path, kind, added_at, captured_at, matches, gap) -> Hit:
    score = max((s for _, s in matches if s is not None), default=None)
    if kind == "image":
        return Hit(media_id, path, kind, added_at, captured_at, score, [], [], None)
    matches.sort(key=lambda m: m[0])
    best_ts = matches[0][0] if score is None else next(t for t, s in matches if s == score)
    return Hit(media_id, path, kind, added_at, captured_at, score, matches, segments(matches, gap), best_ts)
```

In `_rank`, replace the `newest` and `oldest` branches with:

```python
    elif sort == "newest":  # capture time, else added_at; 1 s resolution, so a tie goes to the later insert
        hits.sort(key=lambda h: (h.captured_at or h.added_at, h.media_id), reverse=True)
    elif sort == "oldest":
        hits.sort(key=lambda h: (h.captured_at or h.added_at, h.media_id))
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/search/test_search.py -q`
Expected: all pass, the existing tests included. `test_cli_search_json` still passes, because `_json` doesn't emit `capturedAt` until Task 3.

- [ ] **Step 5: Commit**

```bash
git add snapsort/search.py tests/search/test_search.py
git commit -m "Add date filter and sort newest/oldest by capture time"
```

---

### Task 3: CLI `--from` / `--to`, `capturedAt`, and the done check

**Files:**
- Modify: `snapsort/cli.py`. The `search` arguments, `_read`, and `_json`.
- Test: `tests/search/test_search.py`

**Interfaces:**
- Consumes: Task 2's date filter shape and `Hit.captured_at`.
- Produces: `snapsort search --from YYYY-MM-DD --to YYYY-MM-DD`, and `capturedAt` in `--json`.

- [ ] **Step 1: Write the failing tests**

In `tests/search/test_search.py`, in `test_cli_search_json`, replace the expected dict's first line:

```python
    assert json.loads(out) == [{"id": query, "kind": "image", "path": "/lib/q.jpg", "name": "q.jpg",
                                "addedAt": "2026-10-09 10:00:00", "score": pytest.approx(1.0, abs=1e-5),
```

with:

```python
    assert json.loads(out) == [{"id": query, "kind": "image", "path": "/lib/q.jpg", "name": "q.jpg",
                                "addedAt": "2026-10-09 10:00:00", "capturedAt": None,
                                "score": pytest.approx(1.0, abs=1e-5),
```

Add after `test_cli_or_and_same_frame`:

```python
def test_cli_date_flags(db, run):
    _, [f] = media(db, "image", name="july.jpg")
    captured(db, f, "2026-07-15 10:00:00")
    _, [g] = media(db, "image", name="aug.jpg")
    captured(db, g, "2026-08-02 10:00:00")
    assert run("search", "--from", "2026-07-01", "--to", "2026-07-31") == (0, "/lib/july.jpg  image\n1 of 2 files\n", "")
    assert run("search", "--from", "2026-08-01") == (0, "/lib/aug.jpg  image\n1 of 2 files\n", "")
    code, out, _ = run("search", "--to", "2026-07-31", "--json")
    assert [h["capturedAt"] for h in json.loads(out)] == ["2026-07-15 10:00:00"]
    code, _, err = run("search", "--to", "2026-7-1")
    assert code == 2 and "date must be YYYY-MM-DD, got '2026-7-1'" in err
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/search/test_search.py -q -k "cli_date or cli_search_json"`
Expected: `test_cli_date_flags` exits 2 with `unrecognized arguments: --from`. `test_cli_search_json` fails on the missing `capturedAt` key.

- [ ] **Step 3: Implement**

In `snapsort/cli.py`, after the `s.add_argument("--kind", ...)` line, add:

```python
    s.add_argument("--from", dest="date_from", metavar="YYYY-MM-DD", help="captured on or after this day")
    s.add_argument("--to", dest="date_to", metavar="YYYY-MM-DD", help="captured on or before this day")
```

In `_read`, after the `if args.kind:` block, add:

```python
        if args.date_from is not None or args.date_to is not None:
            filters.append({"kind": "date", "from": args.date_from, "to": args.date_to})
```

In `_json`, replace:

```python
    return {"id": h.media_id, "kind": h.kind, "path": h.path, "name": Path(h.path).name, "addedAt": h.added_at,
```

with:

```python
    return {"id": h.media_id, "kind": h.kind, "path": h.path, "name": Path(h.path).name, "addedAt": h.added_at,
            "capturedAt": h.captured_at,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/search/test_search.py -q`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add snapsort/cli.py tests/search/test_search.py
git commit -m "Add --from and --to to snapsort search"
```

- [ ] **Step 6: Manual done check**

In the scratchpad `calibrate/` directory, whose `.snapsort/` holds the 43-file calibration library, backfill the dates:

```bash
uv run --project <worktree> snapsort ingest "/Users/a1234/Downloads/test images" /Users/a1234/Movies/Voogle/IMG_1607.MOV /Users/a1234/Movies/Voogle/IMG_1608.MOV /Users/a1234/Movies/Voogle/IMG_1611.MOV /Users/a1234/Movies/Voogle/IMG_1612.MOV /Users/a1234/Movies/Voogle/IMG_1613.MOV /Users/a1234/Movies/Voogle/IMG_1614.MOV --modules capture_date
```

Expected: one `capture_date:done` line per file, exit 0.

Then run each of these and show the output to the user:

```bash
uv run --project <worktree> snapsort search --from 2026-07-15 --to 2026-07-15
uv run --project <worktree> snapsort search --from 2026-07-25 --to 2026-07-25 --json
uv run --project <worktree> snapsort search --to 2030-12-31
uv run --project <worktree> snapsort people
uv run --project <worktree> snapsort search --person <id with the most files> --from 2026-09-01
```

Expected:
- The first search prints exactly the 6 `IMG_16xx.MOV` files, then `6 of 43 files`.
- The second includes `IMG_1937 2.HEIC` with `"capturedAt": "2026-07-25 00:23:50"`.
- The third prints `42 of 43 files`, without `IMG_2703.JPG`.
- The last prints only that person's files from September on.

- [ ] **Step 7: Full test run**

Run: `uv run pytest -q`
Expected: everything passes. The baseline was 210 passed and 6 skipped; this plan adds the new tests on top.
