"""objects: YOLO detections with normalized bboxes."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import torch
from PIL import Image

from snapsort.contract import Frame
from snapsort.ingest import validate
from snapsort.modules.objects import Objects


@pytest.fixture
def red_frame(sample_image) -> list[Frame]:
    return [Frame(1, str(sample_image), "image", 0, None, Image.open(sample_image).convert("RGB"))]


def _fake_predict(image, verbose=False):
    """One person box covering the left half of a 64x48 image (xyxy absolute)."""
    w, h = image.size
    box = SimpleNamespace(
        xyxy=torch.tensor([[0.0, 0.0, w / 2, h]], dtype=torch.float32),
        cls=torch.tensor([0.0]),
        conf=torch.tensor([0.91]),
    )
    pred = SimpleNamespace(names={0: "person"}, boxes=[box])
    return [pred]


def test_output_passes_contract(red_frame):
    module = Objects()
    with patch.object(module, "model", create=True) as model:
        model.predict.side_effect = _fake_predict
        results = validate(module.process(red_frame), red_frame)
    assert len(results) == 1
    r = results[0]
    assert r.label == "person"
    assert r.score == pytest.approx(0.91)
    assert r.bbox is not None
    x, y, bw, bh = r.bbox
    assert 0 <= x <= 1 and 0 <= y <= 1 and 0 < bw <= 1 and 0 < bh <= 1
    assert x == pytest.approx(0.0)
    assert y == pytest.approx(0.0)
    assert bw == pytest.approx(0.5)
    assert bh == pytest.approx(1.0)
    assert r.vector is None


def test_empty_detections(red_frame):
    module = Objects()
    empty = SimpleNamespace(names={0: "person"}, boxes=None)
    with patch.object(module, "model", create=True) as model:
        model.predict.return_value = [empty]
        results = validate(module.process(red_frame), red_frame)
    assert results == []
