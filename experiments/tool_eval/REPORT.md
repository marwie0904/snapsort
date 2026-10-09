# Tool-calling eval: 3 local models under 300 MB

Run on 2026-10-10 on an M1 Pro with llama.cpp 0.6.0 (Homebrew) and greedy decoding (temperature 0). Runs are deterministic.

## Setup

**Tool.** One `search_library` tool that mirrors `search()` on branch `worktree-filters`, plus the agreed capture-date filter. One call carries the full query.

| Field | Maps to |
|---|---|
| `people`, `people_match` | person filter (`ids`, `match`) |
| `same_frame` | `scope="frame"` |
| `place` | place filter (lowercased location label) |
| `kind` | mediaKind filter |
| `date_from`, `date_to` | new capture-date filter |
| `similar_to_open` | `similar` with the open item |
| `any_filter` | `combine="any"` |
| `sort` | sort |

Negation, objects and text search are not in the tool.

**Library.** `data.py` holds 30 fake files: 21 images and 9 videos. Each file has:
- people per frame, so "same file" and "same frame" give different answers
- one of 5 place labels, or none
- a capture date, or none
- a "look" group that stands in for image similarity

**Queries.** There are 45 queries in 9 groups. Every expected answer was worked out by hand, and `python3 data.py` checks that the reference arguments return the same files. All 45 match. The 6 `no_call` queries ask for unsupported things: negation, objects, scenes, an unknown person, or chit-chat. The model should not call the tool for any of them.

**Scoring.** A query counts as correct when the files returned match the expected files exactly. When the query asks for an order, the sort must also match. Only the first call counts, because one call is the full query.

**Models.** The first four are the largest quantization of each model under 300 MB. The two Qwen rows marked over budget are 4-bit references, there to show what the size cap costs:

| Model | Quantization | Size |
|---|---|---|
| LFM2.5-350M | Q6_K | 293 MB |
| Granite-4.0-H-350M | Q6_K | 284 MB |
| FunctionGemma-270M | Q8_0 | 292 MB |
| Qwen3-0.6B | UD-IQ3_XXS | 282 MB |
| Qwen3-0.6B | Q4_K_M | 397 MB (over budget) |
| Qwen3.5-0.8B | Q4_K_M | 533 MB (over budget) |

Both Qwen models run with thinking turned off. With it on, Qwen3-0.6B spent about 1,300 characters reasoning and then often made no call. A call written as plain JSON without the model's tool-call tags is still accepted, which only affected the 3-bit Qwen3.

## Results

| Model | basic | combo | people | or | date | date+ | similar | sort | no_call | **All** | Avg overlap | Invalid args | Median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LFM2.5-350M Q6_K | 2/8 | 1/5 | 0/6 | 0/2 | 0/7 | 0/4 | 0/4 | 1/3 | 4/6 | **8/45** | 0.23 | 13 | 284 |
| Granite-4.0-H-350M Q6_K | 4/8 | 1/5 | 4/6 | 0/2 | 4/7 | 0/4 | 3/4 | 2/3 | 1/6 | **19/45** | 0.49 | 0 | 337 |
| FunctionGemma-270M Q8_0 | 2/8 | 1/5 | 2/6 | 0/2 | 0/7 | 1/4 | 1/4 | 1/3 | 5/6 | **13/45** | 0.33 | 8 | 321 |
| Qwen3-0.6B UD-IQ3_XXS | 1/8 | 0/5 | 5/6 | 0/2 | 0/7 | 0/4 | 0/4 | 0/3 | 0/6 | **6/45** | 0.16 | 12 | 563 |
| Qwen3-0.6B Q4_K_M (397 MB, over budget) | 7/8 | 2/5 | 5/6 | 0/2 | 1/7 | 0/4 | 0/4 | 1/3 | 2/6 | **18/45** | 0.45 | 0 | 291 |
| Qwen3.5-0.8B Q4_K_M (533 MB, over budget) | 2/8 | 3/5 | 2/6 | 0/2 | 1/7 | 1/4 | 1/4 | 2/3 | 2/6 | **14/45** | 0.44 | 0 | 602 |

## How each fails

**Granite (19/45).**
- Its arguments are always valid, because llama.cpp forces the output to match the schema. That makes it the "decision model" we wanted.
- It's the best of the three on people (including same frame), on explicit dates and on similar-image queries.
- It adds fields nobody asked for. "Find David" became `similar_to_open` with no person at all.
- Relative dates go wrong. "This past summer" became August 2025, and "Last month" became 2025-12-31 to 2026-01-01.
- It calls the tool when it shouldn't (only 1 of 6 no-call queries right). "Show me Emma" became Anna, "Tokyo without Anna" became just Tokyo, and "Thanks!" became a search.

**FunctionGemma (13/45).**
- It is the best at not calling the tool when it shouldn't (5/6).
- It refused all 7 date-only queries and 3 of 8 basic queries ("I cannot assist with…").
- When it does call, it often adds all four people.
- llama.cpp doesn't parse its format, so the allowed values aren't enforced and it invents place names ("cebu, philippines").

**LFM2.5 (8/45).**
- llama.cpp doesn't enforce the schema for this model either.
- It fills almost every field on every call, adding Chloe, `same_frame` and Tokyo to unrelated queries.
- It sends people as a string ("Anna,Ben") instead of a list, and cuts place names short ("tokyo").
- It refused 7 date and similar-image queries.

**Qwen3-0.6B, 3-bit (6/45).** At 282 MB, the only size under budget, it lost its tool-call format: 35 of 45 calls were plain JSON. So nothing enforces the schema, and it puts places into `people` ("Cebu", "Kyoto") and searches all four people for chit-chat.

**Qwen3-0.6B, 4-bit (18/45, 397 MB).** It's the best of all models on basic queries (7/8) and on people (5/6), with valid arguments throughout. It adds today's date as a range to unrelated queries, gets 1/7 dates right, misses every similar-image query, and calls the tool for 4 of the 6 queries it should refuse.

**Qwen3.5-0.8B, 4-bit (14/45, 533 MB).** It refuses 11 searches ("I cannot search the library…"), including plain "Anna and Ben", and adds `kind: image` to most calls.

**All models:**
- Every model scored 0 out of 2 on "or" queries.
- Every model scored 0 out of 4 on date-plus-filter queries, except FunctionGemma, which got 1.

## Takeaway

Under 300 MB, Granite is the best base. Qwen3-0.6B only matches it at 4-bit, which is 397 MB, and drops to 6/45 when squeezed into the budget. Its schema-enforced output never produces an invalid value, but 42% exactly right is far from usable. Its errors are things fine-tuning targets directly: extra fields, relative dates, and calling the tool when it shouldn't. Fine-tuning Granite on synthetic queries for this exact tool is the next step.

Earlier run (2026-10-09, 7 simulated tools that didn't match the real filters) scored Granite 15/43, LFM2.5 11/43 and FunctionGemma 9/43. It's superseded.

## Real library (2026-10-10)

**What changed.** Granite now runs against the real `search()` from main, via the `frontend` checkout at `658fb38`, which has main merged in. The data is a read-only snapshot of the app's library (`~/Library/Application Support/snapsort/snapsort.db`): 19 videos, 2,351 frames, people Mar Wie and Alex, 1 place, 58 object labels, and capture dates on 2026-05-26 and 2026-09-26.

**Tool.** The tool has every filter `search()` supports:
- `text` (q, SigLIP)
- `people` and `people_match`
- `objects` and `objects_match` (label filter)
- `place`, `kind`, `date_from` and `date_to`
- `similar_to_open`
- `any_filter` (combine) and `same_frame` (scope)
- `sort`

The allowed values for people, objects and place come from the library itself. The app's chat is still a mock, so this tool shape is a proposal.

**Gold answers.** The expected answer to each of the 44 queries comes from running its reference arguments through `search()`. For the 30 queries without text or similar-image steps, an independent count from the raw rows agrees with `search()`.

**Scoring.** For text queries, the model's wording is swapped for the reference wording before running, so only the structure is judged, not the phrasing. Run it with `uv run python experiments/tool_eval/real_eval.py <copy of snapsort.db>`.

| Model | people | place | objects | date | text | similar | or | sort | no_call | **All** | Median ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Granite-4.0-H-350M Q6_K | 3/5 | 2/2 | 9/11 | 3/7 | 2/6 | 2/3 | 1/2 | 3/3 | 1/5 | **26/44** | 295 |

**Lucky passes.** 4 passes are luck of this small library. Strictly by structure the score is about 22/44.
- "Cars or buses" came back as car AND bus in the same frame.
- "Dogs or cats" came back as dog AND cat.
- "Last week" got the wrong dates, but both ranges are empty here.
- For "from last month" it started the range on 2026-09-15.

**How it fails:**
- **Text search is underused (2/6).** "Sunset", "someone wearing glasses", "eating" and "outdoors" became `objects: ["person"]` or were dropped.
- **It adds `objects: ["person"]` to almost every people query.** That's harmless here, because all 19 videos have a person. It broke "Mar Wie or Alex" and dropped `same_frame` on "on screen at the same time".
- **Relative dates.** "Last month" became today, "May" became May 2025, and "before June" became "from 2025-06-01".
- **Sort `relevance` without text.** `search()` refuses that, so 3 queries errored.
- **It calls the tool when it shouldn't (1/5).** "Binangonan without Mar Wie" became a Binangonan search, "Show me Emma" became Mar Wie, and "Thanks!" became a text search for "scenery".
- **Misses.** "More like this" missed the similar-image flag, and "Binangonan or with Alex" became AND.

Arguments are always valid values, because the schema is enforced. The errors are about choosing the right field, which is what fine-tuning on this exact tool targets.

## Rerun

```bash
brew install llama.cpp
python3 data.py       # checks the hand-computed answers
python3 run_eval.py   # GGUFs go in models/ (see MODELS in run_eval.py)
```

Per-query calls and outputs are in `results/*.json`, and the table is in `results/summary.md`.
