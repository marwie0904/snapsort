"""Template module test. Copy to tests/modules/test_<name>.py for each new module."""
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
