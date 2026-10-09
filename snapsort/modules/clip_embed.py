"""CLIP ViT-B/32 embeddings for text ↔ image search."""
import numpy as np
from PIL import Image
from sentence_transformers import SentenceTransformer

from snapsort.contract import Frame, Module, Result

MODEL = "clip-ViT-B-32"


class ClipEmbed(Module):
    name = "clip_embed"
    version = "1"

    def setup(self) -> None:
        self.model = SentenceTransformer(MODEL)

    def embed_images(self, images: list[Image.Image]) -> np.ndarray:
        """N x D float32 with unit-length rows."""
        vectors = self.model.encode(images, convert_to_numpy=True, normalize_embeddings=True)
        return np.asarray(vectors, dtype=np.float32)

    def embed_text(self, texts: list[str]) -> np.ndarray:
        """N x D float32 with unit-length rows. Same space as embed_images."""
        vectors = self.model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
        return np.asarray(vectors, dtype=np.float32)

    def process(self, frames: list[Frame]) -> list[Result]:
        vectors = self.embed_images([f.image for f in frames])
        return [Result(frame_idx=f.idx, vector=v) for f, v in zip(frames, vectors)]
