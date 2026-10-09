"""GPS location from file metadata, plus an offline place name (GeoNames via reverse_geocode).

One result per file, on frame 0. Files without usable GPS get no result.
"""
import json
import math
import re
import subprocess

import pillow_heif
from PIL import ExifTags, Image

from snapsort.contract import Frame, Module, Result

pillow_heif.register_heif_opener()

VIDEO_TAGS = ("com.apple.quicktime.location.ISO6709", "location", "location-eng")
ISO6709 = re.compile(r"^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)")
MAX_PLACE_KM = 50
NO_PLACE = dict.fromkeys(("place", "city", "state", "country", "country_code"))


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
