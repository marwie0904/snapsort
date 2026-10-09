"""Template module. Copy this file to start a new one.

Labels each frame with its dominant color channel and stores the mean RGB as a 3-dim vector.
"""
import numpy as np

from snapsort.contract import Frame, Module, Result

CHANNELS = ("red", "green", "blue")


class Example(Module):
    name = "example"
    version = "1"

    def setup(self) -> None:
        pass  # load models here

    def process(self, frames: list[Frame]) -> list[Result]:
        results = []
        for f in frames:
            mean = np.asarray(f.image, dtype=np.float32).reshape(-1, 3).mean(axis=0) / 255
            results.append(Result(f.idx, label=CHANNELS[int(mean.argmax())], score=1.0, vector=mean))
        return results
