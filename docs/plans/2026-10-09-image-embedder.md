# Image Embedder Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `image_embed` module, which stores one DINOv2-base vector per frame for later image → image search.

**Architecture:** One module file, `snapsort/modules/image_embed.py`, implementing the pipeline's `Module` contract. `embed()` does all model work and is public, so the search module can embed query images the same way. `process()` wraps `embed()` into one `Result` per frame. The pipeline runner owns all storage.

**Tech Stack:** Python 3.12, uv, torch (MPS on Apple Silicon), Hugging Face `transformers`, pytest.

**Spec:** `docs/design/2026-10-09-image-embedder.md`. The pipeline contract it builds on is `docs/design/2026-10-09-ingest-pipeline.md`.

## Global Constraints

- Python 3.12 (pinned in `.python-version`). Add dependencies only with `uv add`.
- Model: `facebook/dinov2-base`. Module `name = "image_embed"`, `version = "1"`.
- Vectors: 768-d, float32, L2-normalized (unit length), from `pooler_output`.
- Preprocessing: the whole image is resized to 224×224 regardless of aspect ratio. No center crop.
- The module writes nothing except the Hugging Face model cache (`~/.cache/huggingface`). The runner owns all DB writes.
- Do not create `snapsort/modules/__init__.py` (the pipeline owns discovery there). Do not edit `snapsort/contract.py` (changes need both developers' agreement).
- Commit messages have no `Co-Authored-By` lines.

## Review Focus

1. A query image embedded alone (how search calls `embed()`) must give the same vector as that image embedded inside a batch of 16 (how ingest stored it). Otherwise search scores are skewed. Pinned by `test_query_alone_matches_batched` in Task 2.
2. Full-resolution phone photos (4032×3024) must embed without error. Pinned by `test_odd_inputs_embed` in Task 2.
3. Panoramas (6000×800) and tiny icons (32×32) must embed without error, despite heavy squashing. Pinned by `test_odd_inputs_embed` in Task 2.
4. The search module may pass a grayscale (`L`) or `RGBA` query image without going through the pipeline's `load_image()`. It must still embed. Pinned by `test_odd_inputs_embed` in Task 2.
5. A single-image call must return shape `(1, 768)`, not `(768,)`, so search can always index `[0]`. Pinned by `test_query_alone_matches_batched` and `test_odd_inputs_embed` in Task 2.

---

### Task 1: Base the branch on the pipeline and add dependencies

**Files:**
- Modify: `pyproject.toml` (dependencies, via `uv add`)
- Modify: `uv.lock` (via `uv add`)

**Interfaces:**
- Consumes: from the `ingest-pipeline` branch: `snapsort/contract.py` (`Frame`, `Result`, `Module`), `snapsort/ingest.py` (`validate(results, frames) -> list[Result]`, `ContractError`), and `tests/conftest.py` (the `sample_frames` fixture: the red 64×48 image at `frames[0]`, then the 3 frames of a 320×240 `testsrc` video).
- Produces: a branch where `uv run pytest` passes and `import torch, transformers` works.

- [ ] **Step 1: Rebase onto the pipeline branch**

If the pipeline has already merged to `main`, use `main` instead of `ingest-pipeline` in this step.

Run: `git rebase ingest-pipeline`
Expected: the spec and plan commits are replayed with no conflicts. `git log --oneline -6` shows them above the pipeline commits (`Add input resolution, frame extraction and storage schema`, `Add project scaffold, module contract and result validation`). `snapsort/contract.py` and `tests/conftest.py` now exist.

- [ ] **Step 2: Install and run the pipeline's tests**

Run: `uv sync && uv run pytest`
Expected: all existing tests (under `tests/pipeline/`) PASS.

- [ ] **Step 3: Add dependencies**

Run: `uv add torch transformers`
Expected: `pyproject.toml` lists `torch` and `transformers` under `[project] dependencies`, and `uv.lock` is updated.

- [ ] **Step 4: Check imports and MPS**

Run: `uv run python -c "import torch, transformers; print(torch.__version__, transformers.__version__, torch.backends.mps.is_available())"`
Expected: two version strings and `True` on an Apple Silicon Mac.

- [ ] **Step 5: Re-run tests**

Run: `uv run pytest`
Expected: same result as Step 2, all PASS.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "Add torch and transformers for the image_embed module"
```

---

### Task 2: `image_embed` module

**Files:**
- Create: `snapsort/modules/image_embed.py`
- Test: `tests/modules/test_image_embed.py`

**Interfaces:**
- Consumes: `Frame`, `Result`, `Module` from `snapsort.contract`. `validate` from `snapsort.ingest`. The `sample_frames` fixture from `tests/conftest.py`.
- Produces (used later by the search module):
  - `ImageEmbed()`: no constructor arguments.
  - `ImageEmbed.setup() -> None`: loads the model. Must be called before `embed()` or `process()`.
  - `ImageEmbed.embed(images: list[PIL.Image.Image]) -> np.ndarray`: shape `(len(images), 768)`, dtype float32, unit-length rows.
  - `ImageEmbed.process(frames: list[Frame]) -> list[Result]`: one `Result(frame_idx=f.idx, vector=<768-d>)` per frame, in frame order.

- [ ] **Step 1: Write the failing tests**

Create `tests/modules/test_image_embed.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `uv run pytest tests/modules/test_image_embed.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'snapsort.modules.image_embed'`.

- [ ] **Step 3: Write the module**

Create `snapsort/modules/image_embed.py`:

```python
"""Image embeddings with DINOv2-base, for image -> image search."""
import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

from snapsort.contract import Frame, Module, Result

MODEL = "facebook/dinov2-base"


class ImageEmbed(Module):
    name = "image_embed"
    version = "1"

    def setup(self) -> None:
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        # Squash the whole frame to 224x224. The default center crop drops the edges
        # (about half of a 16:9 video frame).
        self.processor = AutoImageProcessor.from_pretrained(
            MODEL, size={"height": 224, "width": 224}, do_center_crop=False)
        self.model = AutoModel.from_pretrained(MODEL).to(self.device).eval()

    def embed(self, images: list[Image.Image]) -> np.ndarray:
        """N x 768 float32 with unit-length rows. Search embeds query images through this too."""
        inputs = self.processor(images=images, return_tensors="pt").to(self.device)
        with torch.inference_mode():
            out = self.model(**inputs).pooler_output
        return torch.nn.functional.normalize(out, dim=-1).cpu().numpy()

    def process(self, frames: list[Frame]) -> list[Result]:
        vectors = self.embed([f.image for f in frames])
        return [Result(frame_idx=f.idx, vector=v) for f, v in zip(frames, vectors)]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `uv run pytest tests/modules/test_image_embed.py -v`
Expected: 8 tests PASS (3 plain tests plus 5 parametrized cases). The first run downloads about 346 MB to `~/.cache/huggingface`.

If `test_query_alone_matches_batched` fails by a small margin (max abs diff between 1e-4 and 1e-3), that is MPS float noise between batch sizes. Report the measured difference before loosening `atol`. Do not loosen it beyond `1e-3`.

- [ ] **Step 5: Run the whole suite**

Run: `uv run pytest`
Expected: all tests PASS, pipeline and module.

- [ ] **Step 6: Commit**

```bash
git add snapsort/modules/image_embed.py tests/modules/test_image_embed.py
git commit -m "Add image_embed module: DINOv2-base frame embeddings"
```

- [ ] **Step 7: End-to-end check (only if the runner and CLI exist)**

Run: `test -f snapsort/cli.py && uv run snapsort ingest <a folder of photos> --modules image_embed`
Expected: one status line per file ending `image_embed:done`, exit code 0. If `snapsort/cli.py` does not exist yet, skip this step and say so in the handoff.
