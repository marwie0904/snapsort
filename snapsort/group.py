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
