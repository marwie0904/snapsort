"""clip_embed: one CLIP vector per frame."""
import numpy as np
import pytest
from PIL import Image

from snapsort.ingest import validate
from snapsort.modules.clip_embed import ClipEmbed


@pytest.fixture(scope="module")
def embedder():
    m = ClipEmbed()
    m.setup()
    return m


def test_one_unit_vector_per_frame(embedder, sample_frames):
    results = validate(embedder.process(sample_frames), sample_frames)
    assert [r.frame_idx for r in results] == [f.idx for f in sample_frames]
    dim = None
    for r in results:
        assert r.vector.ndim == 1
        assert np.isfinite(r.vector).all()
        assert r.vector.dtype == np.float32 or np.issubdtype(r.vector.dtype, np.floating)
        assert np.isclose(np.linalg.norm(r.vector), 1, atol=1e-3)
        assert r.label is None and r.score is None and r.bbox is None and r.data is None
        if dim is None:
            dim = r.vector.size
        else:
            assert r.vector.size == dim


def test_text_and_image_same_dim(embedder, sample_frames):
    img = embedder.embed_images([sample_frames[0].image])
    txt = embedder.embed_text(["a red square"])
    assert img.shape[1] == txt.shape[1]
    assert img.shape == (1, img.shape[1])
    assert np.isclose(np.linalg.norm(txt[0]), 1, atol=1e-3)


def test_odd_inputs_embed(embedder):
    v = embedder.embed_images([Image.new("RGB", (32, 32), (10, 200, 40))])
    assert v.ndim == 2 and v.shape[0] == 1
    assert np.isfinite(v).all()
