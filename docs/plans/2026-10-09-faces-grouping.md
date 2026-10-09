# Faces Implementation Plan: Phase 2 (grouping)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the stored face embeddings into persons. Add `snapsort group`, and run grouping at the end of `snapsort ingest` when the `faces` module ran.

**Architecture:** One new file, `snapsort/group.py`. It adds three tables next to the pipeline's tables and exposes `run_grouping(data_dir)`. One call does the following in one transaction:

1. Load the unassigned `faces` results.
2. Collapse each media file's faces into appearances (single link).
3. Match appearances to stored person centroids.
4. Run Louvain over the leftovers to make new persons.
5. Refresh the centroids of the persons it touched, from their stored centroids plus the new appearances. Then re-pick their representative faces.

Steps 3–5 run per batch of 500 appearances. `cli.py` gains the `group` subcommand and the call after ingest. The pipeline (`ingest.py`, `contract.py`, the modules) is not changed.

**Tech Stack:** Python 3.12, uv, numpy, networkx (Louvain), SQLite (JSON functions), pytest.

**Spec:** `docs/design/2026-10-09-faces.md`, section "Phase 2: grouping". The deviations below change it in four places.

## Deviations from the design (confirm before Task 1)

Measured on 2026-10-09 with the probe's cached LFW embeddings (13,039 gated faces, scratchpad `probe/p17_group.py`).

1. **Leftovers are grouped in batches of 500 appearances.**
   - The design builds one Louvain graph over every leftover appearance. One person with n photos adds n²/2 edges:

     | Photos of one person | Louvain time | Memory |
     |---|---|---|
     | 500 | 2.3 s | 86 MB |
     | 1,000 | 18 s | 352 MB |
     | 2,000 | 134 s | 1.4 GB, and that one person was split into 2 |

   - A first ingest of a family library can hold thousands of photos of one child.
   - With batches, steps 3–5 run per batch, and a batch's appearances can join persons that earlier batches created.
   - On the LFW two-pass run, batch 500 and one graph give the same pair precision (99.96%) and the same mixed groups (1). Main-group share is 96.93% with batches and 96.99% with one graph.
2. **The LFW two-pass floor for main-group share is 96%, not 97%.**
   - The design's 97% came from single-pass grouping, which measures 97.99%. Two passes measure 96.99% even without batches, so the design's check fails as written.
   - The drop is built into incremental grouping. Matching against every stored appearance instead of 20 centroids gives the same 96.93%. A new face that links to its person only through other new faces starts a new person.
3. **`run_grouping` re-picks a NULL `face_id` on every call**, including calls with no unassigned faces. It costs one UPDATE. Without it, a person whose representative face a re-ingest deleted has no `faceRef` until new faces arrive.
4. **Centroids are refreshed from the stored centroids plus the new appearances.**
   - The design rebuilds a touched person's centroids from all of their faces. A person in 50 hours of video has 180,000 faces (about 370 MB), and the design reloads them on every run where that person appears.
   - Instead, each stored centroid counts as one point weighted by its `weight`, and each new appearance counts as a point with weight 1. If there are more than 20 points, weighted spherical k-means summarizes them. The cost stays the same however many faces the person has.
   - Trade-off: after a re-ingest, the deleted faces stay in the stored summary and their new copies are added on top.
   - Comparison on LFW (probe `p21_compare.py`, batch 500). Each cell gives the full rebuild first, then deviation 4.

     | Scenario | Pair precision | Mixed groups | Share, people with ≥ 10 photos | Share, people with ≥ 40 photos |
     |---|---|---|---|---|
     | 2 passes | 99.96 / 99.96% | 1 / 1 | 96.93 / 96.93% | 99.26 / 99.26% |
     | 10 passes | 99.96 / 99.96% | 0 / 0 | 94.98 / 94.99% | 99.06 / 99.13% |
     | 1 run, shuffled order | 99.96 / 99.96% | 1 / 1 | 94.49 / 94.51% | 97.14 / 97.14% |
     | 2 passes, then a full re-ingest | 99.96 / 99.96% | 1 / 1 | 94.49 / 96.93% | 97.40 / 99.26% |

   - Deviation 4 is equal or better everywhere. It does better on re-ingest because the full rebuild throws away the person's stored summary once their old faces are deleted.
   - **Rule (from the user):** deviation 4 stays only while its pair precision and main-group share are each at least 95% of the full rebuild's. Task 3's LFW test checks this on the module's own output.

Unchanged: which persons `listPeople` shows is still an open decision. It belongs to the API layer, which is outside this phase.

## Global Constraints

- macOS on Apple Silicon. All commands run through `uv run` from the worktree root.
- **Branch.** Work on `face-grouping`, cut from `worktree-face-module` at `08b08d4` (phase 1, pushed, not yet on `main`). Rebase onto `main` after phase 1 merges. `pyproject.toml` and `uv.lock` will conflict with `main`'s location module dependency. Resolve them by re-running `uv add`.
- The new runtime dependency is exactly `networkx`. Add nothing else.
- **Constants:**
  - from the design: `THRESHOLD = 0.55`, `CENTROIDS = 20`, `KMEANS_ITERS = 20`, `SEED = 42`
  - `BATCH = 500` (deviation 1)
  - `CHUNK = 1024` (rows per similarity block)
- Tables `persons`, `person_faces` and `person_centroids` are exactly the design's SQL.
- Grouping reads only `results` rows with `module = 'faces'`.
- The output line is exactly `grouping  <n> faces  <m> new persons  <k> joined existing`, with two spaces between fields like ingest's lines.
- **Exit codes:**
  - `snapsort group`: 0 on success, 1 when grouping fails, 2 when there is no database.
  - `snapsort ingest`: 1 when grouping fails.
- Do not modify `snapsort/ingest.py`, `snapsort/contract.py` or `snapsort/modules/`. Outside `snapsort/group.py`, only `snapsort/cli.py` changes.
- Commit no binary test fixtures. Real-face tests skip unless `SNAPSORT_FACE_TEST_DIR` or `SNAPSORT_LFW_DIR` is set.
- Commit messages have no `Co-Authored-By` lines.

## Review Focus

1. **A first ingest of a big library with one dominant person** (thousands of photos) must finish in seconds and keep that person as one person. Tested by `test_many_photos_of_one_person_stay_one_person` (Task 1).
2. **An hours-long video of one person** must never build its full face-by-face matrix. At 10,000 frames that matrix alone is 400 MB. Tested by `test_long_video_never_builds_the_full_matrix` (Task 1).
3. **The same photo copied into many folders** gives identical vectors. k-means++ must not divide by a zero total distance. Tested by `test_duplicate_photos_do_not_break_centroids` (Task 1).
4. **An error partway through** must leave the database as it was, so the next run retries cleanly. Tested by `test_failure_rolls_back_every_write` (Task 1).
5. **`snapsort group` run before any ingest, or in the wrong folder,** must not leave an empty `.snapsort/` behind. Tested by `test_group_without_database_exits_2` (Task 2).

---

### Task 1: `snapsort/group.py` and its synthetic tests

**Files:**
- Create: `snapsort/group.py`
- Create: `tests/group/test_group.py`
- Modify: `pyproject.toml`, `uv.lock` (through `uv add`)

**Interfaces:**
- Consumes:
  - `snapsort.ingest.connect(db_path: Path) -> sqlite3.Connection`, which creates the pipeline tables and turns on foreign keys and WAL
  - `faces` result rows: `vector` is 512 little-endian float32 values with unit length, and `bbox` is the JSON text `[x, y, w, h]`
- Produces:
  - `run_grouping(data_dir: Path) -> GroupSummary`
  - `@dataclass GroupSummary(faces: int, new_persons: int, joined: int)`
  - constants `THRESHOLD`, `CENTROIDS`, `KMEANS_ITERS`, `SEED`, `BATCH`, `CHUNK`
  - the tables `persons`, `person_faces`, `person_centroids`
  - private helpers that tests use:
    - `_refresh_centroids(conn, person_id: int, new: np.ndarray)`. `new` is this batch's appearance vectors for the person (N×512 float32). The rollback test monkeypatches it, and Task 3 swaps in the full-rebuild reference.
    - `_save_centroids(conn, person_id: int, X: np.ndarray, weight: np.ndarray)`. It stores X, or a weighted k-means summary of X when X has more than `CENTROIDS` rows.
    - `_unit(x: np.ndarray) -> np.ndarray`

- [ ] **Step 1: Add the dependency**

Run: `uv add networkx`
Expected: `pyproject.toml` lists `networkx>=3.7`. `uv run python -c "import networkx; print(networkx.__version__)"` prints `3.7` or later.

- [ ] **Step 2: Write the failing tests**

`tests/group/test_group.py`:

```python
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
    # 1,500 photos in one run. As one Louvain graph that is 1.1M edges (minutes, over 1 GB).
    # In batches of BATCH, the later photos join through the first batch's centroids.
    photos(db, near(person(rng), 0.9, rng, 1500))
    start = time.monotonic()
    assert run_grouping(data_dir) == GroupSummary(faces=1500, new_persons=1, joined=0)
    assert time.monotonic() - start < 30


def test_failure_rolls_back_every_write(db, data_dir, rng, monkeypatch):
    photos(db, [person(rng) for _ in range(3)])

    def boom(*args):
        raise RuntimeError("boom")

    monkeypatch.setattr(group, "_refresh_centroids", boom)
    with pytest.raises(RuntimeError, match="boom"):
        run_grouping(data_dir)
    assert db.execute("SELECT (SELECT count(*) FROM persons), (SELECT count(*) FROM person_faces)").fetchone() == (0, 0)
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `uv run pytest tests/group -q`
Expected: collection error `ModuleNotFoundError: No module named 'snapsort.group'`.

- [ ] **Step 4: Write `snapsort/group.py`**

```python
"""Grouping: assign every face result without a person to a person.

Design: docs/design/2026-10-09-faces.md, "Phase 2: grouping". The batches and the incremental
centroid refresh come from docs/plans/2026-10-09-faces-grouping.md (deviations 1 and 4)."""
from dataclasses import dataclass
from pathlib import Path

import networkx as nx
import numpy as np

from snapsort.ingest import connect

THRESHOLD = 0.55   # cosine; within one media file and across files
CENTROIDS = 20     # per person
KMEANS_ITERS = 20
SEED = 42
BATCH = 500        # appearances per Louvain graph: 500 photos of one person cost 2 s, 2,000 cost 134 s and 1.4 GB
CHUNK = 1024       # rows per similarity block, so a long video never builds its full face-by-face matrix

SCHEMA = """
CREATE TABLE IF NOT EXISTS persons (
  id         INTEGER PRIMARY KEY,
  name       TEXT,                                                -- set by renamePerson
  face_id    INTEGER REFERENCES results(id) ON DELETE SET NULL,  -- representative face, for faceRef
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS person_faces (
  result_id INTEGER PRIMARY KEY REFERENCES results(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  score     REAL NOT NULL          -- similarity that placed the face; 1.0 for a new person
);
CREATE INDEX IF NOT EXISTS person_faces_person ON person_faces(person_id);
CREATE TABLE IF NOT EXISTS person_centroids (
  person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  slot      INTEGER NOT NULL,
  vector    BLOB NOT NULL,         -- little-endian float32, unit length
  weight    INTEGER NOT NULL,      -- appearances in this centroid
  PRIMARY KEY (person_id, slot)
);
"""

# The representative face is the person's face with the largest box area x confidence (voogle's rule).
PICK_FACE = """UPDATE persons SET face_id = (
  SELECT r.id FROM person_faces pf JOIN results r ON r.id = pf.result_id WHERE pf.person_id = persons.id
  ORDER BY json_extract(r.bbox, '$[2]') * json_extract(r.bbox, '$[3]') * r.score DESC, r.id LIMIT 1)
WHERE """


@dataclass
class GroupSummary:
    faces: int        # faces assigned this run
    new_persons: int  # persons created this run
    joined: int       # faces that joined a person who existed before this run


def run_grouping(data_dir: Path) -> GroupSummary:
    """Assign every face result without a person. Returns counts of faces assigned and persons
    created. Does nothing when there are no unassigned faces, except re-picking the representative
    face of persons whose face a re-ingest deleted."""
    conn = connect(data_dir / "snapsort.db")
    try:
        conn.executescript(SCHEMA)
        with conn:  # one transaction: any error rolls back every write
            return _group(conn)
    finally:
        conn.close()


def _group(conn) -> GroupSummary:
    before = conn.execute("SELECT coalesce(max(id), 0) FROM persons").fetchone()[0]
    rows = conn.execute(
        "SELECT r.id, f.media_id, r.vector FROM results r JOIN frames f ON f.id = r.frame_id "
        "WHERE r.module = 'faces' AND r.id NOT IN (SELECT result_id FROM person_faces) ORDER BY r.id"
    ).fetchall()
    apps = _appearances(rows)
    touched = set()
    for s in range(0, len(apps), BATCH):  # a batch can join the persons earlier batches created
        touched |= _place(conn, apps[s:s + BATCH])
    conn.executemany(PICK_FACE + "id = ?", [(p,) for p in touched])
    conn.execute(PICK_FACE + "face_id IS NULL")
    new, in_new = conn.execute(
        "SELECT count(DISTINCT person_id), count(*) FROM person_faces WHERE person_id > ?", (before,)
    ).fetchone()
    return GroupSummary(faces=len(rows), new_persons=new, joined=len(rows) - in_new)


def _appearances(rows) -> list[tuple[list[int], np.ndarray]]:
    """Step 2: within each media file, faces joined by single link form one appearance, whose
    vector is the unit mean of its faces. Returns (result ids, vector) per appearance."""
    by_media: dict[int, list] = {}
    for rid, media_id, blob in rows:
        by_media.setdefault(media_id, []).append((rid, blob))
    apps = []
    for faces in by_media.values():
        X = np.stack([np.frombuffer(blob, "<f4") for _, blob in faces])
        apps += [([faces[i][0] for i in g], _unit(X[g].mean(0))) for g in _components(X)]
    return apps


def _components(X: np.ndarray) -> list[np.ndarray]:
    """Rows joined by any chain of pairs with cosine >= THRESHOLD. Union-find over the pairs,
    one block of CHUNK rows at a time, so a long video never builds its full matrix."""
    parent = np.arange(len(X))

    def root(i: np.ndarray) -> np.ndarray:
        while (parent[i] != i).any():
            i = parent[i]
        return i

    for s in range(0, len(X), CHUNK):
        linked = X[s:s + CHUNK] @ X[s:].T >= THRESHOLD
        for k, row in enumerate(linked):
            nodes = np.flatnonzero(row[k:]) + s + k  # pairs (i, j >= i); i itself is included
            r = root(nodes)
            parent[r] = parent[nodes] = r.min()
    labels = root(np.arange(len(X)))
    order = np.argsort(labels, kind="stable")
    return np.split(order, np.flatnonzero(np.diff(labels[order])) + 1)


def _place(conn, apps) -> set[int]:
    """Steps 3-5 for one batch of appearances. Returns the persons it touched."""
    V = np.stack([v for _, v in apps])
    placed = []  # (appearance index, person id, score)
    left = np.arange(len(apps))
    # ponytail: reloads every centroid per batch; keep them in memory if big libraries group slowly
    cents = conn.execute("SELECT person_id, vector FROM person_centroids").fetchall()
    if cents:
        owner = np.array([p for p, _ in cents])
        S = V @ np.stack([np.frombuffer(b, "<f4") for _, b in cents]).T
        best, j = S.max(1), S.argmax(1)
        placed = [(i, int(owner[j[i]]), float(best[i])) for i in np.flatnonzero(best >= THRESHOLD)]
        left = np.flatnonzero(best < THRESHOLD)
    for community in _communities(V[left]):
        pid = conn.execute("INSERT INTO persons DEFAULT VALUES").lastrowid
        placed += [(int(left[i]), pid, 1.0) for i in community]
    conn.executemany("INSERT INTO person_faces (result_id, person_id, score) VALUES (?, ?, ?)",
                     [(rid, pid, score) for i, pid, score in placed for rid in apps[i][0]])
    new: dict[int, list] = {}
    for i, pid, _ in placed:
        new.setdefault(pid, []).append(apps[i][1])
    for pid, vectors in new.items():
        _refresh_centroids(conn, pid, np.stack(vectors))
    return set(new)


def _communities(X: np.ndarray) -> list[list[int]]:
    """Step 4: Louvain over the graph with an edge wherever cosine >= THRESHOLD, weighted by
    the cosine. An isolated row is its own community. Ordered by first row."""
    S = X @ X.T
    r, c = np.nonzero(np.triu(S >= THRESHOLD, 1))
    g = nx.Graph()
    g.add_nodes_from(range(len(X)))
    g.add_weighted_edges_from(zip(r.tolist(), c.tolist(), S[r, c].tolist()))
    return sorted(sorted(comm) for comm in nx.community.louvain_communities(g, weight="weight", seed=SEED))


def _refresh_centroids(conn, person_id: int, new: np.ndarray) -> None:
    """Step 5 (deviation 4): the person's stored centroids, each weighted by its appearance count,
    plus this batch's new appearances (weight 1), summarized again. The person's faces are never
    reloaded, so the cost stays the same however many faces the person has."""
    rows = conn.execute("SELECT vector, weight FROM person_centroids WHERE person_id = ?", (person_id,)).fetchall()
    X = np.stack([np.frombuffer(v, "<f4") for v, _ in rows] + list(new))
    weight = np.array([w for _, w in rows] + [1] * len(new), np.float64)
    _save_centroids(conn, person_id, X, weight)


def _save_centroids(conn, person_id: int, X: np.ndarray, weight: np.ndarray) -> None:
    """Replace the person's centroids with the rows of X, or with CENTROIDS weighted k-means
    centroids when X has more rows. `weight` is the appearances behind each row. Slots k-means
    leaves empty are not stored."""
    if len(X) > CENTROIDS:
        X, weight = _kmeans(X, weight, CENTROIDS)
    keep = weight > 0
    conn.execute("DELETE FROM person_centroids WHERE person_id = ?", (person_id,))
    conn.executemany(
        "INSERT INTO person_centroids (person_id, slot, vector, weight) VALUES (?, ?, ?, ?)",
        [(person_id, slot, c.astype("<f4").tobytes(), int(round(w)))
         for slot, (c, w) in enumerate(zip(X[keep], weight[keep]))])


def _kmeans(X: np.ndarray, weight: np.ndarray, k: int) -> tuple[np.ndarray, np.ndarray]:
    """Weighted spherical k-means, ported from voogle's electCentroids. Returns k unit centroids and
    the total weight in each:
    - k-means++ start with distance 1 - cos, sampled in proportion to weight x distance²
    - assignment by max dot product, then weighted unit means
    - empty slots reseeded from the largest cluster's members farthest from its centroid"""
    rng = np.random.default_rng(SEED)
    n = len(X)
    C = [X[rng.integers(n)]]
    d2 = np.full(n, np.inf)
    for _ in range(1, k):
        d2 = np.minimum(d2, np.maximum(1 - X @ C[-1], 0).astype(np.float64) ** 2)
        p = d2 * weight
        total = p.sum()
        # identical vectors (one photo copied into many folders) leave nothing to weigh by
        C.append(X[rng.choice(n, p=p / total) if total > 0 else rng.integers(n)])
    C = np.stack(C)
    labels = np.full(n, -1)
    for _ in range(KMEANS_ITERS):
        new = (X @ C.T).argmax(1)
        if (new == labels).all():
            break
        labels = new
        counts = np.bincount(labels, weights=weight, minlength=k)
        sums = np.zeros_like(C)
        np.add.at(sums, labels, X * weight[:, None].astype(X.dtype))
        full = counts > 0
        C[full] = _unit(sums[full])
        empty = np.flatnonzero(~full)
        if empty.size:
            big = counts.argmax()
            members = np.flatnonzero(labels == big)
            far = members[np.argsort(X[members] @ C[big])]
            C[empty] = X[far[np.minimum(np.arange(empty.size), far.size - 1)]]
    return C, np.bincount(labels, weights=weight, minlength=k)


def _unit(x: np.ndarray) -> np.ndarray:
    return x / np.linalg.norm(x, axis=-1, keepdims=True)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `uv run pytest tests/group -q`
Expected: `13 passed`.

Run: `uv run pytest -q`
Expected: `99 passed, 3 skipped` (the 3 skips are phase 1's env-gated checks).

- [ ] **Step 6: Commit**

```bash
git add snapsort/group.py tests/group/test_group.py pyproject.toml uv.lock
git commit -m "Group face results into persons"
```

---

### Task 2: `snapsort group` and grouping after ingest

**Files:**
- Modify: `snapsort/cli.py`
- Modify: `tests/e2e/test_cli.py`

**Interfaces:**
- Consumes: `run_grouping(data_dir: Path) -> GroupSummary` from Task 1
- Produces:
  - the `snapsort group` subcommand
  - `cli._group() -> bool`, which prints the summary line and returns False on failure
  - `cli.run_grouping`, imported by name so a test can monkeypatch it

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/test_cli.py`, add `import snapsort.cli as cli` below the existing imports.

In `test_ingest_video_with_example_module`, add this as the last line. It checks that grouping only follows the `faces` module:

```python
    assert "grouping" not in proc.stdout
```

Append:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/e2e/test_cli.py -q`
Expected: the 4 new tests fail. The tests that run `group` get argparse's `invalid choice: 'group'`. `test_ingest_groups_after_faces` finds no grouping line. `test_grouping_failure_exits_1` fails on `AttributeError: ... has no attribute 'run_grouping'`.

- [ ] **Step 3: Implement**

`snapsort/cli.py` in full:

```python
"""snapsort command line."""
import argparse
import inspect
import sys
from pathlib import Path

from snapsort.group import run_grouping
from snapsort.ingest import run_ingest
from snapsort.modules import discover

DATA_DIR = Path(".snapsort")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="snapsort")
    sub = parser.add_subparsers(dest="cmd", required=True)
    ingest = sub.add_parser("ingest", help="process image/video files or folders")
    ingest.add_argument("paths", nargs="+", type=Path)
    ingest.add_argument("--modules", help="comma-separated module names (default: all)")
    sub.add_parser("modules", help="list discovered modules")
    sub.add_parser("group", help="group face results into persons")
    args = parser.parse_args(argv)

    if args.cmd == "group":
        if not (DATA_DIR / "snapsort.db").is_file():
            print(f"error: no database at {DATA_DIR / 'snapsort.db'}", file=sys.stderr)
            return 2
        return 0 if _group() else 1
    try:
        modules = discover()
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if args.cmd == "modules":
        for m in modules:
            print(f"{m.name}\t{m.version}\t{inspect.getfile(type(m))}")
        return 0
    if args.modules:
        by_name = {m.name: m for m in modules}
        wanted = list(dict.fromkeys(n.strip() for n in args.modules.split(",") if n.strip()))
        unknown = [n for n in wanted if n not in by_name]
        if unknown:
            print(f"error: unknown module(s): {', '.join(unknown)}. "
                  f"available: {', '.join(by_name) or 'none'}", file=sys.stderr)
            return 2
        modules = [by_name[n] for n in wanted]
    if not modules:
        print("error: no modules to run", file=sys.stderr)
        return 2
    ok = run_ingest(args.paths, modules, DATA_DIR)
    if any(m.name == "faces" for m in modules):  # the frontend expects people to refresh when ingest ends
        ok = _group() and ok
    return 0 if ok else 1


def _group() -> bool:
    """Run grouping and print its one-line summary. False if it failed, in which case nothing was written."""
    try:
        s = run_grouping(DATA_DIR)
    except Exception as e:
        print(f"error: grouping failed: {type(e).__name__}: {e}", file=sys.stderr)
        return False
    print(f"grouping  {s.faces} faces  {s.new_persons} new persons  {s.joined} joined existing")
    return True
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/e2e/test_cli.py -q`
Expected: `9 passed`.

Run: `uv run pytest -q`
Expected: `103 passed, 3 skipped`.

- [ ] **Step 5: Commit**

```bash
git add snapsort/cli.py tests/e2e/test_cli.py
git commit -m "Add snapsort group and group faces after ingest"
```

---

### Task 3: Real-face checks and a manual run

**Files:**
- Modify: `tests/group/test_group.py`

**Interfaces:**
- Consumes:
  - `run_grouping` and `GroupSummary` from Task 1
  - `snapsort.ingest.run_ingest(paths, modules, data_dir) -> bool`
  - `snapsort.modules.faces.Faces`

- [ ] **Step 1: Write the env-gated tests**

Replace the docstring and import block of `tests/group/test_group.py` with:

```python
"""Grouping tests. Synthetic unit vectors go straight into a temp database, so no model runs.
Real-face checks run only when SNAPSORT_FACE_TEST_DIR or SNAPSORT_LFW_DIR is set, because the
repo commits no binary fixtures."""
import json
import os
import sqlite3
import time
import tracemalloc
from collections import Counter
from pathlib import Path

import numpy as np
import pytest

import snapsort.group as group
from snapsort.group import CENTROIDS, GroupSummary, run_grouping
from snapsort.ingest import connect, run_ingest
from snapsort.modules.faces import Faces
```

Append:

```python
FACE_DIR = os.environ.get("SNAPSORT_FACE_TEST_DIR")
LFW_DIR = os.environ.get("SNAPSORT_LFW_DIR")


def labeled(data_dir):
    """(media path, bbox, person id) of every grouped face."""
    with sqlite3.connect(data_dir / "snapsort.db") as conn:
        return conn.execute(
            "SELECT m.path, r.bbox, pf.person_id FROM person_faces pf JOIN results r ON r.id = pf.result_id "
            "JOIN frames f ON f.id = r.frame_id JOIN media m ON m.id = f.media_id").fetchall()


@pytest.mark.skipif(not FACE_DIR, reason="set SNAPSORT_FACE_TEST_DIR to voogle's labeled folder ('for testing - normalized')")
def test_labeled_photos_give_three_persons(data_dir):
    assert run_ingest([Path(FACE_DIR)], [Faces()], data_dir)
    assert run_grouping(data_dir) == GroupSummary(faces=23, new_persons=3, joined=0)
    folder = {}  # folder name -> {photo -> persons in it}
    for path, _, pid in labeled(data_dir):
        folder.setdefault(Path(path).parent.name, {}).setdefault(path, set()).add(pid)
    [andrea], [dj], [kathryn] = ({p for s in folder[n].values() for p in s} for n in ("Andrea", "DJ", "kathryn"))
    assert len({andrea, dj, kathryn}) == 3
    assert list(folder["KathrynAndDJ"].values()) == [{kathryn, dj}] * 4


def rebuild_centroids(conn, person_id, new):
    """The design's step 5, kept as the reference for deviation 4. It rebuilds from every face of
    the person, one unit mean per media file, and ignores `new`."""
    by_media = {}
    for media_id, blob in conn.execute(
            "SELECT f.media_id, r.vector FROM person_faces pf JOIN results r ON r.id = pf.result_id "
            "JOIN frames f ON f.id = r.frame_id WHERE pf.person_id = ?", (person_id,)):
        by_media.setdefault(media_id, []).append(np.frombuffer(blob, "<f4"))
    X = group._unit(np.stack([np.mean(v, 0) for v in by_media.values()]))
    group._save_centroids(conn, person_id, X, np.ones(len(X)))


def lfw_scores(data_dir):
    """(pair precision, mixed groups, main-group share of people with >= 10 photos), scored on the
    face whose box holds each photo's center. That is the face LFW labels."""
    center = {}  # photo -> (distance to the center, person)
    for path, bbox, pid in labeled(data_dir):
        x, y, w, h = json.loads(bbox)
        d = (x + w / 2 - 0.5) ** 2 + (y + h / 2 - 0.5) ** 2
        if x <= 0.5 <= x + w and y <= 0.5 <= y + h and d < center.get(path, (2, None))[0]:
            center[path] = (d, pid)
    true = [Path(p).parent.name for p in center]
    found = [pid for _, pid in center.values()]

    def pairs(n):
        return n * (n - 1) / 2

    precision = sum(map(pairs, Counter(zip(found, true)).values())) / sum(map(pairs, Counter(found).values()))
    per_person, per_group = {}, {}
    for t, f in zip(true, found):
        per_person.setdefault(t, Counter())[f] += 1
        per_group.setdefault(f, Counter())[t] += 1
    mixed = sum(1 for c in per_group.values() if len(c) > 1 and sorted(c.values())[-2] >= 2)
    share = float(np.mean([max(c.values()) / c.total() for c in per_person.values() if c.total() >= 10]))
    return precision, mixed, share


@pytest.mark.skipif(not LFW_DIR, reason="set SNAPSORT_LFW_DIR to a folder with lfw/ (about 7 min)")
def test_lfw_deviation_4_vs_full_rebuild(data_dir, monkeypatch):
    """All 13,233 LFW photos are ingested once, then grouped by each centroid refresh:
    - in two passes (every other photo, then the rest), so the second pass joins through stored centroids
    - again after a full re-ingest, where every face is deleted and comes back with the same vector
    The probe measured equal scores, except after the re-ingest (share 96.93% vs 94.49% for the rebuild)."""
    files = sorted((Path(LFW_DIR) / "lfw").glob("*/*.jpg"))
    assert run_ingest(files, [Faces()], data_dir)
    later = {str(f.resolve()) for f in files[1::2]}
    scores = {}
    for name, refresh in (("rebuild", rebuild_centroids), ("deviation 4", group._refresh_centroids)):
        monkeypatch.setattr(group, "_refresh_centroids", refresh)
        conn = connect(data_dir / "snapsort.db")
        conn.executescript(group.SCHEMA)
        with conn:  # start clean and hide the second half
            conn.execute("DELETE FROM persons")  # cascades to person_faces and person_centroids
            conn.executemany(
                "UPDATE results SET module = 'faces_later' WHERE frame_id IN (SELECT id FROM frames WHERE media_id = ?)",
                [(m,) for m, p in conn.execute("SELECT id, path FROM media") if p in later])
        run_grouping(data_dir)  # pass 1: every other photo
        with conn:
            conn.execute("UPDATE results SET module = 'faces' WHERE module = 'faces_later'")
        run_grouping(data_dir)  # pass 2: the rest
        scores[name, "2 passes"] = lfw_scores(data_dir)
        with conn:  # a full re-ingest: every face deleted, then stored again with the same vector
            last = conn.execute("SELECT max(id) FROM results").fetchone()[0]
            conn.execute("INSERT INTO results (frame_id, module, label, score, bbox, vector, data) "
                         "SELECT frame_id, module, label, score, bbox, vector, data FROM results WHERE module = 'faces'")
            conn.execute("DELETE FROM results WHERE module = 'faces' AND id <= ?", (last,))
        run_grouping(data_dir)
        scores[name, "re-ingest"] = lfw_scores(data_dir)
        conn.close()
    for (name, case), (p, m, s) in scores.items():
        print(f"{name:12s} {case:10s} precision {p:.4f}  mixed groups {m}  share {s:.4f}")
    p, m, s = scores["deviation 4", "2 passes"]
    assert p >= 0.995 and m <= 1 and s >= 0.96  # the design's check, with deviation 2's floor
    for case in ("2 passes", "re-ingest"):  # the user's rule for deviation 4: within 5% of the rebuild
        (p4, _, s4), (pr, _, sr) = scores["deviation 4", case], scores["rebuild", case]
        assert p4 >= 0.95 * pr and s4 >= 0.95 * sr, case
```

- [ ] **Step 2: Run the real-face checks**

Run: `SNAPSORT_FACE_TEST_DIR="$HOME/Downloads/for testing - normalized" SNAPSORT_LFW_DIR=/private/tmp/claude-501/-Users-a1234-Business-snapsort/954e0a01-edbd-4e2d-bd4e-faf9c7073af7/scratchpad/lfw_dl uv run pytest tests/group -v -s`
Expected: `15 passed` in about 7 min. `-s` prints the 4 score lines: rebuild and deviation 4, each after 2 passes and after the re-ingest. Report that table to the user.

If an LFW assertion fails, stop and report the measured table to the user before changing anything. That covers deviation 4 falling outside 5% of the rebuild, and the share landing under 0.96. Do not lower a floor, and do not switch the refresh method.

Run: `uv run pytest -q`
Expected: `103 passed, 5 skipped`.

- [ ] **Step 3: Manual run on the phase 1 database**

The worktree's `.snapsort/snapsort.db` (git-ignored) holds phase 1's ingest: 19 photos (23 faces) and `src.mp4` (75 faces).

Run: `/usr/bin/time -l uv run snapsort group`
Expected: `grouping  98 faces  4 new persons  0 joined existing`. The 4 persons are Andrea, DJ, Kathryn and the person in `src.mp4`. A 5th person is possible if a head-turn fragment of the video stays apart. Record the wall time.

Run: `uv run snapsort group`
Expected: `grouping  0 faces  0 new persons  0 joined existing`.

Run:

```bash
sqlite3 .snapsort/snapsort.db "SELECT p.id, count(*) faces, count(DISTINCT f.media_id) files, group_concat(DISTINCT m.kind) FROM persons p JOIN person_faces pf ON pf.person_id = p.id JOIN results r ON r.id = pf.result_id JOIN frames f ON f.id = r.frame_id JOIN media m ON m.id = f.media_id GROUP BY p.id"
```

Then build one sheet row per person and check by eye that no row mixes people. Save this to the scratchpad as `person_sheet.py`. It is not committed.

```python
"""One row per person, up to 12 face crops each."""
import json
import sqlite3
import sys

from PIL import Image, ImageDraw, ImageOps

db, out = sys.argv[1], sys.argv[2]
people = {}
for pid, path, bbox in sqlite3.connect(db).execute(
        "SELECT pf.person_id, f.path, r.bbox FROM person_faces pf JOIN results r ON r.id = pf.result_id "
        "JOIN frames f ON f.id = r.frame_id ORDER BY pf.person_id, r.id"):
    people.setdefault(pid, []).append((path, json.loads(bbox)))
T = 96
sheet = Image.new("RGB", (60 + 12 * T, len(people) * T), "white")
d = ImageDraw.Draw(sheet)
for row, (pid, faces) in enumerate(people.items()):
    d.text((4, row * T + 4), f"#{pid}\n{len(faces)}", fill="black")
    for col, (path, (x, y, w, h)) in enumerate(faces[::max(1, len(faces) // 12)][:12]):
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        W, H = im.size
        sheet.paste(im.crop((x * W, y * H, (x + w) * W, (y + h) * H)).resize((T, T)), (60 + col * T, row * T))
sheet.save(out, quality=88)
print(out, len(people), "persons")
```

Run: `uv run python /private/tmp/claude-501/-Users-a1234-Business-snapsort/954e0a01-edbd-4e2d-bd4e-faf9c7073af7/scratchpad/person_sheet.py .snapsort/snapsort.db /private/tmp/claude-501/-Users-a1234-Business-snapsort/954e0a01-edbd-4e2d-bd4e-faf9c7073af7/scratchpad/persons.jpg`
Expected: one row per person, and no row mixes two people.

- [ ] **Step 4: Commit**

```bash
git add tests/group/test_group.py
git commit -m "Add env-gated grouping checks on labeled photos and LFW"
```

## Done criteria for phase 2 (from the design, with deviation 2)

- All tests pass, including:
  - exactly 3 persons on voogle's photo set
  - the LFW two-pass check: pair precision ≥ 99.5%, at most 1 mixed group, main-group share ≥ 96%
  - deviation 4 within 5% of the full rebuild on LFW, after 2 passes and after a full re-ingest
- The manual run on the phase 1 database gives the expected persons, with no mixed row on the sheet.
