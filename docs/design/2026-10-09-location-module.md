# Location module design

Date: 2026-10-09
Status: approved. Plan: `docs/plans/2026-10-09-location-module.md`. Builds on `docs/design/2026-10-09-ingest-pipeline.md`. Branch `location-module`.

## Goal

Store where each photo or video was taken: GPS coordinates from file metadata plus an offline place name, so the frontend's Places facet and the chatbot can filter by place. Nothing leaves the machine.

## Scope

In: GPS from JPEG, HEIC and WebP EXIF. GPS from MOV/MP4 metadata (iPhone and Android tags). Offline reverse geocoding to a place name.

Out: location from image content (landmark recognition), PNG GPS, sidecar files (`.xmp`, `.aae`), the places API and place search (search spec), merging nearby places, translated place names.

## Shape

One file, `snapsort/modules/location.py`, class `Location`, `name = "location"`, `version = "1"`. No pipeline changes.

- `setup()` imports `reverse_geocode` and runs one lookup to load its index (about 4 s). The import lives in `setup()`, not at the top of the file, because discovery imports every module file on every CLI call, including `snapsort modules`.
- `process(frames)` reads GPS from `media_path` for each frame with `idx == 0` and ignores the rest. A video's later batches return `[]`.
- Output: at most one `Result` per file, on `frame_idx = 0`. No usable GPS means no result.

Functions, so the parsing can be tested without files:

- `gps_from_exif(gps: dict) -> tuple[float, float] | None`
- `gps_from_iso6709(s: str) -> tuple[float, float] | None`
- `read_gps(path: str, kind: str) -> tuple[float, float] | None`
- `place_for(lat: float, lon: float) -> dict | None`

## Reading GPS

Images: `Image.open(media_path).getexif().get_ifd(ExifTags.IFD.GPSInfo)`, inside `with` so the file closes. This reads only the header and does not use `frame.image`. Tags 1 to 4 are `GPSLatitudeRef`, `GPSLatitude`, `GPSLongitudeRef`, `GPSLongitude`. Each value is degrees + minutes/60 + seconds/3600, negated for `S` or `W`.

Videos: `ffprobe -v error -show_entries format_tags -of json <media_path>` with `stdin=DEVNULL`. The first tag present wins: `com.apple.quicktime.location.ISO6709` (iPhone), then `location`, then `location-eng` (Android, ffmpeg). The value starts with decimal degrees, for example `+35.6595+139.7005+012.345/`. Parse it with `^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)`.

Coordinates count as no GPS when:

- a tag is missing or has the wrong type, or a value is not finite (a zero denominator gives NaN)
- latitude is outside [-90, 90] or longitude is outside [-180, 180]. This also rejects ISO 6709 degree-minute forms like `+4012.3-07401.2`, which phones don't write.
- latitude and longitude are both exactly 0. Some cameras write 0/0 when they have no fix.

## Place name

`reverse_geocode.get((lat, lon))` from the `reverse-geocode` package. Its GeoNames data (places with population 1000 or more) ships inside the wheel. It returns the nearest place's city, state, country, country code and coordinates.

- Place name is `"{city}, {state}, {country}"`, for example `Times Square, New York, United States`. Empty parts, and parts equal to the one before, are dropped. State and country keep the two Springfields apart, which answers frontend flag 5 (places are keyed by name).
- If the nearest place is more than 50 km away (haversine, Earth radius 6371 km), there is no place name. Photos taken at sea or from a plane then don't get a far-off town. Coordinates are still stored.
- Nearest-place lookup prefers small places close to the point. The Eiffel Tower gets `Vanves, Île-de-France, France`, not Paris. Accepted for v1. A `min_population=100000` lookup returns Paris but puts Yosemite Valley in Clovis, 100 km away. State and country are right except near borders, so state or country filters work.

## Result

```python
Result(
    frame_idx=0,
    label="Times Square, New York, United States",  # the runner lowercases it; None when no place
    data={
        "lat": 40.758, "lon": -73.9855,              # from the file, not the place
        "place": "Times Square, New York, United States",  # display name; None when no place
        "city": "Times Square", "state": "New York",
        "country": "United States", "country_code": "US",
    },
)
```

- Every key is always present. Place keys are `None` when there is no place within 50 km.
- `label` is the filter key (indexed on `(module, label)`). `data["place"]` keeps the original case for display. Search code must lowercase a place name in Python before matching `label`, because SQLite's `lower()` only handles ASCII (`Île` stays `Île`).
- Frontend `place` = `{name: data.place, lat: data.lat, lon: data.lon}`.

## Errors

- `ffprobe` exits non-zero, or `Image.open` raises: the exception propagates and becomes a module error for that file (an `error` runs row, retried next run). The pipeline already decoded the file, so this is a real problem.
- Missing or bad GPS: no result and a `done` runs row. Retrying would not change it.

## Cost

Location only needs metadata, but the runner decodes every frame for every pending module. Adding `location` to an already ingested library decodes all frames once more. Accepted, because frames are decoded anyway when other modules run in the same pass.

## Dependencies and docs

- `uv add reverse-geocode` (pulls `scipy`). The package is LGPL and used as a library.
- The GeoNames data is CC BY 4.0. Add to the README: "Place names from GeoNames (geonames.org), CC BY 4.0."
- In the README status table, mark location as done.

## Testing (`tests/modules/test_location.py`)

Media is generated at test time, like `tests/conftest.py`, so no binary files are committed. One `Location()` with `setup()` done is shared by a module-scoped fixture, because setup takes about 4 s.

1. **Contract.** `process(sample_frames)` passes `validate` and returns `[]`, because the fixtures have no GPS.
2. **JPEG.** EXIF with S 33° 51' 24.48", E 151° 12' 55.08" gives one result. Latitude is -33.8568 and longitude 151.2153 (within 1e-4). `state` is `New South Wales`, `country_code` is `AU`.
3. **HEIC.** The same GPS gives the same result, which covers the iPhone format.
4. **MP4.** `-metadata location=+48.8584+002.2945/` gives matching coordinates and `country_code` `FR`.
5. **MOV.** `-movflags use_metadata_tags -metadata com.apple.quicktime.location.ISO6709=+35.6595+139.7005+012.345/` gives `country_code` `JP`.
6. **Springfields.** (39.7817, -89.6501) and (37.2153, -93.2982) through `place_for` give different place names (Illinois, Missouri).
7. **Ocean.** (0.0, -160.0) gives a result with coordinates, `label` `None` and `place` `None`.
8. **No GPS.** A JPEG without EXIF and an MP4 without tags give `[]`.
9. **Rejected GPS.**
   - `gps_from_exif` returns `None` for: 0/0, a zero-denominator value, a missing `GPSLatitudeRef`, and latitude 95.
   - `gps_from_iso6709` returns `None` for `""`, `"garbage"` and `+4012.3-07401.2`.
10. **Only idx 0.** Frames 0 to 3 of a tagged video give one result with `frame_idx` 0. A batch holding only frames 16 to 19 gives `[]`.
11. **Through the runner.** `run_ingest` on a 20 s tagged video (two batches) with `[Location()]` stores one `results` row, on frame idx 0, and a `done` runs row.
