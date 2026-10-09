"""Search tests. Rows go straight into a temp database, so no model runs."""
import itertools
import json
import re

import numpy as np
import pytest

import snapsort.cli as cli
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


def unit(v):
    return v / np.linalg.norm(v)


def near(base, cos, rng):
    """A unit vector at exactly `cos` to the unit vector `base`."""
    u = rng.normal(size=base.size)
    u -= (u @ base) * base
    return cos * base + np.sqrt(1 - cos ** 2) * unit(u)


def embed(conn, frame_id, v):
    with conn:
        conn.execute("INSERT INTO results (frame_id, module, vector) VALUES (?, 'image_embed', ?)",
                     (frame_id, np.asarray(v, "<f4").tobytes()))


@pytest.fixture
def q():
    return unit(np.random.default_rng(0).normal(size=64))


@pytest.fixture
def rng():
    return np.random.default_rng(1)


def test_similar_media_cuts_and_ranks(db, q, rng):
    query, [fq] = media(db, "image")
    close, [fc] = media(db, "image")
    far, [ff] = media(db, "image")
    embed(db, fq, q)
    embed(db, fc, near(q, 0.8, rng))
    embed(db, ff, near(q, 0.1, rng))
    hits = search(db, [], {"mediaId": query}, min_score=0.5)
    assert [h.media_id for h in hits] == [query, close]  # similarity is the default sort
    assert [h.score for h in hits] == pytest.approx([1.0, 0.8], abs=1e-5)


def test_similar_scores_video_frames(db, q, rng):
    query, [fq] = media(db, "image")
    embed(db, fq, q)
    vid, f = media(db, "video", frames=4)
    for fid, cos in zip(f, (0.9, 0.2, 0.7, 0.3)):
        embed(db, fid, near(q, cos, rng))
    hit = next(h for h in search(db, [], {"mediaId": query}, min_score=0.5) if h.media_id == vid)
    assert ts_of(hit) == [0.0, 2.0]
    assert hit.score == pytest.approx(0.9, abs=1e-5) and hit.best_ts == 0.0
    assert [(s.start, s.end) for s in hit.segments] == [(0.0, 2.0)]  # a 2 s step is bridged


def test_similar_media_ts_picks_the_nearest_frame(db, rng):
    vid, f = media(db, "video", frames=3)
    for fid in f:
        embed(db, fid, unit(rng.normal(size=64)))
    [hit] = search(db, [], {"mediaId": vid, "ts": 2.2}, min_score=0.99)
    assert ts_of(hit) == [2.0]
    [hit] = search(db, [], {"mediaId": vid}, min_score=0.99)
    assert ts_of(hit) == [0.0]  # no ts: frame 0


def test_similar_skips_frames_without_a_vector(db, q):
    query, [fq] = media(db, "image")
    embed(db, fq, q)
    media(db, "image")  # never embedded
    assert [h.media_id for h in search(db, [], {"mediaId": query}, min_score=0.0)] == [query]


def test_similar_stacks_with_person(db, q, rng):
    query, [fq] = media(db, "image")
    embed(db, fq, q)
    vid, f = media(db, "video", frames=2)
    embed(db, f[0], near(q, 0.9, rng))
    embed(db, f[1], near(q, 0.8, rng))
    anna = person(db, [f[1]])
    [hit] = search(db, [{"kind": "person", "ids": [anna], "match": "all"}], {"mediaId": query}, min_score=0.5)
    assert hit.media_id == vid and ts_of(hit) == [1.0]


def test_similar_errors(db, tmp_path):
    no_vector, _ = media(db, "image")
    not_image = tmp_path / "notes.txt"
    not_image.write_text("hello")
    cases = [
        ({"mediaId": 999}, "unknown media id 999"),
        ({"mediaId": no_vector}, f"media {no_vector} has no image_embed vectors. run snapsort ingest --modules image_embed"),
        ({"path": str(tmp_path / "missing.jpg")}, "cannot read query image"),
        ({"path": str(not_image)}, "cannot read query image"),
        ({"imageRef": "abc"}, "similar needs mediaId or path"),
    ]
    for similar, message in cases:
        with pytest.raises(QueryError, match=re.escape(message)):
            search(db, [], similar)


@pytest.fixture
def run(tmp_path, monkeypatch, capsys):
    """cli.main run in tmp_path, whose .snapsort is the db fixture's. Returns (exit code, stdout, stderr)."""
    monkeypatch.chdir(tmp_path)

    def go(*argv):
        code = cli.main(list(argv))
        out = capsys.readouterr()
        return code, out.out, out.err

    return go


def test_cli_search_prints_segments_and_count(db, run):
    _, f = media(db, "video", frames=11, name="clip.mov")
    media(db, "image", name="other.jpg")
    anna = person(db, [f[i] for i in (1, 2, 3, 5, 6, 10)])
    assert run("search", "--person", str(anna)) == (0, "/lib/clip.mov  video  0:01–0:06, 0:10\n1 of 2 files\n", "")


def test_cli_search_shows_scores_with_similar(db, run, q):
    query, [fq] = media(db, "image", name="q.jpg")
    embed(db, fq, q)
    assert run("search", "--similar-media", f"{query}@0", "--min-score", "0.5") == \
        (0, "/lib/q.jpg  image  1.00\n1 of 1 files\n", "")


def test_cli_search_json(db, run, q):
    query, [fq] = media(db, "image", name="q.jpg")
    embed(db, fq, q)
    code, out, _ = run("search", "--similar-media", str(query), "--json")
    assert code == 0
    assert json.loads(out) == [{"id": query, "kind": "image", "path": "/lib/q.jpg", "name": "q.jpg",
                                "addedAt": "2026-10-09 10:00:00", "score": pytest.approx(1.0, abs=1e-5),
                                "matches": [], "segments": [], "bestFrameTs": None}]


def test_cli_json_video_fields(db, run):
    _, f = media(db, "video", frames=3, name="v.mov")
    anna = person(db, [f[0], f[1]])
    code, out, _ = run("search", "--person", str(anna), "--json")
    [item] = json.loads(out)
    assert item["matches"] == [{"ts": 0.0, "score": None}, {"ts": 1.0, "score": None}]
    assert item["segments"] == [{"start": 0.0, "end": 1.0, "score": None}] and item["bestFrameTs"] == 0.0


def test_cli_no_matches_exits_0(db, run):
    media(db, "image")
    assert run("search", "--kind", "video") == (0, "0 of 1 files\n", "")
    assert run("search", "--kind", "video", "--json") == (0, "[]\n", "")


def test_cli_query_error_exits_2(db, run):
    code, out, err = run("search", "--person", "7")
    assert (code, out) == (2, "")
    assert "error: unknown person id(s): 7. see snapsort people" in err


def test_cli_bad_arguments_exit_2(db, run, capsys):
    cases = [
        (["search", "--person", "anna"], "expected comma-separated person ids, got 'anna'. see snapsort people"),
        (["search", "--similar-media", "x@1"], "expected ID or ID@SECONDS, got 'x@1'"),
        (["search", "--similar", "a.jpg", "--similar-media", "1"], "not allowed with argument"),
    ]
    for argv, message in cases:
        with pytest.raises(SystemExit) as e:
            run(*argv)
        assert e.value.code == 2
        assert message in capsys.readouterr().err


@pytest.mark.parametrize("cmd", ["search", "people", "places"])
def test_cli_without_database_exits_2(tmp_path, run, cmd):
    code, _, err = run(cmd)
    assert code == 2 and "no database" in err
    assert not (tmp_path / ".snapsort").exists()


def test_cli_people_and_places(db, run):
    _, f = media(db, "video", frames=3)
    _, g = media(db, "image")
    anna = person(db, [f[0], f[1]])
    add_faces(db, anna, g)
    ben = person(db, [f[2]])
    with db:
        db.execute("UPDATE persons SET name = 'Ben' WHERE id = ?", (ben,))
    place(db, f[0], "tokyo, japan")
    place(db, g[0], "tokyo, japan")
    _, h = media(db, "image")
    place(db, h[0], "kyoto, japan")
    _, k = media(db, "image")
    place(db, k[0], None)  # GPS without a place name
    assert run("people") == (0, f"{anna}\t\t3\t2\n{ben}\tBen\t1\t1\n", "")
    assert run("places") == (0, "tokyo, japan\t2\nkyoto, japan\t1\n", "")


def test_clock_format():
    assert cli._clock(5.0) == "0:05"
    assert cli._clock(65.0) == "1:05"
    assert cli._clock(3725.0) == "1:02:05"
    assert cli._span(Segment(10.0, 10.0, None)) == "0:10"
    assert cli._span(Segment(1.0, 6.0, None)) == "0:01–0:06"
