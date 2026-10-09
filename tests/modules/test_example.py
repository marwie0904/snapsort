"""Template module test. Copy to tests/modules/test_<name>.py for each new module."""
import numpy as np
from PIL import Image

from snapsort.contract import Frame
from snapsort.ingest import validate
from snapsort.modules.example import Example


def test_output_passes_contract(sample_frames):
    module = Example()
    module.setup()
    results = validate(module.process(sample_frames), sample_frames)
    assert len(results) == len(sample_frames)


def test_red_image_is_labeled_red(sample_frames):
    image_frame = sample_frames[:1]
    [r] = validate(Example().process(image_frame), image_frame)
    assert r.label == "red"
    assert r.vector.shape == (3,)


def test_mean_color_is_exact_on_large_image():
    image = Image.new("RGB", (4000, 3000), (200, 100, 50))
    frames = [Frame(1, "/big.png", "image", 0, None, image)]
    [r] = validate(Example().process(frames), frames)
    assert np.allclose(r.vector, np.array([200, 100, 50]) / 255, atol=1e-3)
    assert r.label == "red"
