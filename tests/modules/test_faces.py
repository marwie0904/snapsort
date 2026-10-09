"""faces module tests. Real-face checks run only when SNAPSORT_FACE_TEST_DIR or SNAPSORT_LFW_DIR
is set, because the repo commits no binary fixtures."""
import math

import numpy as np
import pytest
from PIL import Image, ImageDraw

from snapsort.modules.faces import EYES, Face, Faces, align, clip_box, iou, passes_gate


@pytest.fixture(scope="module")
def faces():
    m = Faces()
    m.setup()
    return m


def test_embed_returns_unit_512_vectors(faces):
    crops = [Image.new("RGB", (112, 112), (120, 90, 60)), Image.new("RGB", (112, 112), (30, 200, 90))]
    v = faces.embed(crops)
    assert v.shape == (2, 512) and v.dtype == np.float32
    assert np.allclose(np.linalg.norm(v, axis=1), 1, atol=1e-5)
    assert np.allclose(faces.embed(crops[:1]), v[:1], atol=1e-4)  # same crop, same vector


def test_embed_empty(faces):
    assert faces.embed([]).shape == (0, 512)


def make_face(**change):
    base = dict(box=(0.2, 0.2, 0.3, 0.3), confidence=0.8, yaw=0.0, pitch=0.0, roll=0.0, quality=0.5,
                left_pupil=(10.0, 10.0), right_pupil=(20.0, 10.0), nose_and_mouth=True)
    return Face(**{**base, **change})


@pytest.mark.parametrize("change, kept", [
    ({}, True),
    ({"confidence": 0.49}, False),
    ({"box": (0.2, 0.2, 0.059, 0.3)}, False),  # 59 px wide on a 1000 px frame
    ({"box": (0.2, 0.2, 0.3, 0.059)}, False),  # 59 px tall
    ({"box": (0.2, 0.2, 0.061, 0.061)}, True),
    ({"left_pupil": None}, False),
    ({"right_pupil": None}, False),
    ({"nose_and_mouth": False}, False),
    ({"yaw": 45.0}, True),
    ({"yaw": -45.1}, False),
    ({"yaw": None}, True),
    ({"pitch": -25.0}, True),
    ({"pitch": 25.1}, False),
    ({"pitch": None}, True),
    ({"roll": 80.0}, True),     # no roll check: alignment removes roll
    ({"quality": 0.05}, True),  # no quality floor: closed eyes and selfie video score low
    ({"quality": None}, True),
])
def test_gate(change, kept):
    assert passes_gate(make_face(**change), 1000, 1000) is kept


@pytest.mark.parametrize("box, clipped", [
    ((0.1, 0.2, 0.3, 0.4), (0.1, 0.2, 0.3, 0.4)),
    ((-0.1, 0.2, 0.3, 0.4), (0.0, 0.2, 0.2, 0.4)),
    ((0.9, 0.8, 0.2, 0.3), (0.9, 0.8, 0.1, 0.2)),
    ((0.1, -0.05, 0.3, 1.2), (0.1, 0.0, 0.3, 1.0)),
])
def test_clip_box(box, clipped):
    assert clip_box(box) == pytest.approx(clipped)


def test_iou():
    assert iou((0, 0, 1, 1), (0, 0, 1, 1)) == 1
    assert iou((0, 0, 1, 1), (2, 2, 1, 1)) == 0
    assert iou((0, 0, 2, 1), (1, 0, 2, 1)) == pytest.approx(1 / 3)


def red_centroids(crop):
    """Centers of the red dots left and right of the crop's vertical midline."""
    a = np.asarray(crop, int)
    ys, xs = np.nonzero((a[..., 0] > 150) & (a[..., 1] < 100) & (a[..., 2] < 100))
    left, right = xs < 56, xs >= 56
    return (xs[left].mean(), ys[left].mean()), (xs[right].mean(), ys[right].mean())


@pytest.mark.parametrize("size, left, right", [
    ((400, 300), (150, 120), (210, 126)),      # small face: upscaled
    ((3000, 2000), (1200, 900), (1800, 840)),  # big tilted face: shrunk before warping
    ((400, 300), (5, 40), (60, 44)),           # face at the frame edge
])
def test_align_puts_pupils_on_arcface_eyes(size, left, right):
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    r = math.dist(left, right) / 12
    for x, y in (left, right):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 0, 0))
    crop = align(img, left, right)
    assert crop.size == (112, 112) and crop.mode == "RGB"
    for (gx, gy), (ex, ey) in zip(red_centroids(crop), EYES):
        assert abs(gx - ex) < 1.0 and abs(gy - ey) < 1.0


def test_align_fills_outside_the_frame_with_black():
    img = Image.new("RGB", (400, 300), "white")
    crop = align(img, (5, 40), (60, 44))
    assert crop.getpixel((0, 56)) == (0, 0, 0)
