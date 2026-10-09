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
