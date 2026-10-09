"""image_embed: one DINOv2-base vector per frame."""
import numpy as np
import pytest
from PIL import Image

from snapsort.ingest import validate
from snapsort.modules.image_embed import ImageEmbed


@pytest.fixture(scope="module")
def embedder():
    m = ImageEmbed()
    m.setup()
    return m


def test_one_unit_vector_per_frame(embedder, sample_frames):
    results = validate(embedder.process(sample_frames), sample_frames)
    assert [r.frame_idx for r in results] == [f.idx for f in sample_frames]
    for r in results:
        assert r.vector.shape == (768,)
        assert np.isclose(np.linalg.norm(r.vector), 1, atol=1e-4)
        assert r.label is None and r.score is None and r.bbox is None and r.data is None


def test_similar_frames_score_higher(embedder, sample_frames):
    red, v0, v1 = embedder.embed([f.image for f in sample_frames[:3]])
    assert v0 @ v1 > v0 @ red
    assert v0 @ v1 > v1 @ red


def test_query_alone_matches_batched(embedder, sample_frames):
    # Search embeds one query image. Ingest embedded it inside a batch. Both must agree.
    images = [f.image for f in sample_frames]
    batched = embedder.embed(images)
    alone = embedder.embed([images[2]])
    assert alone.shape == (1, 768)
    assert np.allclose(alone[0], batched[2], atol=1e-4)


@pytest.mark.parametrize("size, mode", [
    ((4032, 3024), "RGB"),   # full-res phone photo
    ((6000, 800), "RGB"),    # panorama
    ((32, 32), "RGB"),       # icon
    ((640, 480), "L"),       # grayscale query passed straight from search
    ((640, 480), "RGBA"),    # PNG with alpha passed straight from search
])
def test_odd_inputs_embed(embedder, size, mode):
    v = embedder.embed([Image.new(mode, size)])
    assert v.shape == (1, 768)
    assert v.dtype == np.float32
    assert np.isfinite(v).all()
    assert np.isclose(np.linalg.norm(v[0]), 1, atol=1e-4)
