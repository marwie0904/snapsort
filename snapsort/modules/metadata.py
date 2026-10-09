"""File metadata for the inspector: dimensions, file size, camera, and duration, fps and codec for videos.
The capture date comes from capture_date."""
import json
import math
import os
import subprocess

from PIL import Image

from snapsort.contract import Frame, Module, Result

MAKE, MODEL = 271, 272  # EXIF tags


def probe(path: str) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=codec_name,avg_frame_rate:format=duration:format_tags", "-of", "json", path],
        stdin=subprocess.DEVNULL, capture_output=True, text=True,
    )
    return json.loads(out.stdout or "{}") if out.returncode == 0 else {}


def _num(s) -> float | None:
    try:
        v = float(s)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) and v > 0 else None


def _rate(s) -> float | None:
    """"30000/1001" -> 29.97. ffprobe writes 0/0 when it doesn't know."""
    num, _, den = str(s).partition("/")
    n, d = _num(num), _num(den or 1)
    return round(n / d, 3) if n and d else None


def _text(v) -> str | None:
    v = str(v).strip("\x00 ") if v is not None else ""
    return v or None


class Metadata(Module):
    name = "metadata"
    version = "1"

    def process(self, frames: list[Frame]) -> list[Result]:
        results = []
        for f in frames:
            if f.idx != 0:
                continue
            w, h = f.image.size  # already upright, so a portrait video reports portrait
            data = {"width": w, "height": h, "sizeBytes": os.path.getsize(f.media_path)}
            if f.media_kind == "image":
                with Image.open(f.media_path) as im:
                    exif = im.getexif()
                data.update(make=_text(exif.get(MAKE)), model=_text(exif.get(MODEL)))
            else:
                p = probe(f.media_path)
                stream, fmt = (p.get("streams") or [{}])[0], p.get("format", {})
                tags = fmt.get("tags", {})
                data.update(durationS=_num(fmt.get("duration")), fps=_rate(stream.get("avg_frame_rate")),
                            codec=stream.get("codec_name"), make=_text(tags.get("com.apple.quicktime.make")),
                            model=_text(tags.get("com.apple.quicktime.model")))
            results.append(Result(0, data={k: v for k, v in data.items() if v is not None}))
        return results
