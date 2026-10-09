"""Run every query in data.py through each model with llama-server and score the results.

Needs `brew install llama.cpp` and the GGUF files in models/. Usage: python3 run_eval.py
"""
import json
import re
import subprocess
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

from data import BY_ID, QUERIES, TOOLS, effective_sort, execute, system

HERE = Path(__file__).parent
PORT = 8091
MODELS = {
    "LFM2.5-350M Q6_K": ("lfm2.5-350m-Q6_K.gguf", {}),
    "Granite-4.0-H-350M Q6_K": ("granite-4.0-h-350m-Q6_K.gguf", {}),
    # llama.cpp does not parse FunctionGemma's format, so its calls are read from the text. It never stops on
    # its own, it keeps emitting unwrapped "call:..." junk, so stop there. Prompt prefix is Google's required line.
    "FunctionGemma-270M Q8_0": ("functiongemma-270m-it-Q8_0.gguf", {
        "stop": ["<start_function_response>", "<end_function_call>call:"],
        "system_prefix": "You are a model that can do function calling with the following functions. "}),
    # thinking off: with it on, Qwen3-0.6B spends ~1300 chars reasoning and then often makes no call
    "Qwen3-0.6B UD-IQ3_XXS": ("Qwen3-0.6B-UD-IQ3_XXS.gguf", {"chat_template_kwargs": {"enable_thinking": False}}),
    "Qwen3-0.6B Q4_K_M (397 MB, over budget)": ("Qwen3-0.6B-Q4_K_M.gguf",
                                                {"chat_template_kwargs": {"enable_thinking": False}}),
    "Qwen3.5-0.8B Q4_K_M (533 MB, over budget)": ("Qwen3.5-0.8B-Q4_K_M.gguf",
                                                  {"chat_template_kwargs": {"enable_thinking": False}}),
}
PROPS = TOOLS[0]["function"]["parameters"]["properties"]
TOOL = TOOLS[0]["function"]["name"]


def post(path, body):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))


def parse_functiongemma(text):
    calls = []
    for name, body in re.findall(r"<start_function_call>call:(\w+)\{(.*)\}(?:<end_function_call>|$)", text, re.S):
        arrays = {k: re.findall(r"<escape>(.*?)<escape>", v) for k, v in re.findall(r"(\w+):\[(.*?)\]", body)}
        body = re.sub(r"\w+:\[.*?\]", "", body)
        args = dict(re.findall(r"(\w+):<escape>(.*?)<escape>", body))
        args.update({k: v == "true" for k, v in re.findall(r"(\w+):(true|false)\b", body)})
        calls.append((name, {**args, **arrays}))
    return calls


def parse_bare_json(text):
    """A call written as plain JSON without the model's tool-call tags (Qwen3 at 3-bit does this)."""
    start = text.find("{")
    try:
        obj, _ = json.JSONDecoder().raw_decode(text[start:]) if start >= 0 else (None, 0)
    except ValueError:
        return []
    return [(obj["name"], obj.get("arguments") or {})] if isinstance(obj, dict) and "name" in obj else []


def _args(raw):
    try:
        return json.loads(raw or "{}")
    except ValueError:
        return {"_malformed": raw}  # counted as an invalid arg


def ask(query, open_item, extra):
    extra = dict(extra)
    shown = f"{open_item} ({BY_ID[open_item][1]})" if open_item else None
    sys_msg = extra.pop("system_prefix", "") + system(shown)
    body = {"messages": [{"role": "system", "content": sys_msg}, {"role": "user", "content": query}],
            "tools": TOOLS, "parallel_tool_calls": False, "temperature": 0, "max_tokens": 300, **extra}
    t = time.perf_counter()
    msg = post("/v1/chat/completions", body)["choices"][0]["message"]
    ms = (time.perf_counter() - t) * 1000
    content = msg.get("content") or ""
    calls = [(c["function"]["name"], _args(c["function"]["arguments"])) for c in msg.get("tool_calls") or []]
    return calls or parse_functiongemma(content) or parse_bare_json(content), content, ms


def invalid(name, args):
    if name != TOOL:
        return [f"unknown tool {name}"]
    bad = [f"unknown arg {k}" for k in args if k not in PROPS]
    for k, v in args.items():
        enum = PROPS.get(k, {}).get("enum") or PROPS.get(k, {}).get("items", {}).get("enum")
        for item in v if isinstance(v, list) else [v]:
            if enum and item not in enum:
                bad.append(f"{k}={item}")
        if k.startswith("date_") and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v)):
            bad.append(f"{k}={v}")
    return bad


def run_model(file, extra):
    srv = subprocess.Popen(["llama-server", "-m", str(HERE / "models" / file), "--jinja", "--port", str(PORT),
                            "-c", "4096", "-ngl", "99"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rows = []
    try:
        for _ in range(240):
            try:
                if json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health")).get("status") == "ok":
                    break
            except OSError:
                pass
            time.sleep(0.5)
        ask("warm up", None, extra)
        for qid, cat, q, open_item, _gold, exp, exp_sort in QUERIES:
            calls, content, ms = ask(q, open_item, extra)
            name, args = calls[0] if calls else (None, None)  # one call = one full query; extras are ignored
            bad = invalid(name, args) if calls else []
            got = None if not calls else set() if name != TOOL else execute({**args, "_open": open_item})
            want = None if exp is None else set(exp.split())
            sort = effective_sort(args) if name == TOOL else None
            ok = got == want and (exp_sort is None or sort == exp_sort)
            jac = (1.0 if got == want else 0.0) if None in (got, want) else \
                1.0 if not (got | want) else len(got & want) / len(got | want)
            rows.append({"id": qid, "cat": cat, "query": q, "open": open_item, "calls": calls, "content": content[:300],
                         "got": None if got is None else sorted(got), "want": None if want is None else sorted(want),
                         "sort": sort, "want_sort": exp_sort, "correct": ok, "jaccard": jac, "invalid": bad,
                         "extra_calls": len(calls) - 1 if calls else 0, "ms": round(ms)})
    finally:
        srv.terminate()
        srv.wait()
    return rows


def summarize(results):
    cats = list(dict.fromkeys(q[1] for q in QUERIES))
    lines = ["| Model | " + " | ".join(cats) + " | **All** | Avg overlap | Invalid args | Median ms |",
             "|---" * (len(cats) + 5) + "|"]
    for label, rows in results.items():
        by = defaultdict(list)
        for r in rows:
            by[r["cat"]].append(r["correct"])
        ms = sorted(r["ms"] for r in rows)[len(rows) // 2]
        lines.append(f"| {label} | " + " | ".join(f"{sum(by[c])}/{len(by[c])}" for c in cats)
                     + f" | **{sum(r['correct'] for r in rows)}/{len(rows)}**"
                     + f" | {sum(r['jaccard'] for r in rows) / len(rows):.2f}"
                     + f" | {sum(bool(r['invalid']) for r in rows)} | {ms} |")
    return "\n".join(lines)


if __name__ == "__main__":
    out = HERE / "results"
    out.mkdir(exist_ok=True)
    only = sys.argv[1:]  # e.g. `python3 run_eval.py Qwen` reruns only models whose label contains "Qwen"
    for label, (file, extra) in MODELS.items():
        if not only or any(o in label for o in only):
            print(f"running {label} ...", flush=True)
            (out / f"{file}.json").write_text(json.dumps(run_model(file, extra), indent=1))
    table = summarize({label: json.loads((out / f"{file}.json").read_text())
                       for label, (file, _) in MODELS.items() if (out / f"{file}.json").exists()})
    (out / "summary.md").write_text(table + "\n")
    print(table)
