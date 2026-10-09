"""Chat: Granite 4.0 H 350M, a local model, turns one message into one library search.

llama-server (brew install llama.cpp) runs the model. It starts on the first message and stops when serve exits.
The tool's people, places and objects come from the libraries, and llama.cpp holds the model to the schema,
so every value it picks exists. One message is one full search: it replaces the current filters."""
import atexit
import json
import os
import socket
import subprocess
import threading
import time
import urllib.request
from datetime import date
from pathlib import Path

MODEL = Path(os.environ.get("SNAPSORT_CHAT_MODEL")
             or Path.home() / ".cache" / "snapsort" / "granite-4.0-h-350m-Q6_K.gguf")
SORTS = ["relevance", "similarity", "newest", "oldest", "name"]

_lock = threading.Lock()
_server: subprocess.Popen | None = None
_port = 0


def _url() -> str:
    """The running llama-server, started if needed."""
    global _server, _port
    with _lock:
        if _server is None or _server.poll() is not None:
            if not MODEL.is_file():
                raise RuntimeError(f"chat model missing: put {MODEL.name} in {MODEL.parent}")
            with socket.socket() as s:
                s.bind(("127.0.0.1", 0))
                _port = s.getsockname()[1]
            try:
                _server = subprocess.Popen(
                    ["llama-server", "-m", str(MODEL), "--jinja", "--port", str(_port), "-c", "4096", "-ngl", "99"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except FileNotFoundError:
                raise RuntimeError("llama-server not found. brew install llama.cpp") from None
            atexit.register(_server.terminate)
            for _ in range(120):
                if _server.poll() is not None:
                    raise RuntimeError(f"llama-server exited ({_server.returncode})")
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{_port}/health", timeout=1) as r:
                        if json.load(r).get("status") == "ok":
                            break
                except OSError:
                    pass
                time.sleep(0.5)
            else:
                raise RuntimeError("llama-server didn't start in 60 s")
        return f"http://127.0.0.1:{_port}"


def tool(people: list[str], places: list[str], labels: list[str]) -> dict:
    """The one tool. A list is left out when the library has none: llama.cpp can't build a grammar for an empty enum."""
    props = {
        "text": {"type": "string", "description": "Visual description to match: scenes, weather, colors, clothing, "
                 "activities. Not for people, places or anything in the objects list."},
        "people": {"type": "array", "items": {"type": "string", "enum": people}},
        "people_match": {"type": "string", "enum": ["all", "any"], "description": "all (default) or any listed person"},
        "objects": {"type": "array", "items": {"type": "string", "enum": labels}, "description": "Detected objects."},
        "objects_match": {"type": "string", "enum": ["all", "any"], "description": "all (default) or any listed object"},
        "place": {"type": "string", "enum": places},
        "kind": {"type": "string", "enum": ["image", "video"], "description": "Only when the user asks for one kind."},
        "date_from": {"type": "string", "description": "Capture date, YYYY-MM-DD, inclusive."},
        "date_to": {"type": "string", "description": "Capture date, YYYY-MM-DD, inclusive."},
        "similar_to_open": {"type": "boolean", "description": "Look like the item open in the viewer. Not with text."},
        "sort": {"type": "string", "enum": SORTS, "description": "Only when the user asks for an order."},
    }
    for key, values in (("people", people), ("place", places), ("objects", labels)):
        if not values:
            del props[key]
    return {"type": "function", "function": {
        "name": "search_library", "description": "Search the video and photo library. All filters must match.",
        "parameters": {"type": "object", "properties": props}}}


def system(open_ts: float | None) -> str:
    today = date.today()
    shown = "nothing" if open_ts is None else f"a file, at {int(open_ts)}s"
    return (f"You search the user's local photo and video library. Today is {today.isoformat()} "
            f"({today.strftime('%A')}). Open in the viewer: {shown}. Call search_library once with every filter "
            "the request needs. Do not call it if the message is not a search, or if it needs something the tool "
            "cannot do: excluding people, places or objects, or people not in the list.")


def to_patch(args: dict, people: dict[str, int], open_id: int | None, open_ts: float | None) -> dict:
    """Tool arguments -> a QueryPatch that replaces the whole search. Unknown names are dropped."""
    lst = lambda v: [v] if isinstance(v, str) else list(v or [])
    ai = {"source": "ai"}
    f = []
    ids = [people[p] for p in lst(args.get("people")) if p in people]
    if ids:
        f.append({"kind": "person", "ids": ids, "match": args.get("people_match") or "all", **ai})
    if args.get("objects"):
        f.append({"kind": "label", "module": "objects", "labelIds": lst(args["objects"]),
                  "match": args.get("objects_match") or "all", **ai})
    if args.get("place"):
        f.append({"kind": "place", "name": args["place"], **ai})
    if args.get("kind") in ("image", "video"):
        f.append({"kind": "mediaKind", "value": args["kind"], **ai})
    if args.get("date_from") or args.get("date_to"):
        f.append({"kind": "date", **{k: args[f"date_{k}"] for k in ("from", "to") if args.get(f"date_{k}")}, **ai})
    text = (args.get("text") or "").strip() or None
    similar = None
    if args.get("similar_to_open") in (True, "true") and open_id is not None and not text:
        similar = {"mediaId": open_id, **({"ts": open_ts} if open_ts is not None else {}), **ai}
    return {"q": text, "similarTo": similar, "filters": {"clear": True, "add": f},
            "sort": args.get("sort") if args.get("sort") in SORTS else None}


def ask(text: str, people: dict[str, int], places: list[str], labels: list[str],
        open_id: int | None = None, open_ts: float | None = None) -> dict:
    """{"reply": text when the model doesn't search, "call": its arguments, "patch": the QueryPatch}."""
    body = {"messages": [{"role": "system", "content": system(open_ts if open_id is not None else None)},
                         {"role": "user", "content": text}],
            "tools": [tool(list(people), places, labels)], "parallel_tool_calls": False,
            "temperature": 0, "max_tokens": 300}
    req = urllib.request.Request(_url() + "/v1/chat/completions", json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        msg = json.load(r)["choices"][0]["message"]
    calls = msg.get("tool_calls") or []
    if not calls:
        return {"reply": (msg.get("content") or "").strip() or "I can't search for that.", "call": None, "patch": None}
    args = json.loads(calls[0]["function"]["arguments"] or "{}")
    return {"reply": None, "call": args, "patch": to_patch(args, people, open_id, open_ts)}
