"""snapsort chat: the model's tool arguments become a QueryPatch that replaces the whole search."""
from snapsort.chat import to_patch

PEOPLE = {"Mar Wie": 11, "Alex": 14}


def test_every_field_maps_to_a_filter():
    args = {"people": ["Mar Wie", "Alex"], "people_match": "any", "objects": "car", "place": "Binangonan",
            "kind": "video", "date_from": "2026-09-01", "sort": "oldest"}
    p = to_patch(args, PEOPLE, None, None)
    assert p["filters"] == {"clear": True, "add": [
        {"kind": "person", "ids": [11, 14], "match": "any", "source": "ai"},
        {"kind": "label", "module": "objects", "labelIds": ["car"], "match": "all", "source": "ai"},
        {"kind": "place", "name": "Binangonan", "source": "ai"},
        {"kind": "mediaKind", "value": "video", "source": "ai"},
        {"kind": "date", "from": "2026-09-01", "source": "ai"},
    ]}
    assert (p["q"], p["similarTo"], p["sort"]) == (None, None, "oldest")


def test_text_wins_over_similar_and_unknowns_drop():
    p = to_patch({"text": " sunset ", "similar_to_open": True, "people": ["Emma"], "sort": "best"}, PEOPLE, 7, 30.0)
    assert (p["q"], p["similarTo"], p["filters"]["add"], p["sort"]) == ("sunset", None, [], None)


def test_similar_needs_an_open_item():
    assert to_patch({"similar_to_open": True}, PEOPLE, None, None)["similarTo"] is None
    assert to_patch({"similar_to_open": True}, PEOPLE, 7, 30.0)["similarTo"] == {"mediaId": 7, "ts": 30.0, "source": "ai"}
