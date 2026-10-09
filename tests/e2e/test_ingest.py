"""Pipeline end to end: real ffmpeg and SQLite, test-only modules."""
import sqlite3
import threading
from pathlib import Path

import numpy as np
import pytest

import snapsort.ingest as ingest
from snapsort.contract import Module, Result
from snapsort.ingest import run_ingest


class Counter(Module):
    def __init__(self, name: str, version: str = "1"):
        self.name, self.version = name, version
        self.setups = self.calls = 0

    def setup(self):
        self.setups += 1

    def process(self, frames):
        self.calls += 1
        return [Result(f.idx, label="Thing", score=np.float32(0.5), bbox=(0.1, 0.1, 0.5, 0.5),
                       vector=np.ones(4)) for f in frames]


class Boom(Counter):
    def process(self, frames):
        raise RuntimeError("boom")


class BadBox(Counter):
    def process(self, frames):
        return [Result(f.idx, bbox=(0, 0, 2, 2)) for f in frames]


class BadSetup(Counter):
    def setup(self):
        raise RuntimeError("no model")


class Rendezvous(Counter):
    """Blocks until every module sharing the barrier is inside process() at the same time."""
    def __init__(self, name: str, barrier: threading.Barrier):
        super().__init__(name)
        self.barrier = barrier

    def process(self, frames):
        self.barrier.wait()
        return super().process(frames)


def q(data_dir: Path, sql: str, *args):
    with sqlite3.connect(data_dir / "snapsort.db") as conn:
        return conn.execute(sql, args).fetchall()


def test_frames_per_media(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a")], data_dir)
    rows = q(data_dir, "SELECT m.kind, f.idx, f.ts, f.path FROM frames f "
                       "JOIN media m ON m.id = f.media_id ORDER BY m.kind, f.idx")
    assert [r[:3] for r in rows] == [("image", 0, None), ("video", 0, 0.0), ("video", 1, 1.0), ("video", 2, 2.0)]
    assert rows[0][3] == str(sample_image.resolve())[1:]  # relative to the library root, / for .snapsort
    assert all((data_dir / r[3]).is_file() for r in rows[1:])
    assert rows[1][3] == "frames.noindex/2/000000.jpg"


def test_library_on_a_drive_survives_a_new_mount_path(sample_image, sample_video, tmp_path):
    """<root>/snapsort stores paths relative to <root>, so the drive can mount somewhere else."""
    drive = tmp_path / "drive"
    (drive / "shoot").mkdir(parents=True)
    for f in (sample_image, sample_video):
        f.rename(drive / "shoot" / f.name)
    assert run_ingest([drive / "shoot"], [Counter("a")], drive / "snapsort")
    lib_id = (drive / "snapsort" / "library.json").read_text()
    moved = tmp_path / "drive 1"
    drive.rename(moved)
    assert q(moved / "snapsort", "SELECT path FROM media ORDER BY path") == [("shoot/clip.mp4",), ("shoot/red.png",)]
    assert q(moved / "snapsort", "SELECT path FROM sources") == [("shoot",)]
    again = Counter("a")
    assert run_ingest([moved / "shoot"], [again], moved / "snapsort")
    assert again.calls == 0 and (moved / "snapsort" / "library.json").read_text() == lib_id
    assert len(list((moved / "snapsort" / "previews.noindex").rglob("*.jpg"))) == 4


def test_drive_root_skips_its_own_data_dir_and_prune_forgets_deleted(sample_image, tmp_path):
    drive = tmp_path / "drive"
    drive.mkdir()
    sample_image.rename(drive / "red.png")
    assert run_ingest([drive], [Counter("a")], drive / "snapsort")
    assert run_ingest([drive], [Counter("a")], drive / "snapsort")  # previews under snapsort/ aren't media
    assert q(drive / "snapsort", "SELECT path FROM media") == [("red.png",)]
    (drive / "red.png").unlink()
    assert run_ingest([drive], [Counter("a")], drive / "snapsort", prune=True)
    assert q(drive / "snapsort", "SELECT count(*) FROM media") == [(0,)]
    assert not (drive / "snapsort" / "previews.noindex" / "1").exists()


def test_progress_events(sample_image, sample_video, data_dir):
    events = []
    assert run_ingest([sample_image.parent], [Counter("a")], data_dir, events.append)
    assert events[0] == {"event": "start", "total": 2}
    assert [(e["done"], e["ok"]) for e in events[1:]] == [(1, True), (2, True)]


def test_results_and_runs_stored(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a"), Counter("b")], data_dir)
    assert q(data_dir, "SELECT module, count(*) FROM results GROUP BY module") == [("a", 4), ("b", 4)]
    assert q(data_dir, "SELECT DISTINCT status, version FROM runs") == [("done", "1")]
    label, score, bbox, vector = q(data_dir, "SELECT label, score, bbox, vector FROM results LIMIT 1")[0]
    assert (label, score, bbox) == ("thing", 0.5, "[0.1, 0.1, 0.5, 0.5]")
    assert np.frombuffer(vector, "<f4").tolist() == [1.0, 1.0, 1.0, 1.0]


def test_rerun_is_noop(sample_image, sample_video, data_dir, capsys):
    assert run_ingest([sample_image, sample_video], [Counter("a")], data_dir)
    again = Counter("a")
    assert run_ingest([sample_image, sample_video], [again], data_dir)
    assert (again.setups, again.calls) == (0, 0)
    assert capsys.readouterr().out.count("up to date") == 2


def test_new_module_runs_alone_on_existing_media(sample_video, data_dir):
    assert run_ingest([sample_video], [Counter("a")], data_dir)
    a, b = Counter("a"), Counter("b")
    assert run_ingest([sample_video], [a, b], data_dir)
    assert (a.calls, b.calls) == (0, 1)
    assert q(data_dir, "SELECT count(*) FROM media") == [(1,)]


def test_version_bump_reprocesses_only_that_module(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a"), Counter("b")], data_dir)
    a2, b = Counter("a", version="2"), Counter("b")
    assert run_ingest([sample_image, sample_video], [a2, b], data_dir)
    assert a2.calls == 2 and b.calls == 0
    assert q(data_dir, "SELECT DISTINCT version FROM runs WHERE module = 'a'") == [("2",)]
    assert q(data_dir, "SELECT count(*) FROM results WHERE module = 'a'") == [(4,)]


def test_failing_module_recorded_others_continue_and_retried(sample_image, sample_video, data_dir):
    assert run_ingest([sample_image, sample_video], [Counter("a"), Boom("boom")], data_dir) is False
    assert q(data_dir, "SELECT DISTINCT status, error FROM runs WHERE module = 'boom'") == [("error", "RuntimeError: boom")]
    assert q(data_dir, "SELECT count(*) FROM results WHERE module = 'a'") == [(4,)]
    fixed = Counter("boom")
    assert run_ingest([sample_image, sample_video], [Counter("a"), fixed], data_dir)
    assert fixed.calls == 2
    assert q(data_dir, "SELECT DISTINCT status FROM runs") == [("done",)]


def test_contract_violation_is_module_error(sample_image, data_dir):
    assert run_ingest([sample_image], [BadBox("bad")], data_dir) is False
    [(status, error)] = q(data_dir, "SELECT status, error FROM runs")
    assert status == "error" and "bbox" in error
    assert q(data_dir, "SELECT count(*) FROM results") == [(0,)]


def test_setup_failure_drops_module_without_recording(sample_image, sample_video, data_dir):
    bad = BadSetup("s")
    assert run_ingest([sample_image, sample_video], [Counter("a"), bad], data_dir) is False
    assert q(data_dir, "SELECT DISTINCT module, status FROM runs") == [("a", "done")]
    assert bad.calls == 0


def test_missing_unsupported_and_corrupt_files_skipped(tmp_path, data_dir):
    notes = tmp_path / "notes.txt"
    notes.write_text("x")
    corrupt = tmp_path / "bad.mp4"
    corrupt.write_bytes(b"not a video")
    bad_image = tmp_path / "bad.jpg"
    bad_image.write_bytes(b"not an image")
    for path in [tmp_path / "missing.jpg", notes, corrupt, bad_image]:
        assert run_ingest([path], [Counter("a")], data_dir) is False
    assert q(data_dir, "SELECT count(*) FROM media") == [(0,)]
    assert not any((data_dir / "frames.noindex").glob("*"))


def test_new_image_decoded_once(sample_image, data_dir, monkeypatch):
    calls = []
    original = ingest.load_image
    monkeypatch.setattr(ingest, "load_image", lambda p: calls.append(p) or original(p))
    assert run_ingest([sample_image], [Counter("a")], data_dir)
    assert len(calls) == 1


def test_ingest_dot_ignores_own_data_dir(tmp_path, sample_video, data_dir):
    (tmp_path / "notes.txt").write_text("ignored silently")
    assert run_ingest([tmp_path], [Counter("a")], data_dir)
    assert run_ingest([tmp_path], [Counter("a")], data_dir)
    assert q(data_dir, "SELECT path FROM media") == [(str(sample_video.resolve())[1:],)]


def test_modules_run_concurrently(sample_image, data_dir):
    barrier = threading.Barrier(2, timeout=5)  # sequential calls would time out and fail
    assert run_ingest([sample_image], [Rendezvous("a", barrier), Rendezvous("b", barrier)], data_dir)


def test_frames_are_batched_per_file(sample_video, data_dir, monkeypatch):
    monkeypatch.setattr(ingest, "BATCH", 2)
    sizes = []

    class Sizes(Counter):
        def process(self, frames):
            sizes.append(len(frames))
            return []

    assert run_ingest([sample_video], [Sizes("s")], data_dir)
    assert sizes == [2, 1]


def test_missing_frames_are_extracted_again(sample_video, data_dir):
    """A pulled drive can keep the database commit but lose the frame files: the next run redoes the file."""
    assert run_ingest([sample_video], [Counter("a")], data_dir)
    (data_dir / "frames.noindex" / "1" / "000002.jpg").unlink()
    assert run_ingest([sample_video], [Counter("a"), Counter("b")], data_dir) is False  # skipped and forgotten
    b = Counter("b")
    assert run_ingest([sample_video], [Counter("a"), b], data_dir)
    assert b.calls == 1 and q(data_dir, "SELECT count(*) FROM frames") == [(3,)]


def test_unreadable_folder_is_permission_denied(tmp_path, data_dir):
    locked = tmp_path / "locked"
    locked.mkdir()
    locked.chmod(0)
    try:
        with pytest.raises(ingest.IngestError) as e:
            run_ingest([locked], [Counter("a")], data_dir)
        assert e.value.code == "PERMISSION_DENIED"
    finally:
        locked.chmod(0o755)


def test_unreadable_subfolder_reports_and_prunes_nothing(sample_image, tmp_path, data_dir):
    events = []
    gone = sample_image.parent / "gone.png"
    sample_image.rename(gone)
    assert run_ingest([gone.parent], [Counter("a")], data_dir)
    gone.unlink()
    sub = gone.parent / "sub"
    sub.mkdir()
    sub.chmod(0)
    try:
        assert run_ingest([gone.parent], [Counter("a")], data_dir, events.append, prune=True) is False
    finally:
        sub.chmod(0o755)
    assert [e["code"] for e in events if e["event"] == "error"] == ["PERMISSION_DENIED"]
    assert q(data_dir, "SELECT count(*) FROM media") == [(1,)]  # the deleted file is kept: nothing pruned


def test_full_drive_stops_with_disk_full(sample_image, data_dir, monkeypatch):
    monkeypatch.setattr(ingest, "MIN_FREE", 2 ** 62)
    with pytest.raises(ingest.IngestError) as e:
        run_ingest([sample_image], [Counter("a")], data_dir)
    assert e.value.code == "DISK_FULL"
