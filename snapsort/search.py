"""Image search: rank ingested media by similarity to a query image."""
import functools
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from snapsort.ingest import classify, load_image
from snapsort.modules.image_embed import ImageEmbed

HINT = "run: snapsort ingest <path> --modules image_embed"

# Vectors of media whose image_embed run finished at the current module version. Older or
# errored runs keep stale vectors, which would score wrongly against the current model.
VECTORS = """
SELECT m.path, m.kind, f.ts, r.vector
FROM results r
JOIN frames f ON f.id = r.frame_id
JOIN media m ON m.id = f.media_id
JOIN runs u ON u.media_id = m.id AND u.module = r.module
WHERE r.module = ? AND u.status = 'done' AND u.version = ?
"""


@dataclass(frozen=True)
class Match:
    path: str           # absolute media path, as stored
    kind: str           # "image" | "video"
    score: float        # dot product of unit vectors (cosine), -1 to 1
    ts: float | None    # video: second of the best-matching frame; image: None


class SearchError(Exception):
    """The query or the library can't be searched."""


@functools.cache
def _embedder() -> ImageEmbed:
    """One loaded model per process."""
    m = ImageEmbed()
    m.setup()
    return m


def search(query: Path, data_dir: Path, limit: int = 20, min_score: float = 0.5) -> list[Match]:
    """Media most similar to the query image, best first, one Match per media file."""
    if limit < 1:
        raise SearchError(f"limit must be at least 1, got {limit}")
    if classify(query) != "image":
        raise SearchError(f"query must be an image (jpg, jpeg, png, webp, heic): {query}")
    try:
        image = load_image(query)
    except OSError as e:
        raise SearchError(f"cannot read query {query}: {e}") from e
    # Absolute in messages: the data dir is relative to the cwd, so a wrong cwd is the likely cause.
    db = data_dir.resolve() / "snapsort.db"
    if not db.exists():
        raise SearchError(f"nothing ingested in {db.parent}; {HINT}")
    with closing(sqlite3.connect(db)) as conn:
        rows = conn.execute(VECTORS, (ImageEmbed.name, ImageEmbed.version)).fetchall()
    if not rows:
        raise SearchError(f"no current image_embed vectors in {db}; {HINT}")

    q = _embedder().embed([image])[0]
    scores = np.frombuffer(b"".join(r[3] for r in rows), "<f4").reshape(len(rows), -1) @ q
    best: dict[str, Match] = {}
    for (path, kind, ts, _), score in zip(rows, scores.tolist()):
        if path not in best or score > best[path].score:
            best[path] = Match(path, kind, score, ts)
    matches = sorted((m for m in best.values() if m.score >= min_score), key=lambda m: -m.score)
    return matches[:limit]
