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
