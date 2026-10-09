"""Faces: Apple Vision face detection and GhostFaceNet embeddings, one result per face.

Ported from voogle-v2 with the fixes in docs/design/2026-10-09-faces.md."""
import math
from dataclasses import dataclass
from pathlib import Path

import coremltools as ct
import numpy as np
from PIL import Image

from snapsort.contract import Frame, Module, Result

MODEL = Path(__file__).resolve().parent.parent / "models" / "GhostFaceNetV1.mlpackage"
EYES = ((38.2946, 51.6963), (73.5318, 51.5014))  # ArcFace 112x112 eye centers, top-left origin
MIN_CONFIDENCE = 0.5
MIN_SIDE = 60    # px on the full-resolution frame
MAX_YAW = 45     # degrees
MAX_PITCH = 25   # degrees


@dataclass
class Face:
    box: tuple[float, float, float, float]  # x, y, w, h normalized, top-left origin; may extend past the frame
    confidence: float
    yaw: float | None                       # degrees
    pitch: float | None
    roll: float | None
    quality: float | None                   # Vision capture quality, 0-1
    left_pupil: tuple[float, float] | None  # pixels, top-left origin; the eye on the image's left
    right_pupil: tuple[float, float] | None
    nose_and_mouth: bool


def passes_gate(face: Face, width: int, height: int) -> bool:
    """The design's gate. A missing angle passes its check. No roll check, no quality floor."""
    return (face.confidence >= MIN_CONFIDENCE
            and face.box[2] * width >= MIN_SIDE and face.box[3] * height >= MIN_SIDE
            and face.left_pupil is not None and face.right_pupil is not None
            and face.nose_and_mouth
            and (face.yaw is None or abs(face.yaw) <= MAX_YAW)
            and (face.pitch is None or abs(face.pitch) <= MAX_PITCH))


def clip_box(box) -> tuple[float, float, float, float]:
    """Clip a normalized x, y, w, h box to the frame. Vision boxes can extend past the edge."""
    x, y, w, h = box
    x0, y0 = min(max(x, 0.0), 1.0), min(max(y, 0.0), 1.0)
    x1, y1 = min(max(x + w, 0.0), 1.0), min(max(y + h, 0.0), 1.0)
    return (x0, y0, x1 - x0, y1 - y0)


def iou(a, b) -> float:
    """Intersection over union of two x, y, w, h boxes."""
    ix = max(0.0, min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def align(image: Image.Image, left_pupil, right_pupil) -> Image.Image:
    """112x112 crop with the pupils on the ArcFace eye positions (similarity transform).

    Crops the region that maps onto the output first, and shrinks it so the warp is about 1:1:
    bicubic warping alone does not filter when shrinking a large face. Area outside the frame
    comes out black."""
    (lx, ly), (rx, ry) = left_pupil, right_pupil
    (tlx, tly), (trx, try_) = EYES
    s = math.hypot(trx - tlx, try_ - tly) / max(math.hypot(rx - lx, ry - ly), 1e-6)
    theta = math.atan2(try_ - tly, trx - tlx) - math.atan2(ry - ly, rx - lx)
    a, b = s * math.cos(theta), s * math.sin(theta)
    sx, sy, tx, ty = (lx + rx) / 2, (ly + ry) / 2, (tlx + trx) / 2, (tly + try_) / 2
    to_out = np.array([[a, -b, tx - (a * sx - b * sy)], [b, a, ty - (b * sx + a * sy)], [0, 0, 1]])
    to_src = np.linalg.inv(to_out)
    cx, cy, _ = to_src @ np.array([[0, 112, 0, 112], [0, 0, 112, 112], [1, 1, 1, 1]])
    x0, y0, x1, y1 = math.floor(cx.min()), math.floor(cy.min()), math.ceil(cx.max()), math.ceil(cy.max())
    crop = image.crop((x0, y0, x1, y1))  # out-of-frame area comes back black
    fx = fy = 1.0
    if s < 1:
        crop = crop.resize((max(1, round(crop.width * s)), max(1, round(crop.height * s))), Image.LANCZOS)
        fx, fy = crop.width / (x1 - x0), crop.height / (y1 - y0)
    to_crop = np.array([[fx, 0, -fx * x0], [0, fy, -fy * y0], [0, 0, 1]]) @ to_src
    return crop.transform((112, 112), Image.AFFINE, tuple(to_crop[:2].ravel()), Image.BICUBIC,
                          fillcolor=(0, 0, 0))


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
