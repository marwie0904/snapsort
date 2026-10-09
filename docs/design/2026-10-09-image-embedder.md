# Image embedder module design

Date: 2026-10-09
Status: draft, pending review

## Goal

A module that turns every frame (images and 1 fps video frames) into one image embedding, stored by the ingest pipeline. A separate search module (later spec) uses these vectors for image → image search: upload a query image, find visually similar media.

## Scope

In: the `image_embed` module, its `embed()` method for search to reuse, its test file, its dependencies.

Out: search, text → image search, a query CLI, pinning the model revision, fp16, offline mode.

## Model

`facebook/dinov2-base` (DINOv2 ViT-B/14) via Hugging Face `transformers`, run with torch.

- Image-only model. It does not support text search. Text search needs a separate module with a text–image model (CLIP/SigLIP) later.
- 768-d vectors, which matches the pipeline spec's estimate of about 150 MB of RAM for 50k vectors.
- Apache-2.0, no Hugging Face login needed.
- Published instance-retrieval mAP ([DINOv2 paper](https://arxiv.org/pdf/2304.07193), Table 9): Oxford-Hard 49.5, Paris-Hard 78.6. DINOv2-small scores 43.2 and 68.5.
- Rejected alternatives: DINOv2-small (6–10 mAP lower, about 4× faster) and DINOv3-base (better quality, but gated: each developer must request access with personal details and log in to Hugging Face, and shipping requires the license copy plus a "Built with DINOv3" notice).
- Estimated speed on an M1 Pro (MPS, fp32): 20–35 ms per image, about 20–30 min per 50k frames. This is an estimate from FLOP counts. No published Apple Silicon benchmark exists.

## Module (`snapsort/modules/image_embed.py`)

```python
class ImageEmbed(Module):
    name = "image_embed"
    version = "1"

    def setup(self) -> None: ...
    def embed(self, images: list[Image.Image]) -> np.ndarray: ...
    def process(self, frames: list[Frame]) -> list[Result]: ...
```

- `setup()`: device is `mps` if available, else `cpu`. Load the `facebook/dinov2-base` image processor and model, and set the model to eval mode. The first run downloads about 346 MB to `~/.cache/huggingface`.
- `embed(images)`: run the processor with `size={"height": 224, "width": 224}` and `do_center_crop=False`, so each whole image is resized to 224×224 regardless of aspect ratio and nothing is cropped. Run the model under `torch.inference_mode()`, take `pooler_output` (the CLS token after the final layernorm), L2-normalize each row and return an N×768 float32 array.
- `process(frames)`: `embed([f.image for f in frames])`, then return one `Result(frame_idx=f.idx, vector=v)` per frame. Only `vector` is set, matching the "Embedding" row of the pipeline's result conventions.
- Every frame is embedded, including every video frame. Grouping matches by media is the search module's job.
- Changing the model, the preprocessing or the vector dimension requires a `version` bump, which re-embeds all media.

### Why squash instead of crop

The model's default preprocessing resizes the short side to 256 and center-crops 224×224. That drops the edges: a 4:3 photo keeps about 66% of its width and a 16:9 video frame about 49%. Squashing keeps the whole frame at the cost of a slight stretch.

### Use from search

```python
from snapsort.ingest import load_image

m = ImageEmbed()
m.setup()
q = m.embed([load_image(query_path)])[0]
# rank stored image_embed vectors by dot product with q (vectors are unit length, so dot = cosine)
```

Search goes through the same `load_image()` and `embed()` as ingest, so query and stored vectors share decoding and preprocessing. Opening the query with plain `Image.open` skips EXIF rotation (and cannot read HEIC): a rotated phone photo then scores about 0.86 against its own stored vector instead of 1.0.

## Errors

No module-specific handling. The pipeline runner already covers it:

- `setup()` fails (for example no network on the first download): module dropped for the run, retried on the next run.
- `process()` raises: error row in `runs` for that file, other modules continue.

## Dependencies

`uv add torch transformers`.

`transformers` sends a metadata request to huggingface.co each time it loads the model unless `HF_HUB_OFFLINE=1` is set. No image data is sent.

## Branching

Before implementation, rebase this branch onto `ingest-pipeline`, which already has `contract.py`, `validate()`, `load_image()` and the shared test fixtures. After the pipeline merges to `main`, rebase onto `main`. Only `pyproject.toml` and `uv.lock` can conflict. Resolve them by re-running `uv add torch transformers`.

This branch does not create or edit `snapsort/modules/__init__.py`, because the pipeline owns discovery there.

## Testing (`tests/modules/test_image_embed.py`)

Uses the shared `sample_frames` fixture (a solid red image followed by 3 frames of an ffmpeg `testsrc` video) and `validate` from `snapsort.ingest`. The model is loaded once per test module.

1. `setup()`, then `process(sample_frames)` passes `validate`, and gives one result per frame with the matching `frame_idx`. Each vector has 768 dimensions and unit norm. `label`, `score`, `bbox` and `data` are `None`.
2. Similarity: the first two video frames are closer to each other (dot product) than either is to the red image.

The first test run downloads the model.

When the runner and CLI land, also run `uv run snapsort ingest <path> --modules image_embed` by hand.
