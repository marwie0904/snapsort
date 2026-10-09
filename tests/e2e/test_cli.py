"""The installed `snapsort` command, run as a subprocess."""
import sqlite3
import subprocess
import sys
from pathlib import Path

import snapsort.cli as cli

SNAPSORT = str(Path(sys.executable).parent / "snapsort")


def run(*args, cwd):
    return subprocess.run([SNAPSORT, *args], cwd=cwd, capture_output=True, text=True)


def test_ingest_video_with_example_module(tmp_path, sample_video):
    proc = run("ingest", str(sample_video), "--modules", "example", cwd=tmp_path)
    assert proc.returncode == 0, proc.stderr
    assert "3 frames  example:done" in proc.stdout
    with sqlite3.connect(tmp_path / ".snapsort" / "snapsort.db") as conn:
        assert conn.execute("SELECT count(*) FROM results WHERE module = 'example'").fetchone() == (3,)
    assert "grouping" not in proc.stdout


def test_duplicate_module_names_run_once(tmp_path, sample_video):
    proc = run("ingest", str(sample_video), "--modules", "example,example", cwd=tmp_path)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.count("example:done") == 1
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


def test_group_without_database_exits_2(tmp_path):
    proc = run("group", cwd=tmp_path)
    assert proc.returncode == 2
    assert "no database" in proc.stderr
    assert not (tmp_path / ".snapsort").exists()


def test_group_prints_summary(tmp_path, sample_video):
    assert run("ingest", str(sample_video), "--modules", "example", cwd=tmp_path).returncode == 0
    proc = run("group", cwd=tmp_path)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout == "grouping  0 faces  0 new persons  0 joined existing\n"


def test_ingest_groups_after_faces(tmp_path, sample_image):
    proc = run("ingest", str(sample_image), "--modules", "faces", cwd=tmp_path)
    assert proc.returncode == 0, proc.stderr
    assert proc.stdout.endswith("grouping  0 faces  0 new persons  0 joined existing\n")


def test_grouping_failure_exits_1(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".snapsort").mkdir()
    (tmp_path / ".snapsort" / "snapsort.db").touch()

    def boom(data_dir):
        raise RuntimeError("boom")

    monkeypatch.setattr(cli, "run_grouping", boom)
    assert cli.main(["group"]) == 1
    assert "grouping failed: RuntimeError: boom" in capsys.readouterr().err
