import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from snapsort.ingest import (classify, connect, dense_keyframes, extract_frames, load_image,
                             resolve_paths)


def test_classify_is_case_insensitive():
    assert classify(Path("a.JPG")) == "image"
    assert classify(Path("a.heic")) == "image"
    assert classify(Path("a.MOV")) == "video"
    assert classify(Path("a.txt")) is None


def test_resolve_paths_recurses_and_filters_directories(tmp_path):
    for name in ["a.jpg", "sub/b.mp4", ".hidden/c.jpg", "sub/.cache/d.jpg", "notes.txt"]:
        (tmp_path / name).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / name).write_bytes(b"")
    root = tmp_path.resolve()
    assert resolve_paths([tmp_path]) == [root / "a.jpg", root / "sub/b.mp4"]


def test_resolve_paths_keeps_explicit_files_as_given(tmp_path):
    hidden = tmp_path / ".hidden" / "c.jpg"
    hidden.parent.mkdir()
    hidden.write_bytes(b"")
    explicit = [hidden, tmp_path / "notes.txt", tmp_path / "missing.jpg"]
    assert resolve_paths(explicit) == [p.resolve() for p in explicit]


def test_load_image_applies_exif_orientation(tmp_path):
    path = tmp_path / "rotated.jpg"
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° to display upright
    Image.new("L", (40, 20)).save(path, exif=exif)
    img = load_image(path)
    assert img.size == (20, 40)
    assert img.mode == "RGB"


def test_extract_frames_one_per_second(sample_video, tmp_path):
    files = extract_frames(sample_video, tmp_path / "out")
    assert [f.name for f in files] == ["000000.jpg", "000001.jpg", "000002.jpg"]


def test_extract_frames_replaces_stale_output(sample_video, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    (out / "000099.jpg").write_bytes(b"stale")
    assert len(extract_frames(sample_video, out)) == 3


def make_video(path, gop, duration=3.0):
    """Clip whose hue turns 120° per second, encoded with a keyframe every `gop` frames (10 fps)."""
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi",
                    "-i", f"color=c=red:size=64x64:rate=10:duration={duration}", "-vf", "hue=h=120*t",
                    "-g", str(gop), str(path)], check=True)
    return path


def test_dense_keyframes(sample_video, tmp_path):
    # Decoding only keyframes is safe only when every 1 fps sample can land on one.
    assert dense_keyframes(make_video(tmp_path / "dense.mp4", gop=5))       # every 0.5 s
    assert not dense_keyframes(make_video(tmp_path / "sparse.mp4", gop=20))  # every 2 s
    assert not dense_keyframes(sample_video)                                  # x264 default


def test_keyframe_extraction_samples_whole_seconds(tmp_path):
    # 3.4 s: the last sample (t=3) must survive, which fps drops at EOF on keyframe-only input.
    video = make_video(tmp_path / "dense.mp4", gop=5, duration=3.4)
    files = extract_frames(video, tmp_path / "out")
    assert len(files) == 4
    for i, f in enumerate(files):
        ref = tmp_path / f"ref{i}.png"   # full decode, exact seek to second i
        subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", str(i), "-i", str(video),
                        "-frames:v", "1", str(ref)], check=True)
        got, want = (np.asarray(load_image(p), float).mean(axis=(0, 1)) for p in (f, ref))
        assert np.abs(got - want).max() < 10, (i, got, want)   # half a second off is a 60° hue shift


def test_extract_frames_fails_cleanly_on_garbage(tmp_path):
    bad = tmp_path / "bad.mp4"
    bad.write_bytes(b"not a video")
    with pytest.raises(RuntimeError):
        extract_frames(bad, tmp_path / "out")
    assert not (tmp_path / "out").exists()


def test_connect_creates_schema_idempotently(tmp_path):
    connect(tmp_path / "db").close()
    conn = connect(tmp_path / "db")
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert tables == {"media", "frames", "results", "runs", "sources"}
    indexes = {r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")}
    assert indexes == {"results_module_label", "results_module_frame", "results_frame"}
    assert conn.execute("PRAGMA journal_mode").fetchone() == ("wal",)
    assert conn.execute("PRAGMA foreign_keys").fetchone() == (1,)
