from snapsort.modules.metadata import Metadata, _rate


def test_video_and_image_metadata(sample_frames, sample_image):
    [image, video] = Metadata().process(sample_frames)
    assert image.data == {"width": 64, "height": 48, "sizeBytes": sample_image.stat().st_size}
    assert video.frame_idx == 0
    assert {k: video.data[k] for k in ("width", "height", "durationS", "fps", "codec")} == \
        {"width": 320, "height": 240, "durationS": 3.0, "fps": 10.0, "codec": "h264"}


def test_rate_unknown_is_none():
    assert _rate("0/0") is None and _rate("30000/1001") == 29.97
