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
