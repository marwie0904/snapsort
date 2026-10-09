"""Grouping tests. Synthetic unit vectors go straight into a temp database, so no model runs."""
import time
import tracemalloc

import numpy as np
import pytest

import snapsort.group as group
from snapsort.group import CENTROIDS, GroupSummary, run_grouping
from snapsort.ingest import connect


@pytest.fixture
def rng():
    return np.random.default_rng(0)


@pytest.fixture
def db(data_dir):
    data_dir.mkdir()
    conn = connect(data_dir / "snapsort.db")
    yield conn
    conn.close()


def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def person(rng):
    return unit(rng.normal(size=512))


def near(base, cos, rng, n=1):
    """n unit vectors at exactly `cos` to base. Two of them are about cos² apart.
    Vectors near different bases are about 0 apart."""
    u = rng.normal(size=(n, 512))
    u -= np.outer(u @ base, base)
    return (cos * base + np.sqrt(1 - cos ** 2) * unit(u)).astype(np.float32)


def add_media(conn, vectors) -> list[int]:
    """One video with a frame and a face result per vector. Returns the result ids."""
    with conn:
        media = conn.execute(
            "INSERT INTO media (path, kind) VALUES ('/m/' || hex(randomblob(8)), 'video')").lastrowid
        ids = []
        for i, v in enumerate(vectors):
            frame = conn.execute("INSERT INTO frames (media_id, idx, ts, path) VALUES (?, ?, ?, '/f.jpg')",
                                 (media, i, float(i))).lastrowid
            ids.append(conn.execute(
                "INSERT INTO results (frame_id, module, label, score, bbox, vector) "
                "VALUES (?, 'faces', 'face', 0.9, '[0.1, 0.1, 0.2, 0.2]', ?)",
                (frame, np.asarray(v, "<f4").tobytes())).lastrowid)
    return ids


def photos(conn, vectors) -> list[int]:
    """One single-face media file per vector. Returns the result ids."""
    return [add_media(conn, [v])[0] for v in vectors]


def person_of(conn, ids) -> list[int | None]:
    got = dict(conn.execute("SELECT result_id, person_id FROM person_faces"))
    return [got.get(i) for i in ids]


def test_two_people_become_two_persons(db, data_dir, rng):
    a, b = person(rng), person(rng)
    ids_a, ids_b = photos(db, near(a, 0.9, rng, 5)), photos(db, near(b, 0.9, rng, 5))
    assert run_grouping(data_dir) == GroupSummary(faces=10, new_persons=2, joined=0)
    [pa], [pb] = set(person_of(db, ids_a)), set(person_of(db, ids_b))
    assert pa != pb
    # every photo is one appearance, so one centroid each
    assert dict(db.execute("SELECT person_id, count(*) FROM person_centroids GROUP BY person_id")) == {pa: 5, pb: 5}
    # equal boxes and scores: the lowest result id represents the person
    assert dict(db.execute("SELECT id, face_id FROM persons")) == {pa: ids_a[0], pb: ids_b[0]}
    assert db.execute("SELECT DISTINCT score FROM person_faces").fetchall() == [(1.0,)]


def test_representative_face_has_largest_area_times_confidence(db, data_dir, rng):
    ids = photos(db, near(person(rng), 0.9, rng, 3))  # area x score: 0.04 x 0.9 = 0.036
    with db:
        db.execute("UPDATE results SET bbox = '[0, 0, 0.5, 0.5]', score = 0.6 WHERE id = ?", (ids[1],))   # 0.15
        db.execute("UPDATE results SET bbox = '[0, 0, 0.4, 0.4]', score = 0.99 WHERE id = ?", (ids[2],))  # 0.158
    run_grouping(data_dir)
    assert db.execute("SELECT face_id FROM persons").fetchall() == [(ids[2],)]


def test_faces_in_one_file_below_threshold_stay_apart(db, data_dir, rng):
    a = person(rng)
    ids = add_media(db, [a, near(a, 0.5, rng)[0]])
    assert run_grouping(data_dir) == GroupSummary(faces=2, new_persons=2, joined=0)
    assert len(set(person_of(db, ids))) == 2


def test_faces_in_one_file_chain_into_one_appearance(db, data_dir, rng):
    # single link: a-b and b-c are 0.6 apart, a-c only about 0.36
    a = person(rng).astype(np.float32)
    b = near(a, 0.6, rng)[0]
    c = near(b, 0.6, rng)[0]
    ids = add_media(db, [a, b, c])
    assert run_grouping(data_dir) == GroupSummary(faces=3, new_persons=1, joined=0)
    [p] = set(person_of(db, ids))
    assert db.execute("SELECT count(*) FROM person_centroids WHERE person_id = ?", (p,)).fetchone() == (1,)


def test_new_faces_join_existing_person(db, data_dir, rng):
    a = person(rng)
    first = photos(db, near(a, 0.9, rng, 3))
    run_grouping(data_dir)
    later = photos(db, near(a, 0.9, rng, 4))
    assert run_grouping(data_dir) == GroupSummary(faces=4, new_persons=0, joined=4)
    assert len(set(person_of(db, first + later))) == 1
    assert db.execute("SELECT count(*) FROM person_centroids").fetchone() == (7,)  # refreshed: one per photo
    scores = db.execute(f"SELECT score FROM person_faces WHERE result_id IN ({','.join(map(str, later))})")
    assert all(0.55 <= s < 1 for (s,) in scores)  # the cosine that placed the face


def test_person_keeps_id_and_name_across_reingest(db, data_dir, rng):
    a = person(rng)
    old = photos(db, near(a, 0.9, rng, 3))
    run_grouping(data_dir)
    [p] = set(person_of(db, old))
    with db:
        db.execute("UPDATE persons SET name = 'Ann' WHERE id = ?", (p,))
        db.execute("DELETE FROM results")  # the faces module re-ran and replaced every face
    assert db.execute("SELECT id, name, face_id FROM persons").fetchall() == [(p, "Ann", None)]
    new = photos(db, near(a, 0.9, rng, 2))
    assert run_grouping(data_dir) == GroupSummary(faces=2, new_persons=0, joined=2)
    assert person_of(db, new) == [p, p]
    assert db.execute("SELECT name, face_id FROM persons").fetchall() == [("Ann", new[0])]


def test_second_run_without_new_faces_changes_nothing(db, data_dir, rng):
    a, b = person(rng), person(rng)
    add_media(db, near(a, 0.9, rng, 3))
    photos(db, near(b, 0.9, rng, 2))
    run_grouping(data_dir)

    def dump():
        return [db.execute(f"SELECT * FROM {t} ORDER BY 1, 2").fetchall()
                for t in ("persons", "person_faces", "person_centroids")]

    before = dump()
    assert run_grouping(data_dir) == GroupSummary(faces=0, new_persons=0, joined=0)
    assert dump() == before


def test_many_appearances_are_summarized_to_centroids(db, data_dir, rng):
    photos(db, near(person(rng), 0.9, rng, 30))
    run_grouping(data_dir)
    rows = db.execute("SELECT vector, weight FROM person_centroids").fetchall()
    assert len(rows) == CENTROIDS and sum(w for _, w in rows) == 30
    assert all(abs(np.linalg.norm(np.frombuffer(v, "<f4")) - 1) < 1e-5 for v, _ in rows)


def test_refresh_keeps_stored_centroids_and_adds_new_photos(db, data_dir, rng):
    # Deviation 4: the summary is built from the stored centroids plus the new photos, and the
    # person's faces are never reloaded. A full rebuild would leave 5 centroids of weight 1.
    a = person(rng)
    photos(db, near(a, 0.9, rng, 30))
    run_grouping(data_dir)
    with db:
        db.execute("DELETE FROM results")  # a re-ingest deleted every face
    photos(db, near(a, 0.9, rng, 5))
    assert run_grouping(data_dir) == GroupSummary(faces=5, new_persons=0, joined=5)
    rows = db.execute("SELECT weight FROM person_centroids").fetchall()
    assert len(rows) == CENTROIDS and sum(w for (w,) in rows) == 35


def test_duplicate_photos_do_not_break_centroids(db, data_dir, rng):
    # One photo copied into 25 folders: identical vectors leave k-means++ nothing to weigh by.
    photos(db, [near(person(rng), 0.9, rng)[0]] * 25)
    assert run_grouping(data_dir) == GroupSummary(faces=25, new_persons=1, joined=0)
    assert db.execute("SELECT weight FROM person_centroids").fetchall() == [(25,)]


def test_long_video_never_builds_the_full_matrix(db, data_dir, rng):
    # 10,000 frames of one person: the full face-by-face matrix alone would be 400 MB.
    add_media(db, near(person(rng), 0.9, rng, 10_000))
    tracemalloc.start()
    try:
        assert run_grouping(data_dir) == GroupSummary(faces=10_000, new_persons=1, joined=0)
        peak = tracemalloc.get_traced_memory()[1]
    finally:
        tracemalloc.stop()
    assert peak < 200e6


def test_many_photos_of_one_person_stay_one_person(db, data_dir, rng):
    # 1,500 photos in one run. As one Louvain graph that is 1.1M edges, and memory grows with
    # their square. In batches of BATCH, the later photos join through the first batch's centroids.
    photos(db, near(person(rng), 0.9, rng, 1500))
    start = time.monotonic()
    tracemalloc.start()
    try:
        assert run_grouping(data_dir) == GroupSummary(faces=1500, new_persons=1, joined=0)
        peak = tracemalloc.get_traced_memory()[1]
    finally:
        tracemalloc.stop()
    assert peak < 200e6 and time.monotonic() - start < 30


def test_failure_rolls_back_every_write(db, data_dir, rng, monkeypatch):
    photos(db, [person(rng) for _ in range(3)])

    def boom(*args):
        raise RuntimeError("boom")

    monkeypatch.setattr(group, "_refresh_centroids", boom)
    with pytest.raises(RuntimeError, match="boom"):
        run_grouping(data_dir)
    assert db.execute("SELECT (SELECT count(*) FROM persons), (SELECT count(*) FROM person_faces)").fetchone() == (0, 0)
