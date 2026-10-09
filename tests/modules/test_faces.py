"""faces module tests. Real-face checks run only when SNAPSORT_FACE_TEST_DIR or SNAPSORT_LFW_DIR
is set, because the repo commits no binary fixtures."""
import numpy as np
import pytest
from PIL import Image

from snapsort.modules.faces import Faces


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
