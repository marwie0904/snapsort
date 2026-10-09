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
