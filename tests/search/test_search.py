"""Image search over stored image_embed vectors."""
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from snapsort.cli import format_match
from snapsort.ingest import run_ingest
from snapsort.modules.example import Example
from snapsort.modules.image_embed import ImageEmbed
from snapsort.search import Match, SearchError, search


@pytest.fixture
def library(tmp_path, sample_image, sample_video) -> Path:
    """A data dir with the sample image and video ingested by image_embed."""
    data_dir = tmp_path / ".snapsort"
    assert run_ingest([sample_image, sample_video], [ImageEmbed()], data_dir)
    return data_dir


def test_query_finds_itself_first(library, sample_image):
    top = search(sample_image, library)[0]
    assert top.path == str(sample_image.resolve())
    assert top.score > 0.99
    assert top.kind == "image" and top.ts is None


def test_video_is_one_row_with_best_frame_time(library, sample_video):
    with sqlite3.connect(library / "snapsort.db") as conn:
        [(frame_path,)] = conn.execute(
            "SELECT f.path FROM frames f JOIN media m ON m.id = f.media_id "
            "WHERE m.kind = 'video' AND f.idx = 1").fetchall()
    videos = [m for m in search(Path(frame_path), library, min_score=-1) if m.kind == "video"]
    assert len(videos) == 1
    assert videos[0].path == str(sample_video.resolve())
    assert videos[0].ts == 1.0


def test_limit_and_min_score(library, sample_image):
    assert len(search(sample_image, library, limit=1, min_score=-1)) == 1
    assert search(sample_image, library, min_score=1.01) == []


def test_limit_below_one_is_an_error(tmp_path, sample_image):
    with pytest.raises(SearchError, match="limit"):
        search(sample_image, tmp_path / ".snapsort", limit=0)


@pytest.mark.parametrize("column, value", [("version", "0"), ("status", "error")])
def test_unfinished_or_stale_runs_are_skipped(library, sample_image, sample_video, column, value):
    with sqlite3.connect(library / "snapsort.db") as conn:
        conn.execute(
            f"UPDATE runs SET {column} = ? WHERE module = 'image_embed' "
            "AND media_id = (SELECT id FROM media WHERE path = ?)",
            (value, str(sample_video.resolve())))
    paths = [m.path for m in search(sample_image, library, min_score=-1)]
    assert paths == [str(sample_image.resolve())]


def test_uppercase_extension_query(library, sample_image, tmp_path):
    upper = tmp_path / "RED.PNG"
    upper.write_bytes(sample_image.read_bytes())
    assert search(upper, library)[0].path == str(sample_image.resolve())


def test_missing_database_is_an_error_and_not_created(tmp_path, sample_image):
    data_dir = tmp_path / ".snapsort"
    with pytest.raises(SearchError, match="snapsort ingest"):
        search(sample_image, data_dir)
    assert not (data_dir / "snapsort.db").exists()


def test_missing_database_message_shows_absolute_data_dir(tmp_path, sample_image, monkeypatch):
    # The data dir is relative to the working directory, so a wrong cwd is the likely cause.
    monkeypatch.chdir(sample_image.parent)
    with pytest.raises(SearchError) as e:
        search(sample_image, Path(".snapsort"))
    assert str(sample_image.parent.resolve() / ".snapsort") in str(e.value)


def test_library_without_image_embed_vectors_is_an_error(tmp_path, sample_image):
    data_dir = tmp_path / ".snapsort"
    assert run_ingest([sample_image], [Example()], data_dir)
    with pytest.raises(SearchError, match="snapsort ingest"):
        search(sample_image, data_dir)


def test_video_query_is_an_error(tmp_path, sample_video):
    with pytest.raises(SearchError, match="must be an image"):
        search(sample_video, tmp_path / ".snapsort")


def test_missing_query_file_is_an_error(tmp_path):
    with pytest.raises(SearchError, match="cannot read"):
        search(tmp_path / "nope.jpg", tmp_path / ".snapsort")


SNAPSORT = str(Path(sys.executable).parent / "snapsort")


def run(*args, cwd):
    return subprocess.run([SNAPSORT, *args], cwd=cwd, capture_output=True, text=True)


def test_cli_prints_matches(library, sample_image, sample_video):
    query = str(sample_image.relative_to(library.parent))   # relative, as typed in a shell
    proc = run("search", query, "--min-score", "-1", cwd=library.parent)
    assert proc.returncode == 0, proc.stderr
    lines = proc.stdout.splitlines()
    assert lines[0].endswith(f"  {sample_image.resolve()}")
    assert any(f"  {sample_video.resolve()} @ 0:0" in line for line in lines)


def test_cli_no_matches(library, sample_image):
    proc = run("search", str(sample_image), "--min-score", "1.01", cwd=library.parent)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.strip() == "no matches at or above 1.01"


def test_cli_without_library_exits_2(tmp_path, sample_image):
    proc = run("search", str(sample_image), cwd=tmp_path)
    assert proc.returncode == 2
    assert "snapsort ingest" in proc.stderr


def test_format_match():
    assert format_match(Match("/p/a.jpg", "image", 0.9021, None)) == "0.902  /p/a.jpg"
    assert format_match(Match("/p/c.mov", "video", 0.87, 65.0)) == "0.870  /p/c.mov @ 1:05"
    assert format_match(Match("/p/c.mov", "video", 0.87, 3725.0)) == "0.870  /p/c.mov @ 62:05"
