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
