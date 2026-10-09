"""Text search over stored clip_embed vectors."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from snapsort.modules.clip_embed import ClipEmbed

MODULE = "clip_embed"


@dataclass(frozen=True)
class Hit:
    path: str
    score: float
    frame_idx: int
    ts: float | None


def search(query: str, data_dir: Path, limit: int = 10) -> list[Hit]:
    """Rank media by SigLIP match probability (0-1) of query text against stored image vectors."""
    db = data_dir / "snapsort.db"
    if not db.is_file():
        raise FileNotFoundError(f"no database at {db}; run snapsort ingest --modules clip_embed first")

    conn = sqlite3.connect(db)
    try:
        rows = conn.execute(
            """
            SELECT m.path, f.idx, f.ts, r.vector
            FROM results r
            JOIN frames f ON f.id = r.frame_id
            JOIN media m ON m.id = f.media_id
            WHERE r.module = ? AND r.vector IS NOT NULL
            """,
            (MODULE,),
        ).fetchall()
    finally:
        conn.close()

    if not rows:
        raise LookupError(
            f"no {MODULE} vectors in {db}; run snapsort ingest --modules {MODULE} first"
        )

    paths, idxs, tss, blobs = zip(*rows)
    matrix = np.stack([np.frombuffer(b, dtype="<f4") for b in blobs])

    clip = ClipEmbed()
    clip.setup()
    q = clip.embed_text([query])[0]
    if q.shape[0] != matrix.shape[1]:
        raise ValueError(
            f"query dim {q.shape[0]} != stored dim {matrix.shape[1]}; "
            f"re-ingest with {MODULE} version matching the search model"
        )

    scores = clip.match_probability(matrix @ q)
    order = np.argsort(-scores)[: max(0, limit)]
    return [
        Hit(path=paths[i], score=float(scores[i]), frame_idx=int(idxs[i]), ts=tss[i])
        for i in order
    ]
