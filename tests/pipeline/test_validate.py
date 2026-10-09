import numpy as np
import pytest
from PIL import Image

from snapsort.contract import Frame, Result
from snapsort.ingest import ContractError, validate

FRAMES = [Frame(1, "/x.jpg", "image", 0, None, Image.new("RGB", (4, 4)))]


def test_normalizes_valid_result():
    raw = Result(0, label="  Dog ", score=np.float32(0.5), bbox=[0, 0, 1, 1], vector=np.ones(3), data={"k": 1})
    [r] = validate([raw], FRAMES)
    assert r.label == "dog"
    assert r.score == 0.5 and type(r.score) is float
    assert r.bbox == (0.0, 0.0, 1.0, 1.0)
    assert r.vector.dtype == np.dtype("<f4") and r.vector.tolist() == [1.0, 1.0, 1.0]
    assert r.data == {"k": 1}


def test_empty_output_is_valid():
    assert validate([], FRAMES) == []


@pytest.mark.parametrize("bad, match", [
    ("not a result", "expected Result"),
    (Result(5), "frame_idx"),
    (Result(0, label=3), "label"),
    (Result(0, score=1.5), "score"),
    (Result(0, score=True), "score"),
    (Result(0, score=float("nan")), "score"),
    (Result(0, bbox=(0, 0, 2, 1)), "bbox"),
    (Result(0, bbox=(0, 0, 1)), "bbox"),
    (Result(0, vector=np.ones((2, 2))), "vector"),
    (Result(0, vector=[1.0, 2.0]), "vector"),
    (Result(0, vector=np.array([np.nan])), "vector"),
    (Result(0, data=[1]), "data"),
    (Result(0, data={"x": object()}), "data"),
])
def test_rejects_contract_violations(bad, match):
    with pytest.raises(ContractError, match=match):
        validate([bad], FRAMES)


def test_rejects_mixed_vector_dims():
    with pytest.raises(ContractError, match="dim"):
        validate([Result(0, vector=np.ones(3)), Result(0, vector=np.ones(4))], FRAMES)


def test_rejects_non_list():
    with pytest.raises(ContractError, match="list"):
        validate(None, FRAMES)
