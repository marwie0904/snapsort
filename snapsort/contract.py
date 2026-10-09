"""The module contract. Every module builds against these three types.

Changes here require agreement from both developers.
"""
from dataclasses import dataclass

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class Frame:
    media_id: int
    media_path: str        # absolute path of the source file
    media_kind: str        # "image" | "video"
    idx: int               # 0-based; always 0 for images
    ts: float | None       # seconds into the video; None for images
    image: Image.Image     # RGB, full resolution. Shared across modules: do not mutate.


@dataclass
class Result:
    frame_idx: int
    label: str | None = None
    score: float | None = None                                  # 0-1
    bbox: tuple[float, float, float, float] | None = None       # x, y, w, h normalized 0-1
    vector: np.ndarray | None = None                            # 1-D embedding
    data: dict | None = None                                    # JSON-serializable extras


class Module:
    name: str               # unique, matches [a-z0-9_]+, stored with every result
    version: str = "1"      # bump to reprocess all media for this module

    def setup(self) -> None:
        """Load models. Called once per run, before the first process() call.
        Never called if the module has no pending work."""

    def process(self, frames: list[Frame]) -> list[Result]:
        """Return any number of results (zero or many per frame)."""
        raise NotImplementedError
