"""Search tests. Rows go straight into a temp database, so no model runs."""
import itertools
import re

import pytest

from snapsort.ingest import connect
from snapsort.search import QueryError, Segment, open_db, search, segments

_names = itertools.count()


@pytest.fixture
def db(data_dir):
    data_dir.mkdir()
    conn = open_db(data_dir)
    yield conn
    conn.close()


def media(conn, kind, frames=1, name=None, added_at="2026-10-09 10:00:00") -> tuple[int, list[int]]:
    """One file with `frames` frames at ts 0, 1, 2... (ts None for an image). Returns (media id, frame ids)."""
    with conn:
        mid = conn.execute("INSERT INTO media (path, kind, added_at) VALUES (?, ?, ?)",
                           (f"/lib/{name or next(_names)}", kind, added_at)).lastrowid
        fids = [conn.execute("INSERT INTO frames (media_id, idx, ts, path) VALUES (?, ?, ?, '/f.jpg')",
                             (mid, i, None if kind == "image" else float(i))).lastrowid for i in range(frames)]
    return mid, fids


def add_faces(conn, person_id, frame_ids):
    """One face of the person in each frame."""
    with conn:
        for fid in frame_ids:
            rid = conn.execute("INSERT INTO results (frame_id, module, label) VALUES (?, 'faces', 'face')",
                               (fid,)).lastrowid
            conn.execute("INSERT INTO person_faces (result_id, person_id, score) VALUES (?, ?, 1.0)",
                         (rid, person_id))


def person(conn, frame_ids) -> int:
    """A new person with one face in each frame. Returns the person id."""
    with conn:
        pid = conn.execute("INSERT INTO persons DEFAULT VALUES").lastrowid
    add_faces(conn, pid, frame_ids)
    return pid


def place(conn, frame_id, label):
    """A location result as ingest stores it: label already lowercased, or None."""
    with conn:
        conn.execute("INSERT INTO results (frame_id, module, label) VALUES (?, 'location', ?)", (frame_id, label))


def ts_of(hit):
    return [t for t, _ in hit.matches]


def test_no_filters_returns_every_file(db):
    a, _ = media(db, "image")
    b, _ = media(db, "video", frames=3)
    hits = search(db, [])
    assert {h.media_id for h in hits} == {a, b}
    video = next(h for h in hits if h.media_id == b)
    assert ts_of(video) == [0.0, 1.0, 2.0] and video.score is None


def test_empty_library_returns_nothing(db):
    assert search(db, []) == []


def test_person_all_needs_the_same_frame(db):
    _, f = media(db, "video", frames=6)
    anna, ben = person(db, [f[1]]), person(db, [f[5]])
    assert search(db, [{"kind": "person", "ids": [anna, ben], "match": "all"}]) == []
    [hit] = search(db, [{"kind": "person", "ids": [anna, ben], "match": "any"}])
    assert ts_of(hit) == [1.0, 5.0]


def test_person_all_keeps_shared_frames(db):
    _, f = media(db, "video", frames=4)
    anna, ben = person(db, [f[1], f[2]]), person(db, [f[2], f[3]])
    [hit] = search(db, [{"kind": "person", "ids": [anna, ben], "match": "all"}])
    assert ts_of(hit) == [2.0]


def test_place_covers_every_frame_and_ignores_case(db):
    mid, f = media(db, "video", frames=3)
    media(db, "image")  # no location
    place(db, f[0], "são paulo, brazil")
    [hit] = search(db, [{"kind": "place", "name": "  São Paulo, Brazil "}])
    assert hit.media_id == mid and ts_of(hit) == [0.0, 1.0, 2.0]


def test_place_and_person_keep_only_the_persons_frames(db):
    mid, f = media(db, "video", frames=5)
    place(db, f[0], "tokyo, japan")
    anna = person(db, [f[3], f[4]])
    _, g = media(db, "video", frames=2)
    add_faces(db, anna, g)  # anna in another video, not in tokyo
    [hit] = search(db, [{"kind": "place", "name": "tokyo, japan"},
                        {"kind": "person", "ids": [anna], "match": "all"}])
    assert hit.media_id == mid and ts_of(hit) == [3.0, 4.0]


def test_media_kind(db):
    a, _ = media(db, "image")
    b, _ = media(db, "video", frames=2)
    assert [h.media_id for h in search(db, [{"kind": "mediaKind", "value": "image"}])] == [a]
    assert [h.media_id for h in search(db, [{"kind": "mediaKind", "value": "video"}])] == [b]


def test_image_hit_has_no_timeline(db):
    _, f = media(db, "image")
    person(db, f)
    [hit] = search(db, [])
    assert (hit.matches, hit.segments, hit.best_ts, hit.score) == ([], [], None, None)


def test_video_segments_and_best_ts_without_scores(db):
    _, f = media(db, "video", frames=11)
    anna = person(db, [f[i] for i in (1, 2, 3, 5, 6, 10)])
    [hit] = search(db, [{"kind": "person", "ids": [anna], "match": "all"}])
    assert hit.segments == [Segment(1.0, 6.0, None), Segment(10.0, 10.0, None)]
    assert hit.best_ts == 1.0


def test_segments_bridge_one_missed_frame():
    m = [(1.0, 0.5), (2.0, 0.9), (3.0, 0.6), (5.0, None), (6.0, 0.7), (10.0, 0.8)]
    assert segments(m) == [Segment(1.0, 6.0, 0.9), Segment(10.0, 10.0, 0.8)]
    assert segments(m, gap=1.0) == [Segment(1.0, 3.0, 0.9), Segment(5.0, 6.0, 0.7), Segment(10.0, 10.0, 0.8)]
    assert segments([(0.0, None), (3.0, None)]) == [Segment(0.0, 0.0, None), Segment(3.0, 3.0, None)]
    assert segments([]) == []


def test_sorts_and_limit(db):
    old, _ = media(db, "image", name="b.jpg", added_at="2026-10-01 09:00:00")
    new, _ = media(db, "image", name="a.jpg", added_at="2026-10-09 09:00:00")
    tie, _ = media(db, "image", name="C.jpg", added_at="2026-10-09 09:00:00")

    def ids(**kw):
        return [h.media_id for h in search(db, [], **kw)]

    assert ids() == [tie, new, old]  # newest by default; same second: the later insert first
    assert ids(sort="oldest") == [old, new, tie]
    assert ids(sort="name") == [new, old, tie]  # a, b, C ignoring case
    assert ids(limit=2) == [tie, new]


@pytest.mark.parametrize("filters, message", [
    ([{"kind": "person", "ids": [], "match": "all"}], "at least one id"),
    ([{"kind": "person", "ids": [999], "match": "all"}], "unknown person id(s): 999. see snapsort people"),
    ([{"kind": "person", "ids": ["1"], "match": "all"}], "person ids must be integers"),
    ([{"kind": "person", "ids": [1], "match": "some"}], "person match must be all or any"),
    ([{"kind": "place", "name": "atlantis"}], "no media at place 'atlantis'. see snapsort places"),
    ([{"kind": "mediaKind", "value": "gif"}], "mediaKind must be image or video"),
    ([{"kind": "label", "module": "objects", "labelId": "dog"}], "unsupported filter kind: 'label'"),
    ([{"kind": "folder", "id": 1}], "unsupported filter kind: 'folder'"),
])
def test_filter_errors(db, filters, message):
    _, f = media(db, "image")
    person(db, f)  # person 1 exists
    with pytest.raises(QueryError, match=re.escape(message)):
        search(db, filters)


@pytest.mark.parametrize("kwargs, message", [
    ({"sort": "similarity"}, "sort by similarity needs a similar image"),
    ({"sort": "size"}, "unknown sort 'size'"),
    ({"limit": 0}, "limit must be at least 1"),
])
def test_option_errors(db, kwargs, message):
    with pytest.raises(QueryError, match=re.escape(message)):
        search(db, [], **kwargs)


def test_library_never_grouped_reports_unknown_person(data_dir):
    data_dir.mkdir()
    connect(data_dir / "snapsort.db").close()  # ingest's tables only, no persons table
    conn = open_db(data_dir)
    try:
        with pytest.raises(QueryError, match="unknown person id"):
            search(conn, [{"kind": "person", "ids": [1], "match": "all"}])
    finally:
        conn.close()
