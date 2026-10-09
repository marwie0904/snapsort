"""SigLIP 2 base embeddings for text ↔ image search."""
import numpy as np
import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor

from snapsort.contract import Frame, Module, Result

MODEL = "google/siglip2-base-patch16-224"
# SigLIP's recommended prompt. Short queries ("motorcycle") score 3-5x higher match probabilities with it.
TEMPLATE = "this is a photo of {}."


class ClipEmbed(Module):
    name = "clip_embed"
    version = "2"

    def setup(self) -> None:
        self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.processor = AutoProcessor.from_pretrained(MODEL)
        self.model = AutoModel.from_pretrained(MODEL).to(self.device).eval()

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        """N x D float32 with unit-length rows."""
        inputs = self.processor(images=images, return_tensors="pt").to(self.device)
        with torch.inference_mode():
            out = self.model.get_image_features(**inputs).pooler_output
        return torch.nn.functional.normalize(out, dim=-1).cpu().numpy()

    def embed_text(self, texts: list[str]) -> np.ndarray:
        """N x D float32 with unit-length rows. Same space as embed_images. Each text is lowercased
        and wrapped in TEMPLATE, matching how SigLIP 2 was trained."""
        inputs = self.processor(text=[TEMPLATE.format(t.lower()) for t in texts],
                                padding="max_length", max_length=64, return_tensors="pt").to(self.device)
        with torch.inference_mode():
            out = self.model.get_text_features(**inputs).pooler_output
        return torch.nn.functional.normalize(out, dim=-1).cpu().numpy()

    def match_probability(self, similarity: np.ndarray) -> np.ndarray:
        """Cosine similarity -> SigLIP's sigmoid probability (0-1) that text and image match."""
        logits = similarity * self.model.logit_scale.exp().item() + self.model.logit_bias.item()
        return 1 / (1 + np.exp(-logits))

    def process(self, frames: list[Frame]) -> list[Result]:
        vectors = self.embed_images([f.image for f in frames])
        return [Result(frame_idx=f.idx, vector=v) for f, v in zip(frames, vectors)]
