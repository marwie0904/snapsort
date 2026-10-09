"""Granite against the real search() and a real library.

The tool mirrors search() on main: person, label (objects), place, mediaKind and date filters, text query q,
similar image, combine, scope and sort. Enum values come from the library itself. Gold answers are run through
the same search(). Queries without text or similar are also recomputed independently from raw rows, which must
agree with search().

Usage, from the repo root (snapsort must be importable):
  uv run python experiments/tool_eval/real_eval.py <snapsort.db>   # a copy; it is opened read-only
"""
import json
import sqlite3
import subprocess
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

import snapsort.search as S

HERE = Path(__file__).parent
PORT = 8097
MODEL = "granite-4.0-h-350m-Q6_K.gguf"
TODAY = "2026-10-10"  # a Saturday
S.CACHE_MODELS = True  # load SigLIP once, as `snapsort serve` does

conn = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
PEOPLE = {n: i for i, n, *_ in S.list_people(conn) if n}  # named people only: unnamed can't be asked for
PLACES = [r[0] for r in conn.execute("SELECT DISTINCT label FROM results WHERE module='location' AND label IS NOT NULL")]
LABELS = [r[0] for r in conn.execute("SELECT label FROM results WHERE module='objects' GROUP BY label ORDER BY count(*) DESC")]
MP, BIN = "Mar Wie", PLACES[0]

TOOLS = [{"type": "function", "function": {
    "name": "search_library",
    "description": "Search the video and photo library. Filters combine with AND unless any_filter is true.",
    "parameters": {"type": "object", "properties": {
        "text": {"type": "string", "description": "Visual description to match: scenes, weather, colors, clothing, "
                 "activities. Not for people, places or anything in the objects list."},
        "people": {"type": "array", "items": {"type": "string", "enum": list(PEOPLE)}},
        "people_match": {"type": "string", "enum": ["all", "any"], "description": "all (default) or any listed person"},
        "objects": {"type": "array", "items": {"type": "string", "enum": LABELS}, "description": "Detected objects."},
        "objects_match": {"type": "string", "enum": ["all", "any"], "description": "all (default) or any listed object"},
        "same_frame": {"type": "boolean", "description": "People, objects and text must match in the same shot, "
                       "not just somewhere in the file."},
        "place": {"type": "string", "enum": PLACES},
        "kind": {"type": "string", "enum": ["image", "video"], "description": "Only when the user asks for one kind."},
        "date_from": {"type": "string", "description": "Capture date, YYYY-MM-DD, inclusive."},
        "date_to": {"type": "string", "description": "Capture date, YYYY-MM-DD, inclusive."},
        "similar_to_open": {"type": "boolean", "description": "Look like the item open in the viewer. Not with text."},
        "any_filter": {"type": "boolean", "description": "Match files passing ANY filter instead of all."},
        "sort": {"type": "string", "enum": list(S.SORTS), "description": "Only when the user asks for an order."},
    }}}}]


def system(open_item):
    shown = f"video {open_item[0]} at {int(open_item[1])}s" if open_item else "nothing"
    return (f"You search the user's local photo and video library. Today is {TODAY} (Saturday). "
            f"Open in the viewer: {shown}. Call search_library once with every filter the request needs. "
            "Do not call it if the message is not a search, or if it needs something the tool cannot do: "
            "excluding people, places or objects, or people not in the list.")


def to_search(args, open_item):
    """Tool arguments -> search() keyword arguments. Raises QueryError like the app would."""
    filters = []
    t = lambda k: args.get(k) in (True, "true")
    lst = lambda v: [v] if isinstance(v, str) else list(v or [])
    if args.get("people"):
        unknown = [p for p in lst(args["people"]) if p not in PEOPLE]
        if unknown:
            raise S.QueryError(f"unknown person {unknown}")
        filters.append({"kind": "person", "ids": [PEOPLE[p] for p in lst(args["people"])],
                        "match": args.get("people_match") or "all"})
    if args.get("objects"):
        filters.append({"kind": "label", "module": "objects", "labelIds": lst(args["objects"]),
                        "match": args.get("objects_match") or "all"})
    if args.get("place"):
        filters.append({"kind": "place", "name": args["place"]})
    if args.get("kind"):
        filters.append({"kind": "mediaKind", "value": args["kind"]})
    if args.get("date_from") or args.get("date_to"):
        filters.append({"kind": "date", "from": args.get("date_from") or None, "to": args.get("date_to") or None})
    similar = None
    if t("similar_to_open"):
        if not open_item:
            raise S.QueryError("nothing open to compare with")
        similar = {"mediaId": open_item[0], "ts": open_item[1]}
    return dict(filters=filters, similar=similar, q=(args.get("text") or None), sort=args.get("sort") or None,
                combine="any" if t("any_filter") else "all", scope="frame" if t("same_frame") else "file")


def run(args, open_item):
    """Matched media ids, or None when no call, or 'error: ...' when search() refuses the query."""
    if args is None:
        return None
    try:
        kw = to_search(args, open_item)
        return {h.media_id for h in S.search(conn, **kw)}, kw
    except (S.QueryError, TypeError, KeyError, ValueError) as e:
        return f"error: {e}", None


# id, category, query, open item (media id, ts), gold args (None = no call), expected sort (None = any)
Q = [
    ("p1", "people", "Show me Mar Wie", None, {"people": [MP]}, None),
    ("p2", "people", "Clips of Alex", None, {"people": ["Alex"]}, None),
    ("p3", "people", "Mar Wie and Alex", None, {"people": [MP, "Alex"]}, None),
    ("p4", "people", "Mar Wie and Alex on screen at the same time", None, {"people": [MP, "Alex"], "same_frame": True}, None),
    ("p5", "people", "Mar Wie or Alex", None, {"people": [MP, "Alex"], "people_match": "any"}, None),
    ("l1", "place", "Everything from Binangonan", None, {"place": BIN}, None),
    ("l2", "place", "Mar Wie in Binangonan", None, {"people": [MP], "place": BIN}, None),
    ("o1", "objects", "Videos with a dog", None, {"objects": ["dog"]}, None),
    ("o2", "objects", "Find the cat", None, {"objects": ["cat"]}, None),
    ("o3", "objects", "Clips with motorcycles", None, {"objects": ["motorcycle"]}, None),
    ("o4", "objects", "Show me bikes", None, {"objects": ["bicycle"]}, None),
    ("o5", "objects", "Where's the TV?", None, {"objects": ["tv"]}, None),
    ("o6", "objects", "Anything with plants", None, {"objects": ["potted plant"]}, None),
    ("o7", "objects", "A laptop and a phone", None, {"objects": ["laptop", "cell phone"]}, None),
    ("o8", "objects", "Laptop and phone in the same frame", None,
     {"objects": ["laptop", "cell phone"], "same_frame": True}, None),
    ("o9", "objects", "Cars or buses", None, {"objects": ["car", "bus"], "objects_match": "any"}, None),
    ("o10", "objects", "Mar Wie with a laptop", None, {"people": [MP], "objects": ["laptop"]}, None),
    ("o11", "objects", "Alex with a phone in the same shot", None,
     {"people": ["Alex"], "objects": ["cell phone"], "same_frame": True}, None),
    ("d1", "date", "What did I shoot in May?", None, {"date_from": "2026-05-01", "date_to": "2026-05-31"}, None),
    ("d2", "date", "Last month", None, {"date_from": "2026-09-01", "date_to": "2026-09-30"}, None),
    ("d3", "date", "September 26", None, {"date_from": "2026-09-26", "date_to": "2026-09-26"}, None),
    ("d4", "date", "Last week", None, {"date_from": "2026-09-28", "date_to": "2026-10-04"}, None),
    ("d5", "date", "Mar Wie in May 2026", None, {"people": [MP], "date_from": "2026-05-01", "date_to": "2026-05-31"}, None),
    ("d6", "date", "Motorcycles from last month", None,
     {"objects": ["motorcycle"], "date_from": "2026-09-01", "date_to": "2026-09-30"}, None),
    ("d7", "date", "Anything before June", None, {"date_to": "2026-05-31"}, None),
    ("t1", "text", "Sunset", None, {"text": "sunset"}, None),
    ("t2", "text", "Street at night", None, {"text": "street at night"}, None),
    ("t3", "text", "Someone wearing glasses", None, {"text": "person wearing glasses"}, None),
    ("t4", "text", "Mar Wie eating", None, {"people": [MP], "text": "eating"}, None),
    ("t5", "text", "Rainy weather", None, {"text": "rain"}, None),
    ("t6", "text", "Mar Wie outdoors in Binangonan", None, {"people": [MP], "place": BIN, "text": "outdoors"}, None),
    ("s1", "similar", "More like this", (7, 30.0), {"similar_to_open": True}, None),
    ("s2", "similar", "Similar clips with Mar Wie", (13, 100.0), {"similar_to_open": True, "people": [MP]}, None),
    ("s3", "similar", "Ones that look like this from last month", (4, 60.0),
     {"similar_to_open": True, "date_from": "2026-09-01", "date_to": "2026-09-30"}, None),
    ("r1", "or", "Anything in Binangonan or with Alex", None, {"place": BIN, "people": ["Alex"], "any_filter": True}, None),
    ("r2", "or", "Dogs or cats", None, {"objects": ["dog", "cat"], "objects_match": "any"}, None),
    ("x1", "sort", "Oldest clips first", None, {"sort": "oldest"}, "oldest"),
    ("x2", "sort", "Newest clips of Mar Wie", None, {"people": [MP], "sort": "newest"}, "newest"),
    ("x3", "sort", "Motorcycles, sorted by name", None, {"objects": ["motorcycle"], "sort": "name"}, "name"),
    ("n1", "no_call", "Binangonan without Mar Wie", None, None, None),
    ("n2", "no_call", "Show me Emma", None, None, None),
    ("n3", "no_call", "Delete the blurry ones", None, None, None),
    ("n4", "no_call", "Hi, what can you do?", None, None, None),
    ("n5", "no_call", "Thanks!", None, None, None),
]


def independent(args):
    """File-level answer from raw rows, without search(). Only for queries without text or similar."""
    frames = defaultdict(lambda: {"people": set(), "objects": set()})   # frame id -> what's in it
    media_of, place_of, date_of = {}, {}, {}
    for fid, mid in conn.execute("SELECT id, media_id FROM frames"):
        media_of[fid] = mid
    for fid, pid in conn.execute("SELECT r.frame_id, pf.person_id FROM person_faces pf JOIN results r ON r.id = pf.result_id"):
        frames[fid]["people"].add(pid)
    for fid, mod, label in conn.execute("SELECT frame_id, module, label FROM results WHERE module IN ('objects','location','capture_date')"):
        if mod == "objects":
            frames[fid]["objects"].add(label)
        elif mod == "location":
            place_of[media_of[fid]] = label
        else:
            date_of[media_of[fid]] = label[:10]
    kind_of = dict(conn.execute("SELECT id, kind FROM media"))
    every = set(kind_of)
    frame_tests, file_sets = [], []
    for key, ids, match in (("people", [PEOPLE[p] for p in args.get("people", [])], args.get("people_match", "all")),
                            ("objects", args.get("objects", []), args.get("objects_match", "all"))):
        if ids:
            want = set(ids)
            frame_tests.append(lambda f, k=key, w=want, m=match: bool(f[k] & w) if m == "any" else w <= f[k])
            if match == "all" and not args.get("same_frame"):  # all of them somewhere in the file
                file_sets.append({m for m in every if want <= set().union(*[frames[f][key] for f in media_of if media_of[f] == m])})
                frame_tests.pop()
    if args.get("place"):
        file_sets.append({m for m in every if place_of.get(m) == args["place"]})
    if args.get("kind"):
        file_sets.append({m for m in every if kind_of[m] == args["kind"]})
    if args.get("date_from") or args.get("date_to"):
        lo, hi = args.get("date_from") or "0000", args.get("date_to") or "9999"
        file_sets.append({m for m in every if m in date_of and lo <= date_of[m] <= hi})
    if args.get("any_filter"):
        per_test = [{media_of[f] for f in frames if test(frames[f])} for test in frame_tests]
        return set().union(*per_test, *file_sets)
    if frame_tests:  # frame-based tests: same frame under same_frame, else each anywhere in the file
        if args.get("same_frame"):
            file_sets.append({media_of[f] for f in frames if all(test(frames[f]) for test in frame_tests)})
        else:
            file_sets += [{media_of[f] for f in frames if test(frames[f])} for test in frame_tests]
    return set.intersection(every, *file_sets)


def post(body):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/chat/completions", json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))["choices"][0]["message"]


def ask(text, open_item):
    t = time.perf_counter()
    msg = post({"messages": [{"role": "system", "content": system(open_item)}, {"role": "user", "content": text}],
                "tools": TOOLS, "parallel_tool_calls": False, "temperature": 0, "max_tokens": 400})
    ms = round((time.perf_counter() - t) * 1000)
    calls = msg.get("tool_calls") or []
    if not calls:
        return None, msg.get("content") or "", ms
    try:
        return json.loads(calls[0]["function"]["arguments"] or "{}"), "", ms
    except ValueError:
        return {"_malformed": calls[0]["function"]["arguments"]}, "", ms


def main():
    # gold answers through search(), checked against the independent count
    gold = {}
    for qid, _c, _t, open_item, args, _s in Q:
        got = run(args, open_item)
        if args is not None:
            assert not isinstance(got[0], str), (qid, got)
            gold[qid] = got[0]
            if "text" not in args and not args.get("similar_to_open"):
                assert got[0] == independent(args), (qid, sorted(got[0]), sorted(independent(args)))
        else:
            gold[qid] = None
    print(f"gold ok: {len(Q)} queries, independent count agrees on "
          f"{sum(1 for q in Q if q[4] and 'text' not in q[4] and not q[4].get('similar_to_open'))}")

    srv = subprocess.Popen(["llama-server", "-m", str(HERE / "models" / MODEL), "--jinja", "--port", str(PORT),
                            "-c", "8192", "-ngl", "99"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rows = []
    try:
        for _ in range(240):
            try:
                if json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health")).get("status") == "ok":
                    break
            except OSError:
                pass
            time.sleep(0.5)
        ask("warm up", None)
        for qid, cat, text, open_item, g, want_sort in Q:
            args, content, ms = ask(text, open_item)
            if args is not None and g is not None and g.get("text") and args.get("text"):
                scored = {**args, "text": g["text"]}  # judge the structure, not the wording of the text query
            else:
                scored = args
            res = run(scored, open_item)
            got = None if res is None else res[0]
            sort = None if res is None or res[1] is None else res[1]["sort"] or (
                "relevance" if res[1]["q"] else "similarity" if res[1]["similar"] else "newest")
            ok = got == gold[qid] and (want_sort is None or sort == want_sort)
            rows.append({"id": qid, "cat": cat, "query": text, "args": args, "content": content[:200], "ms": ms,
                         "got": sorted(got) if isinstance(got, set) else got,
                         "want": None if gold[qid] is None else sorted(gold[qid]), "correct": ok})
            print(("OK " if ok else "XX ") + f"{qid:4} {text[:40]:40} {json.dumps(args)[:110] if args else 'NO CALL'}"
                  + ("" if ok or not isinstance(got, str) else f"  [{got[:60]}]"), flush=True)
    finally:
        srv.terminate()
        srv.wait()

    by = defaultdict(list)
    for r in rows:
        by[r["cat"]].append(r["correct"])
    cats = list(dict.fromkeys(q[1] for q in Q))
    ms = sorted(r["ms"] for r in rows)[len(rows) // 2]
    table = ("| Model | " + " | ".join(cats) + " | **All** | Median ms |\n" + "|---" * (len(cats) + 3) + "|\n"
             + f"| Granite-4.0-H-350M Q6_K | " + " | ".join(f"{sum(by[c])}/{len(by[c])}" for c in cats)
             + f" | **{sum(r['correct'] for r in rows)}/{len(rows)}** | {ms} |")
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    (out / "real_granite.json").write_text(json.dumps(rows, indent=1))
    (out / "real_summary.md").write_text(table + "\n")
    print(table)


if __name__ == "__main__":
    main()
