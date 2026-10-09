"""The installed `snapsort` command, run as a subprocess."""
import sqlite3
import subprocess
import sys
from pathlib import Path

SNAPSORT = str(Path(sys.executable).parent / "snapsort")


def run(*args, cwd):
    return subprocess.run([SNAPSORT, *args], cwd=cwd, capture_output=True, text=True)


def test_ingest_video_with_example_module(tmp_path, sample_video):
    proc = run("ingest", str(sample_video), "--modules", "example", cwd=tmp_path)
    assert proc.returncode == 0, proc.stderr
    assert "3 frames  example:done" in proc.stdout
    with sqlite3.connect(tmp_path / ".snapsort" / "snapsort.db") as conn:
        assert conn.execute("SELECT count(*) FROM results WHERE module = 'example'").fetchone() == (3,)


def test_unknown_module_exits_2(tmp_path, sample_video):
    proc = run("ingest", str(sample_video), "--modules", "nope", cwd=tmp_path)
    assert proc.returncode == 2
    assert "unknown module(s): nope" in proc.stderr and "example" in proc.stderr


def test_failed_file_exits_1(tmp_path):
    proc = run("ingest", str(tmp_path / "missing.jpg"), cwd=tmp_path)
    assert proc.returncode == 1
    assert "skip" in proc.stderr and "not found" in proc.stderr


def test_modules_lists_example(tmp_path):
    proc = run("modules", cwd=tmp_path)
    assert proc.returncode == 0
    assert proc.stdout.startswith("example\t1\t")
