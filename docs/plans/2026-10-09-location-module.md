# Location Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `location` module that stores each file's GPS coordinates (from EXIF or video tags) plus an offline place name.

**Architecture:** One module file, `snapsort/modules/location.py`, with no pipeline changes. On frame `idx == 0` it reads GPS from `media_path`: Pillow EXIF for images, `ffprobe` format tags for videos. It looks up the nearest GeoNames place with the `reverse-geocode` package and returns one `Result` per file.

**Tech Stack:** Python 3.12, uv, Pillow + pillow-heif (already installed), `ffprobe` (ships with ffmpeg), `reverse-geocode` (new, pulls scipy), pytest.

**Spec:** `docs/design/2026-10-09-location-module.md`

## Global Constraints

- Python 3.12. Every command runs through `uv run`.
- Don't change `snapsort/ingest.py`, `snapsort/contract.py`, `snapsort/modules/__init__.py`, `tests/conftest.py` or any existing test.
- One new runtime dependency, `reverse-geocode`. Add nothing else.
- `reverse_geocode` is imported only inside `place_for`, never at the top of the file. Discovery imports every module file on every CLI call.
- Fixed values: `name = "location"`, `version = "1"`, `MAX_PLACE_KM = 50`, Earth radius 6371 km. Video tag order: `com.apple.quicktime.location.ISO6709`, `location`, `location-eng`.
- No network at runtime. Tests generate their media at test time, so no binary files are committed.
- Commit messages have no `Co-Authored-By` lines.

## Review Focus

1. **Real iPhone and Android files.** Tests use files written by Pillow and ffmpeg, not by a phone, and real phone files should give the same coordinates. No automated test covers this. Task 3 Step 6 is a manual check, run only if a real phone photo or video is available.
2. **Paths with spaces.** `ffprobe` gets the path as one argument. Tested by the `paris trip.mp4` cases (Tasks 1 and 3).
3. **Southern and western hemispheres** get negative values. Tested by Sydney (S) and `+40.7580-073.9855/` (Task 1), and the ocean point (W, Task 3).
4. **`snapsort modules` and `ingest --modules example`** don't pay the 4 s geocoder import. Tested by `test_import_does_not_load_geocoder` (Task 2).
5. **An unreadable video** becomes a module error (retried next run), not a silent "no location". Tested by `test_read_gps_raises_when_ffprobe_fails` (Task 1).

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `snapsort/modules/location.py` | GPS parsing and reading (1), place lookup (2), `Location` module (3) | 1, 2, 3 |
| `tests/modules/test_location.py` | Tests for each part, plus one run through `run_ingest` | 1, 2, 3 |
| `pyproject.toml`, `uv.lock` | `reverse-geocode` dependency | 2 |
| `README.md` | Status row, docs links, GeoNames credit | 3 |

---

### Task 1: GPS reading

**Files:**
- Create: `snapsort/modules/location.py`
- Test: `tests/modules/test_location.py`

**Interfaces:**
- Consumes: nothing from this plan. `pillow_heif` and Pillow are already dependencies.
- Produces:
  - `gps_from_exif(gps: dict) -> tuple[float, float] | None`
  - `gps_from_iso6709(s: str) -> tuple[float, float] | None`
  - `read_gps(path: str, kind: str) -> tuple[float, float] | None`: `kind` is `"image"` or `"video"`. Raises `RuntimeError("ffprobe failed: ...")` when ffprobe exits non-zero.
  - Test helpers `SYDNEY_EXIF`, `VIDEO_META`, `TAGGED`, `write_image`, `write_video`, `write_tagged`, used by Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests**

Create `tests/modules/test_location.py`:

```python
"""Location module: GPS from EXIF and video tags, offline place names."""
import subprocess
from pathlib import Path

import pytest
from PIL import ExifTags, Image, TiffImagePlugin

from snapsort.modules.location import gps_from_exif, gps_from_iso6709, read_gps

SYDNEY_EXIF = {1: "S", 2: (33.0, 51.0, 24.48), 3: "E", 4: (151.0, 12.0, 55.08)}  # Opera House
VIDEO_META = {
    "paris trip.mp4": ["-metadata", "location=+48.8584+002.2945/"],
    "tokyo.mov": ["-movflags", "use_metadata_tags",
                  "-metadata", "com.apple.quicktime.location.ISO6709=+35.6595+139.7005+012.345/"],
}
# file name, kind, lat, lon, country code
TAGGED = [
    ("sydney.jpg", "image", -33.8568, 151.2153, "AU"),
    ("sydney.heic", "image", -33.8568, 151.2153, "AU"),
    ("sydney.webp", "image", -33.8568, 151.2153, "AU"),
    ("paris trip.mp4", "video", 48.8584, 2.2945, "FR"),
    ("tokyo.mov", "video", 35.6595, 139.7005, "JP"),
]


def write_image(path: Path, gps: dict | None = None) -> Path:
    image = Image.new("RGB", (32, 32), "red")
    if gps is None:
        image.save(path)
    else:
        exif = Image.Exif()
        exif.get_ifd(ExifTags.IFD.GPSInfo).update(gps)
        image.save(path, exif=exif)
    return path


def write_video(path: Path, meta: list[str] = (), seconds: int = 1) -> Path:
    subprocess.run(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
         "-i", f"testsrc=duration={seconds}:size=64x48:rate=10", *meta, str(path)],
        check=True,
    )
    return path


def write_tagged(tmp_path: Path, name: str, seconds: int = 1) -> Path:
    if name in VIDEO_META:
        return write_video(tmp_path / name, VIDEO_META[name], seconds)
    return write_image(tmp_path / name, SYDNEY_EXIF)


# --- GPS reading ---

def test_gps_from_exif_converts_degrees_minutes_seconds():
    assert gps_from_exif(SYDNEY_EXIF) == pytest.approx((-33.8568, 151.2153), abs=1e-4)


@pytest.mark.parametrize("gps", [
    {},
    {1: "N", 2: (0, 0, 0), 3: "E", 4: (0, 0, 0)},                          # no-fix 0/0
    {**SYDNEY_EXIF, 2: (TiffImagePlugin.IFDRational(1, 0), 0, 0)},       # zero denominator
    {k: v for k, v in SYDNEY_EXIF.items() if k != 1},                     # missing GPSLatitudeRef
    {**SYDNEY_EXIF, 1: "X"},                                              # bad ref
    {**SYDNEY_EXIF, 2: (95.0, 0, 0)},                                     # latitude out of range
    {**SYDNEY_EXIF, 2: 33.0},                                             # not a d/m/s triple
])
def test_gps_from_exif_rejects_bad_values(gps):
    assert gps_from_exif(gps) is None


def test_gps_from_iso6709():
    assert gps_from_iso6709("+35.6595+139.7005+012.345/") == (35.6595, 139.7005)
    assert gps_from_iso6709("+40.7580-073.9855/") == (40.758, -73.9855)


@pytest.mark.parametrize("s", ["", "garbage", "+4012.3-07401.2/", "+00.0000+000.0000/"])
def test_gps_from_iso6709_rejects_bad_values(s):
    assert gps_from_iso6709(s) is None


@pytest.mark.parametrize("name, kind, lat, lon, _cc", TAGGED)
def test_read_gps_from_files(tmp_path, name, kind, lat, lon, _cc):
    path = write_tagged(tmp_path, name)
    assert read_gps(str(path), kind) == pytest.approx((lat, lon), abs=1e-4)


def test_read_gps_none_without_metadata(tmp_path):
    assert read_gps(str(write_image(tmp_path / "plain.jpg")), "image") is None
    assert read_gps(str(write_video(tmp_path / "plain.mp4")), "video") is None


def test_read_gps_raises_when_ffprobe_fails(tmp_path):
    path = tmp_path / "broken.mp4"
    path.write_bytes(b"not a video")
    with pytest.raises(RuntimeError, match="ffprobe failed"):
        read_gps(str(path), "video")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/modules/test_location.py -q`
Expected: collection error `ModuleNotFoundError: No module named 'snapsort.modules.location'`

- [ ] **Step 3: Write the implementation**

Create `snapsort/modules/location.py`:

```python
"""GPS location from file metadata, plus an offline place name (GeoNames via reverse_geocode).

One result per file, on frame 0. Files without usable GPS get no result.
"""
import json
import math
import re
import subprocess

import pillow_heif
from PIL import ExifTags, Image

pillow_heif.register_heif_opener()

VIDEO_TAGS = ("com.apple.quicktime.location.ISO6709", "location", "location-eng")
ISO6709 = re.compile(r"^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)")


def gps_from_exif(gps: dict) -> tuple[float, float] | None:
    """EXIF GPS IFD (tags 1-4) -> (lat, lon) in decimal degrees, or None if missing or invalid."""
    try:
        lat = _degrees(gps[2], gps[1], "N", "S")
        lon = _degrees(gps[4], gps[3], "E", "W")
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None
    return _valid(lat, lon)


def gps_from_iso6709(s: str) -> tuple[float, float] | None:
    """'+35.6595+139.7005+012.345/' -> (35.6595, 139.7005), or None."""
    m = ISO6709.match(s)
    return _valid(float(m[1]), float(m[2])) if m else None


def read_gps(path: str, kind: str) -> tuple[float, float] | None:
    if kind == "image":
        with Image.open(path) as im:
            return gps_from_exif(im.getexif().get_ifd(ExifTags.IFD.GPSInfo))
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", path],
        stdin=subprocess.DEVNULL, capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {out.stderr.strip()}")
    tags = json.loads(out.stdout).get("format", {}).get("tags", {})
    s = next((tags[t] for t in VIDEO_TAGS if t in tags), None)
    return gps_from_iso6709(s) if s else None


def _degrees(value, ref, pos: str, neg: str) -> float:
    if ref not in (pos, neg):
        raise ValueError(f"bad GPS ref {ref!r}")
    d, m, s = (float(x) for x in value)
    deg = d + m / 60 + s / 3600
    return -deg if ref == neg else deg


def _valid(lat: float, lon: float) -> tuple[float, float] | None:
    if not (math.isfinite(lat) and math.isfinite(lon)):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None
    return lat, lon
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/modules/test_location.py -q`
Expected: `20 passed`

Run: `uv run pytest -q`
Expected: `74 passed`. The file has no `Module` subclass yet, so discovery ignores it.

- [ ] **Step 5: Commit**

```bash
git add snapsort/modules/location.py tests/modules/test_location.py
git commit -m "Read GPS from image EXIF and video tags"
```

---

### Task 2: Place names

**Files:**
- Modify: `snapsort/modules/location.py` (add a constant, append two functions)
- Modify: `pyproject.toml`, `uv.lock` (via `uv add`)
- Test: `tests/modules/test_location.py` (change imports, append tests)

**Interfaces:**
- Consumes: Task 1's `location.py` and test helpers.
- Produces: `place_for(lat: float, lon: float) -> dict | None`. It returns `{"place", "city", "state", "country", "country_code"}`, with empty strings turned into `None`. It returns `None` when the nearest place is more than `MAX_PLACE_KM` away.

- [ ] **Step 1: Write the failing tests**

In `tests/modules/test_location.py`, replace the import block with:

```python
"""Location module: GPS from EXIF and video tags, offline place names."""
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import ExifTags, Image, TiffImagePlugin

from snapsort.modules.location import gps_from_exif, gps_from_iso6709, place_for, read_gps
```

Append to the end of the file:

```python


# --- Place names ---

def test_place_name_has_city_state_country():
    p = place_for(40.758, -73.9855)
    assert p == {"place": "Times Square, New York, United States", "city": "Times Square",
                 "state": "New York", "country": "United States", "country_code": "US"}


def test_springfields_get_different_names():
    illinois, missouri = place_for(39.7817, -89.6501), place_for(37.2153, -93.2982)
    assert (illinois["state"], missouri["state"]) == ("Illinois", "Missouri")
    assert illinois["place"] != missouri["place"]


def test_no_place_far_from_land():
    assert place_for(0.0, -160.0) is None


def test_import_does_not_load_geocoder():
    code = "import sys, snapsort.modules.location; assert 'reverse_geocode' not in sys.modules"
    subprocess.run([sys.executable, "-c", code], check=True)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/modules/test_location.py -q`
Expected: collection error `ImportError: cannot import name 'place_for'`

- [ ] **Step 3: Add the dependency**

Run: `uv add reverse-geocode`
Expected: `pyproject.toml` dependencies gain `"reverse-geocode>=1.6.6"`, and `uv.lock` adds `reverse-geocode` and `scipy`.

- [ ] **Step 4: Write the implementation**

In `snapsort/modules/location.py`, add this line directly below the `ISO6709 = ...` line:

```python
MAX_PLACE_KM = 50
```

Append to the end of the file:

```python


def place_for(lat: float, lon: float) -> dict | None:
    """Nearest GeoNames place within MAX_PLACE_KM, or None."""
    import reverse_geocode  # pulls scipy: imported here so discovery stays fast

    p = reverse_geocode.get((lat, lon))
    if _km(lat, lon, p["latitude"], p["longitude"]) > MAX_PLACE_KM:
        return None
    fields = {k: p.get(k) or None for k in ("city", "state", "country", "country_code")}
    parts = []
    for part in (fields["city"], fields["state"], fields["country"]):
        if part and (not parts or parts[-1] != part):
            parts.append(part)
    return {"place": ", ".join(parts) or None, **fields}


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(a))
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/modules/test_location.py -q`
Expected: `24 passed`

- [ ] **Step 6: Commit**

```bash
git add snapsort/modules/location.py tests/modules/test_location.py pyproject.toml uv.lock
git commit -m "Add offline place names"
```

---

### Task 3: Location module and README

**Files:**
- Modify: `snapsort/modules/location.py` (add an import and a constant, append the class)
- Modify: `README.md`
- Test: `tests/modules/test_location.py` (change imports, append a helper and tests)

**Interfaces:**
- Consumes: `read_gps` (Task 1), `place_for` (Task 2). From the pipeline: `Frame`, `Module`, `Result` (`snapsort.contract`), plus `validate`, `run_ingest`, `connect` (`snapsort.ingest`). Fixtures `sample_frames` and `data_dir` come from `tests/conftest.py`.
- Produces: class `Location(Module)` with `name = "location"` and `version = "1"`. Each file gets at most one `Result` on `frame_idx` 0:
  - `label` is the place name, or `None`.
  - `data` has the keys `lat, lon, place, city, state, country, country_code`, in that order. The place keys are `None` when no place is within 50 km.

- [ ] **Step 1: Write the failing tests**

In `tests/modules/test_location.py`, replace the import block with:

```python
"""Location module: GPS from EXIF and video tags, offline place names."""
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import ExifTags, Image, TiffImagePlugin

from snapsort.contract import Frame
from snapsort.ingest import connect, run_ingest, validate
from snapsort.modules.location import (
    Location, gps_from_exif, gps_from_iso6709, place_for, read_gps,
)
```

Append to the end of the file:

```python


# --- Module ---

def frames_for(path: Path, kind: str, idxs=(0,)) -> list[Frame]:
    return [Frame(1, str(path), kind, i, None if kind == "image" else float(i), Image.new("RGB", (8, 8)))
            for i in idxs]


@pytest.fixture(scope="module")
def location() -> Location:
    module = Location()
    module.setup()
    return module


def test_output_passes_contract(location, sample_frames):
    assert validate(location.process(sample_frames), sample_frames) == []


@pytest.mark.parametrize("name, kind, lat, lon, cc", TAGGED)
def test_one_result_per_tagged_file(location, tmp_path, name, kind, lat, lon, cc):
    frames = frames_for(write_tagged(tmp_path, name), kind)
    [r] = validate(location.process(frames), frames)
    assert r.frame_idx == 0
    assert (r.data["lat"], r.data["lon"]) == pytest.approx((lat, lon), abs=1e-4)
    assert r.data["country_code"] == cc
    assert r.label == r.data["place"].lower()


def test_result_shape(location, tmp_path):
    frames = frames_for(write_tagged(tmp_path, "sydney.jpg"), "image")
    [r] = validate(location.process(frames), frames)
    assert list(r.data) == ["lat", "lon", "place", "city", "state", "country", "country_code"]
    assert r.data["state"] == "New South Wales"
    assert (r.score, r.bbox, r.vector) == (None, None, None)


def test_coordinates_without_place_far_from_land(location, tmp_path):
    path = write_image(tmp_path / "ocean.jpg", {1: "N", 2: (0, 0, 0), 3: "W", 4: (160, 0, 0)})
    frames = frames_for(path, "image")
    [r] = validate(location.process(frames), frames)
    assert r.label is None
    assert r.data == {"lat": 0.0, "lon": -160.0, "place": None, "city": None,
                      "state": None, "country": None, "country_code": None}


def test_no_result_without_gps(location, tmp_path):
    frames = (frames_for(write_image(tmp_path / "plain.jpg"), "image")
              + frames_for(write_video(tmp_path / "plain.mp4"), "video"))
    assert location.process(frames) == []


def test_only_frame_zero_is_read(location, tmp_path):
    path = write_tagged(tmp_path, "paris trip.mp4")
    first = frames_for(path, "video", range(4))
    assert [r.frame_idx for r in validate(location.process(first), first)] == [0]
    assert location.process(frames_for(path, "video", range(16, 20))) == []


def test_ingest_stores_one_row_on_frame_zero(tmp_path, data_dir):
    path = write_tagged(tmp_path, "paris trip.mp4", seconds=20)  # 20 frames = two batches
    assert run_ingest([path], [Location()], data_dir)
    conn = connect(data_dir / "snapsort.db")
    rows = conn.execute(
        "SELECT f.idx, r.label, json_extract(r.data, '$.country_code') FROM results r "
        "JOIN frames f ON f.id = r.frame_id WHERE r.module = 'location'"
    ).fetchall()
    assert len(rows) == 1 and rows[0][0] == 0 and rows[0][2] == "FR"
    assert conn.execute("SELECT status FROM runs WHERE module = 'location'").fetchall() == [("done",)]
    assert conn.execute("SELECT count(*) FROM frames").fetchone() == (20,)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/modules/test_location.py -q`
Expected: collection error `ImportError: cannot import name 'Location'`

- [ ] **Step 3: Write the implementation**

In `snapsort/modules/location.py`, add the contract import below the PIL import, separated by one blank line:

```python
from PIL import ExifTags, Image

from snapsort.contract import Frame, Module, Result
```

Add this line directly below `MAX_PLACE_KM = 50`:

```python
NO_PLACE = dict.fromkeys(("place", "city", "state", "country", "country_code"))
```

Append to the end of the file:

```python


class Location(Module):
    name = "location"
    version = "1"

    def setup(self) -> None:
        place_for(0.0, 0.0)  # loads the GeoNames index (~4 s)

    def process(self, frames: list[Frame]) -> list[Result]:
        results = []
        for f in frames:
            if f.idx != 0:
                continue
            gps = read_gps(f.media_path, f.media_kind)
            if gps is None:
                continue
            place = place_for(*gps) or NO_PLACE
            results.append(Result(0, label=place["place"], data={"lat": gps[0], "lon": gps[1], **place}))
        return results
```

- [ ] **Step 4: Update the README**

In `README.md`, replace the status table rows:

```markdown
| Ingest pipeline (CLI, frames, module runner, storage) | Done |
| Feature modules (embeddings, people, objects, location) | Not started; `example` module is the template |
```

with:

```markdown
| Ingest pipeline (CLI, frames, module runner, storage) | Done |
| Location module (GPS + offline place names) | Done |
| Feature modules (embeddings, people, objects) | Not started; `example` module is the template |
```

Under `## Docs`, append below the ingest pipeline line:

```markdown
- Location module: [design](docs/design/2026-10-09-location-module.md), [plan](docs/plans/2026-10-09-location-module.md)
```

Append to the end of the file:

```markdown

## Credits

Place names from GeoNames (geonames.org), CC BY 4.0.
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/modules/test_location.py -q`
Expected: `35 passed`

Run: `uv run pytest -q`
Expected: `89 passed`

Run: `uv run snapsort modules`
Expected: two lines, `example` and then `location`, each with version `1`.

- [ ] **Step 6: Manual check on real phone files (only if available)**

Run: `uv run snapsort ingest <iPhone photo or video> --modules location` in a scratch directory, then:

```bash
sqlite3 .snapsort/snapsort.db "SELECT label, data FROM results WHERE module = 'location'"
```

Expected: one row per file that has GPS, with the place where it was taken. Note the result in the task report. If no real files are available, say so in the report.

- [ ] **Step 7: Commit**

```bash
git add snapsort/modules/location.py tests/modules/test_location.py README.md
git commit -m "Add location module"
```
