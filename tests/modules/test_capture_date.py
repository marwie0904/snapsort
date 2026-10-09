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
