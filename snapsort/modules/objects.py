"""Object detection with Ultralytics YOLO11m."""
from pathlib import Path

from ultralytics import YOLO

from snapsort.contract import Frame, Module, Result

MODEL = "yolo11m.pt"
CACHE = Path.home() / ".cache" / "snapsort"


class Objects(Module):
    name = "objects"
    version = "2"

    def setup(self) -> None:
        CACHE.mkdir(parents=True, exist_ok=True)
        # Ultralytics writes the weight file next to the given path on first download.
        self.model = YOLO(str(CACHE / MODEL))

    def process(self, frames: list[Frame]) -> list[Result]:
        results = []
        for f in frames:
            w, h = f.image.size
            pred = self.model.predict(f.image, verbose=False)[0]
            names = pred.names
            if pred.boxes is None:
                continue
            for box in pred.boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls_id = int(box.cls.item())
                conf = float(box.conf.item())
                nx = max(0.0, min(1.0, x1 / w))
                ny = max(0.0, min(1.0, y1 / h))
                nw = max(0.0, min(1.0, (x2 - x1) / w))
                nh = max(0.0, min(1.0, (y2 - y1) / h))
                results.append(Result(
                    frame_idx=f.idx,
                    label=names[cls_id],
                    score=conf,
                    bbox=(nx, ny, nw, nh),
                ))
        return results
