"""Pipeline end to end: real ffmpeg and SQLite, test-only modules."""
import sqlite3
import threading
from pathlib import Path

import numpy as np

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
    assert rows[0][3] == str(sample_image.resolve())
    assert all(Path(r[3]).is_file() for r in rows)


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
    for path in [tmp_path / "missing.jpg", notes, corrupt]:
        assert run_ingest([path], [Counter("a")], data_dir) is False
    assert q(data_dir, "SELECT count(*) FROM media") == [(0,)]
    assert not any((data_dir / "frames").glob("*"))


def test_ingest_dot_ignores_own_data_dir(tmp_path, sample_video, data_dir):
    (tmp_path / "notes.txt").write_text("ignored silently")
    assert run_ingest([tmp_path], [Counter("a")], data_dir)
    assert run_ingest([tmp_path], [Counter("a")], data_dir)
    assert q(data_dir, "SELECT path FROM media") == [(str(sample_video.resolve()),)]


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
