"""Shared fixtures. Media is generated per test, so no binary files are committed."""
import subprocess
from pathlib import Path

import pytest
from PIL import Image

from snapsort.contract import Frame
from snapsort.ingest import extract_frames, load_image


@pytest.fixture
def data_dir(tmp_path) -> Path:
    return tmp_path / ".snapsort"


@pytest.fixture
def sample_image(tmp_path) -> Path:
    path = tmp_path / "media" / "red.png"
    path.parent.mkdir(exist_ok=True)
    Image.new("RGB", (64, 48), (220, 30, 30)).save(path)
    return path


@pytest.fixture
def sample_video(tmp_path) -> Path:
    path = tmp_path / "media" / "clip.mp4"
    path.parent.mkdir(exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi",
         "-i", "testsrc=duration=3:size=320x240:rate=10", str(path)],
        check=True,
    )
    return path


@pytest.fixture
def sample_frames(sample_image, sample_video, tmp_path) -> list[Frame]:
    """The red image (frames[0]) followed by the video's 3 frames."""
    frames = [Frame(1, str(sample_image), "image", 0, None, load_image(sample_image))]
    for i, f in enumerate(extract_frames(sample_video, tmp_path / "frames")):
        frames.append(Frame(2, str(sample_video), "video", i, float(i), load_image(f)))
    return frames
