"""Faces: Apple Vision face detection and GhostFaceNet embeddings, one result per face.

Ported from voogle-v2 with the fixes in docs/design/2026-10-09-faces.md."""
from pathlib import Path

import coremltools as ct
import numpy as np
from PIL import Image

from snapsort.contract import Frame, Module, Result

MODEL = Path(__file__).resolve().parent.parent / "models" / "GhostFaceNetV1.mlpackage"


class Faces(Module):
    name = "faces"
    version = "1"

    def setup(self) -> None:
        self.model = ct.models.MLModel(str(MODEL), compute_units=ct.ComputeUnit.ALL)

    def embed(self, crops: list[Image.Image]) -> np.ndarray:
        """N x 512 float32 with unit-length rows, one per 112x112 RGB aligned crop.
        The model normalizes pixels itself: (pixel - 127.5) / 128."""
        if not crops:
            return np.zeros((0, 512), np.float32)
        out = self.model.predict([{"image": c} for c in crops])
        v = np.stack([np.asarray(o["embedding"], np.float32).reshape(-1) for o in out])
        return v / np.linalg.norm(v, axis=1, keepdims=True)
