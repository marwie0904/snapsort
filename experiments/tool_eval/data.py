"""Simulated library, the search_library tool and test queries for the tool-calling eval.

The tool mirrors search() on branch worktree-filters (person, place, mediaKind, similar, combine, scope, sort)
plus the agreed capture-date filter. Negation, objects and text search are not in the tool, so those
queries expect no call.

`expect` in each query was worked out by hand from MEDIA. Running this file checks that executing the
`gold` arguments gives the same ids.
"""
TODAY = "2026-10-10"  # a Saturday

PEOPLE = ["Anna", "Ben", "Chloe", "David"]
TOKYO, KYOTO = "tokyo, japan", "kyoto, japan"
MANILA = "manila, metro manila, philippines"
CEBU = "cebu city, central visayas, philippines"
SF = "san francisco, california, united states"
PLACES = [TOKYO, KYOTO, MANILA, CEBU, SF]  # location labels as ingest stores them: lowercased

# id, kind, taken (capture date or None), place (or None), people (image: one list; video: one list per frame), look
# `look` stands in for image_embed: files with the same look score above MIN_SCORE against each other.
MEDIA = [
    ("m01", "image", "2025-12-20", TOKYO, ["Anna"], "street"),
    ("m02", "image", "2025-12-20", TOKYO, ["Anna", "Ben"], "street"),
    ("m03", "video", "2025-12-21", TOKYO, [["Anna"], ["Anna"], [], ["Ben"], ["Ben"]], "night"),
    ("m04", "image", "2025-12-22", KYOTO, ["Ben"], "temple"),
    ("m05", "video", "2025-12-22", KYOTO, [["Anna", "Ben"], ["Anna", "Ben"], ["Ben"]], "temple"),
    ("m06", "image", "2025-12-23", KYOTO, [], "temple"),
    ("m07", "image", "2026-01-05", MANILA, ["Chloe"], "home"),
    ("m08", "image", "2026-01-05", MANILA, ["Chloe", "David"], "home"),
    ("m09", "video", "2026-02-14", MANILA, [["David"], ["David", "Chloe"], ["Chloe"]], "dinner"),
    ("m10", "image", "2026-02-14", MANILA, ["David", "Chloe"], "dinner"),
    ("m11", "image", "2026-03-08", MANILA, ["Anna", "Chloe"], "party"),
    ("m12", "video", "2026-03-08", MANILA, [["Anna"], ["Anna", "Chloe"], ["Chloe"], []], "party"),
    ("m13", "image", "2026-06-15", CEBU, ["Ben"], "beach"),
    ("m14", "image", "2026-06-15", CEBU, ["Ben", "David"], "beach"),
    ("m15", "video", "2026-06-16", CEBU, [["Ben"], [], ["David"]], "beach"),
    ("m16", "image", "2026-07-02", CEBU, ["Anna"], "beach"),
    ("m17", "image", "2026-07-02", CEBU, [], "beach"),
    ("m18", "video", "2026-08-20", CEBU, [["Chloe"], ["Chloe", "Anna"], ["Anna"]], "beach"),
    ("m19", "image", "2026-09-10", SF, ["David"], "city"),
    ("m20", "image", "2026-09-11", SF, ["David", "Ben"], "city"),
    ("m21", "video", "2026-09-12", SF, [["David"], ["David"], ["Ben", "David"]], "city"),
    ("m22", "image", "2026-10-03", None, ["Anna"], "selfie"),
    ("m23", "image", "2026-10-06", None, ["Anna"], "selfie"),
    ("m24", "video", "2026-10-08", None, [["Ben"], ["Ben"]], "office"),
    ("m25", "image", None, None, [], "screenshot"),
    ("m26", "image", None, None, [], "screenshot"),
    ("m27", "image", "2025-07-04", SF, ["Chloe"], "city"),
    ("m28", "video", "2025-08-15", CEBU, [["Chloe"], ["Chloe", "David"]], "beach"),
    ("m29", "image", "2025-11-30", MANILA, ["Anna", "Ben", "Chloe", "David"], "party"),
    ("m30", "image", "2024-12-25", MANILA, ["Anna", "Ben", "Chloe", "David"], "party"),
]
BY_ID = {m[0]: m for m in MEDIA}

_DATE = "Capture date, YYYY-MM-DD, inclusive."
TOOLS = [{"type": "function", "function": {
    "name": "search_library",
    "description": "Search the photo and video library. Filters combine with AND unless any_filter is true.",
    "parameters": {"type": "object", "properties": {
        "people": {"type": "array", "items": {"type": "string", "enum": PEOPLE},
                   "description": "People who appear in the file."},
        "people_match": {"type": "string", "enum": ["all", "any"],
                         "description": "all: every listed person appears. any: at least one does."},
        "same_frame": {"type": "boolean",
                       "description": "The people must be in the same shot, not just the same file."},
        "place": {"type": "string", "enum": PLACES, "description": "Where it was taken."},
        "kind": {"type": "string", "enum": ["image", "video"],
                 "description": "Only when the user asks for videos, or for photos only."},
        "date_from": {"type": "string", "description": _DATE},
        "date_to": {"type": "string", "description": _DATE},
        "similar_to_open": {"type": "boolean", "description": "Files that look like the one open in the viewer."},
        "any_filter": {"type": "boolean", "description": "Match files that pass ANY filter instead of all."},
        "sort": {"type": "string", "enum": ["newest", "oldest", "name", "similarity"],
                 "description": "Only when the user asks for an order. newest/oldest = date added."},
    }}}}]


def system(open_item=None):
    return (f"You search the user's local photo and video library. Today is {TODAY} (Saturday). "
            f"Open in the viewer: {open_item or 'nothing'}. "
            "Call search_library once with every filter the request needs. Do not call it if the message is not "
            "a search, or if it needs something the tool cannot do: excluding people or places, objects, "
            "descriptions such as colors or scenes, or people not in the list.")


def _people(m):
    frames = m[4] if m[1] == "video" else [m[4]]
    return [{p.lower() for p in f} for f in frames]


def _truthy(v):
    return v in (True, "true", "True")


def execute(args):
    """Files the search returns, following search() on worktree-filters. None = the tool was not called."""
    if args is None:
        return None
    filters = []
    people = args.get("people") or []
    people = [people] if isinstance(people, str) else people
    if people:
        want = {p.strip().lower() for p in people}
        any_, frame = args.get("people_match") == "any", _truthy(args.get("same_frame"))
        def person(m):
            frames = _people(m)
            if any_:
                return any(want & f for f in frames)
            if frame:
                return any(want <= f for f in frames)
            return want <= set().union(*frames)
        filters.append(person)
    if args.get("place"):
        filters.append(lambda m: m[3] == str(args["place"]).strip().lower())
    if args.get("kind"):
        filters.append(lambda m: m[1] == args["kind"])
    if args.get("date_from") or args.get("date_to"):
        lo, hi = args.get("date_from") or "0000", args.get("date_to") or "9999"
        filters.append(lambda m: m[2] is not None and lo <= m[2] <= hi)
    if _truthy(args.get("similar_to_open")):
        look = BY_ID[args["_open"]][5] if args.get("_open") else None
        filters.append(lambda m: m[5] == look)
    if not filters:
        return {m[0] for m in MEDIA}
    combine = any if _truthy(args.get("any_filter")) else all
    return {m[0] for m in MEDIA if combine(f(m) for f in filters)}


def effective_sort(args):
    if args is None:
        return None
    return args.get("sort") or ("similarity" if _truthy(args.get("similar_to_open")) else "newest")


A, B, C, D = PEOPLE
# id, category, query, open item, gold args (None = no call), expected ids, expected sort (None = any)
QUERIES = [
    ("q01", "basic", "Show me Anna", None, {"people": [A]}, "m01 m02 m03 m05 m11 m12 m16 m18 m22 m23 m29 m30", None),
    ("q02", "basic", "Everything from Tokyo", None, {"place": TOKYO}, "m01 m02 m03", None),
    ("q03", "basic", "All my videos", None, {"kind": "video"}, "m03 m05 m09 m12 m15 m18 m21 m24 m28", None),
    ("q04", "basic", "What do I have from Cebu?", None, {"place": CEBU}, "m13 m14 m15 m16 m17 m18 m28", None),
    ("q05", "basic", "Find David", None, {"people": [D]}, "m08 m09 m10 m14 m15 m19 m20 m21 m28 m29 m30", None),
    ("q06", "basic", "San Francisco trip", None, {"place": SF}, "m19 m20 m21 m27", None),
    ("q07", "basic", "Stuff from Kyoto", None, {"place": KYOTO}, "m04 m05 m06", None),
    ("q08", "basic", "Anything taken in Manila", None, {"place": MANILA}, "m07 m08 m09 m10 m11 m12 m29 m30", None),
    ("q09", "combo", "Anna in Tokyo", None, {"people": [A], "place": TOKYO}, "m01 m02 m03", None),
    ("q10", "combo", "Videos of Chloe", None, {"people": [C], "kind": "video"}, "m09 m12 m18 m28", None),
    ("q11", "combo", "Ben in Cebu", None, {"people": [B], "place": CEBU}, "m13 m14 m15", None),
    ("q12", "combo", "David in San Francisco, photos only", None,
     {"people": [D], "place": SF, "kind": "image"}, "m19 m20", None),
    ("q13", "combo", "Kyoto videos", None, {"place": KYOTO, "kind": "video"}, "m05", None),
    ("q14", "people", "Anna and Ben", None, {"people": [A, B]}, "m02 m03 m05 m29 m30", None),
    ("q15", "people", "Anna and Ben together in the same shot", None,
     {"people": [A, B], "same_frame": True}, "m02 m05 m29 m30", None),
    ("q16", "people", "Anna or Ben", None, {"people": [A, B], "people_match": "any"},
     "m01 m02 m03 m04 m05 m11 m12 m13 m14 m15 m16 m18 m20 m21 m22 m23 m24 m29 m30", None),
    ("q17", "people", "Chloe and David", None, {"people": [C, D]}, "m08 m09 m10 m28 m29 m30", None),
    ("q18", "people", "Ben and David in the same frame", None,
     {"people": [B, D], "same_frame": True}, "m14 m20 m21 m29 m30", None),
    ("q19", "people", "Anna, Ben, Chloe and David all together", None, {"people": [A, B, C, D]}, "m29 m30", None),
    ("q20", "or", "Everything in Kyoto or with Chloe", None, {"place": KYOTO, "people": [C], "any_filter": True},
     "m04 m05 m06 m07 m08 m09 m10 m11 m12 m18 m27 m28 m29 m30", None),
    ("q21", "or", "Videos, or anything from San Francisco", None, {"kind": "video", "place": SF, "any_filter": True},
     "m03 m05 m09 m12 m15 m18 m19 m20 m21 m24 m27 m28", None),
    ("q22", "date", "What did I take in December 2025?", None,
     {"date_from": "2025-12-01", "date_to": "2025-12-31"}, "m01 m02 m03 m04 m05 m06", None),
    ("q23", "date", "This past summer", None,
     {"date_from": "2026-06-01", "date_to": "2026-08-31"}, "m13 m14 m15 m16 m17 m18", None),
    ("q24", "date", "Anything from 2025", None,
     {"date_from": "2025-01-01", "date_to": "2025-12-31"}, "m01 m02 m03 m04 m05 m06 m27 m28 m29", None),
    ("q25", "date", "This week", None, {"date_from": "2026-10-05", "date_to": "2026-10-10"}, "m23 m24", None),
    ("q26", "date", "Last month", None, {"date_from": "2026-09-01", "date_to": "2026-09-30"}, "m19 m20 m21", None),
    ("q27", "date", "Christmas 2024", None, {"date_from": "2024-12-25", "date_to": "2024-12-25"}, "m30", None),
    ("q28", "date", "Between January and March 2026", None,
     {"date_from": "2026-01-01", "date_to": "2026-03-31"}, "m07 m08 m09 m10 m11 m12", None),
    ("q29", "date+", "Anna this year", None, {"people": [A], "date_from": "2026-01-01", "date_to": "2026-12-31"},
     "m11 m12 m16 m18 m22 m23", None),
    ("q30", "date+", "Videos from this past summer", None,
     {"kind": "video", "date_from": "2026-06-01", "date_to": "2026-08-31"}, "m15 m18", None),
    ("q31", "date+", "Chloe in Cebu in 2025", None,
     {"people": [C], "place": CEBU, "date_from": "2025-01-01", "date_to": "2025-12-31"}, "m28", None),
    ("q32", "date+", "Ben and David in San Francisco last month", None,
     {"people": [B, D], "place": SF, "date_from": "2026-09-01", "date_to": "2026-09-30"}, "m20 m21", None),
    ("q33", "similar", "More like this one", "m04", {"similar_to_open": True}, "m04 m05 m06", None),
    ("q34", "similar", "Find similar ones with Anna in them", "m13",
     {"similar_to_open": True, "people": [A]}, "m16 m18", None),
    ("q35", "similar", "Similar videos", "m19", {"similar_to_open": True, "kind": "video"}, "m21", None),
    ("q36", "similar", "Show me ones that look like this", "m22", {"similar_to_open": True}, "m22 m23", None),
    ("q37", "sort", "Oldest videos first", None, {"kind": "video", "sort": "oldest"},
     "m03 m05 m09 m12 m15 m18 m21 m24 m28", "oldest"),
    ("q38", "sort", "Newest stuff with David", None, {"people": [D], "sort": "newest"},
     "m08 m09 m10 m14 m15 m19 m20 m21 m28 m29 m30", "newest"),
    ("q39", "sort", "Kyoto, sorted by file name", None, {"place": KYOTO, "sort": "name"}, "m04 m05 m06", "name"),
    ("q40", "no_call", "Tokyo without Anna", None, None, None, None),
    ("q41", "no_call", "Show me pictures of my dog", None, None, None, None),
    ("q42", "no_call", "Sunset photos", None, None, None, None),
    ("q43", "no_call", "Show me Emma", None, None, None, None),
    ("q44", "no_call", "Hi, what can you do?", None, None, None, None),
    ("q45", "no_call", "Thanks!", None, None, None, None),
]


def gold_result(q):
    _qid, _cat, _text, open_item, gold, _exp, _sort = q
    return execute(None if gold is None else {**gold, "_open": open_item})


if __name__ == "__main__":
    bad = []
    for q in QUERIES:
        exp = None if q[5] is None else set(q[5].split())
        if gold_result(q) != exp or (q[6] and effective_sort(q[4]) != q[6]):
            bad.append((q[0], gold_result(q), exp))
    assert not bad, bad
    print(f"ok: {len(QUERIES)} hand-computed answers match the gold arguments")
