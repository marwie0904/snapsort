"""snapsort serve: ids route to the right drive, and the stdio protocol round-trips."""
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image

import snapsort.serve as serve
from snapsort.ingest import run_ingest
from snapsort.modules.metadata import Metadata

SNAPSORT = str(Path(sys.executable).parent / "snapsort")


def call(method, **params):
    reply = serve.handle({"id": 1, "method": method, "params": params})
    assert "error" not in reply, reply
    return reply["result"]


def drive(tmp_path, name, files) -> Path:
    """A fake drive at tmp_path/name with the files in trip/, ingested into name/snapsort."""
    root = tmp_path / name
    (root / "trip" / "day 2").mkdir(parents=True)
    for rel, color in files:
        Image.new("RGB", (40, 30), color).save(root / "trip" / rel)
    assert run_ingest([root / "trip"], [Metadata()], root / "snapsort")
    return root / "snapsort"


def test_two_drives(tmp_path, monkeypatch, sample_video):
    a = drive(tmp_path, "A", [("a.png", "red"), ("day 2/b.png", "blue")])
    b = drive(tmp_path, "B", [("c.png", "green")])
    sample_video.rename(tmp_path / "B" / "trip" / "clip.mp4")
    assert run_ingest([tmp_path / "B" / "trip"], [Metadata()], b)
    monkeypatch.setattr(serve, "mounted", lambda: [a, b])

    libs = call("listLibraries")
    assert [(lib["name"], [f["name"] for f in lib["folders"]]) for lib in libs] == [("A", ["trip"]), ("B", ["trip"])]
    trip_a = libs[0]["folders"][0]
    assert trip_a["count"] == 2 and [(c["name"], c["count"]) for c in trip_a["children"]] == [("day 2", 1)]

    page = call("query", search={"f": [], "sort": "name"}, limit=2)
    assert [i["name"] for i in page["items"]] == ["a.png", "b.png"]
    assert page["total"] == 4 and page["nextCursor"] == "2"
    rest = call("query", search={"f": [], "sort": "name"}, limit=2, cursor="2")
    assert [i["name"] for i in rest["items"]] == ["c.png", "clip.mp4"]
    video = rest["items"][1]
    assert video["durationS"] == 3 and video["bestFrameTs"] == 1.0  # middle of 3 frames

    for item in page["items"] + rest["items"]:
        detail = call("getMedia", id=item["id"])
        assert Path(detail["path"]).is_file() and detail["name"] == item["name"]
    assert call("getMedia", id=page["items"][0]["id"])["width"] == 40

    only = call("query", search={"f": [{"kind": "folder", "id": trip_a["children"][0]["id"]}]}, limit=10)
    assert [i["name"] for i in only["items"]] == ["b.png"]
    assert call("query", search={"f": [], "scope": "videos"}, limit=10)["total"] == 1
    assert call("getCounts")["all"] == 4

    assert call("resolveMedia", id=page["items"][0]["id"], kind="file") == str(tmp_path / "A" / "trip" / "a.png")


def test_stdio_round_trip_and_exit_on_eof(tmp_path):
    env = {**os.environ, "HOME": str(tmp_path)}  # no libraries: the internal one lives under HOME
    proc = subprocess.run([SNAPSORT, "serve"], input='{"id": 7, "method": "getCounts"}\nnot json\n'
                          '{"id": 8, "method": "nope"}\n', capture_output=True, text=True, env=env, timeout=60)
    assert proc.returncode == 0, proc.stderr
    replies = {r["id"]: r for r in map(json.loads, proc.stdout.splitlines())}
    assert replies[7]["result"]["all"] >= 0
    assert replies[8]["error"]["code"] == "NOT_FOUND"
    assert "not json" in proc.stderr
