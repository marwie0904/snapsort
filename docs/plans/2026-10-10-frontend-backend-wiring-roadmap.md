# Frontend ↔ backend wiring roadmap

Date: 2026-10-10 (rev 4: built, see §0)
Status: **Done at hackathon scope on `frontend`** (not pushed). Every roadmap item is marked built, done or cut; the user confirmed the cuts (Q17, Q18).

## 0. Build status (rev 4)

The user asked to wire through Phase 7 at hackathon scope ("don't overcomplicate tests or edge cases"). Work happened on branch `wiring` in `.claude/worktrees/wiring`, then `frontend` was fast-forwarded to it.

**Run it**

```
pnpm dev                          # from the repo root; spawns `uv run snapsort serve` from the repo
SNAPSORT_BACKEND=mock pnpm dev    # the old mock data
```

`SNAPSORT_CMD` replaces `uv run snapsort`. `SNAPSORT_INTERNAL_DATA` moves the internal library (default `~/Library/Application Support/snapsort`).

**Changes from the plan**

| Plan | Built | Why |
|---|---|---|
| Q12 string ids | Numbers: library key (first 20 bits of the library uuid) × 2³² + local id. Folder ids use crc32 of the folder's relative path. | No contract-wide id change. Two libraries whose uuids share 20 bits would collide. |
| Q14 interim query, then `search()` in Phase 6 | `date-filter` merged into the branch first. Its `search()` already includes `main`'s text search. Added a `label` (objects) filter, `similar={"vector"}` and model caching. | One query path from the start |
| §4.1 `AUTOINCREMENT`, `frames.path` dropped | Neither. `frames.path` is now relative. Prune and failed frame reads delete that media's previews and frames, so a reused id never shows stale files. | Fewer schema and test changes |
| §4.2 `flock`/`LOCKED`, stdin-EOF watchdog, `fullfsync`, `DISK_FULL`, network-fs refusal | Skipped. Ingest runs in its own process group. Cancel and quit kill the group, and SIGTERM exits through `finally`. | Hackathon scope |
| §4.3 duplicate-library detection, `volumeUuid`, cached cursor | Skipped. Offset paging over a recomputed list. A corrupt database hides only its own library. | Hackathon scope |
| A8 one renderer API, no mock fallback; zod in main; `sandbox: true` | Skipped. Per-component fallbacks remain; they only run outside Electron. | Hackathon scope |
| Scenes, date filter UI | No backend module for scenes, so the Scenes view is empty. No date picker yet; `search()` supports `date`. | Not in scope of the wiring |
| AI panel "model unavailable" | The panel is the frontend's local demo. It now starts closed. `api.chat` returns an error event in sidecar mode. | Chat stays excluded (Q11) |
| Grid shows media as soon as the row exists | Media show once a module has run on them, so previews exist | Found in the E2E pass |

**Phase 7 results** (M1 Pro; a 1 GB exFAT disk image mounted under `/Volumes` as the external drive; the internal library moved with `SNAPSORT_INTERNAL_DATA`; the app driven over CDP)

| §1 item | Result |
|---|---|
| 1 Add folder, internal | Pass. Library created, "Loading models…" then "n / total files", cancel kills `uv`, Python and ffmpeg. Re-run finished with no duplicate rows. |
| 2 Add folder, external | Pass. `/Volumes/SNAPTEST/snapsort/` created, drive card with capacity and folder tree. |
| 3 Folder click | Pass. `Day1` shows 1 file, `DCIM` shows 5. |
| 4 Unplug and replug at a new mount path | Pass. Drive, its media and people drop out within the 2 s poll. Renamed to `SNAPMOVED`, everything came back with no re-ingest, including a person's name. |
| 5 Grid with real previews, HEIC included | Pass. On 415 files, scrolling loaded all 4 pages (120 → 415 cards). |
| 6 Viewer | Pass. iPhone HEVC plays, pauses and seeks both ways. Boxes line up on a rotated portrait video. ProRes falls back to 1 fps frames with "Open in QuickTime". HEIC display rendition is a 1080×1920 JPEG. |
| 7 Inspector | Pass. Place, folder, capture date, camera, fps, size, codec, people, objects. |
| 8 People | Pass. Face crops render. Rename persists to the drive's database. |
| 9 Rescan | Pass. A deleted file was pruned, a new one added. |
| 10 Eject, Reveal in Finder | Pass |
| 11 Failures | All pass. Permission denied (`chmod 000` folder): job fails with "can't read … allow access in System Settings › Privacy & Security". Unreadable subfolder during a rescan: reported, nothing pruned. Disk full (48 MB exFAT image, 1.5 MB free): job fails with "only 1 MB free on the library's drive". Drive pulled mid-ingest: "the drive was disconnected", database `integrity_check` ok after replug, rescan completes. Cloned drive mounted as `/Volumes/SNAPMOVED 1`: skipped, ids stay unique. Corrupt library: skipped, others work. Sidecar `kill -9`: restarts, next call succeeds. |
| 12 TASKS §5 | Pass. Text search ranks across both libraries. Person + place returns the same file as `snapsort search`. Find similar ranks the source first. Highlight view returns everything with matches first. A video result opens at its first match, with marks on the scrubber. |

Measurements:

- **Ingest speed:** 3.3–3.9 frames/s with all 8 modules, so about 3.5 s of video per second. 399 photos took 83 s.
- **Disk use**, frames plus previews: about 0.27 MB per frame on APFS and 0.35 MB on exFAT, so 1–1.3 GB per hour of video.
- **Grid scroll**, 415 files on the 120 Hz display: frame time p50 8.3 ms, p95 9.9 ms, max 16.9 ms, none over 50 ms. TanStack Virtual stays out.
- **`MIN_SCORE = 0.5` recheck** on 406 files from four clips of one room: an unrelated test image matches 0 files even at 0.3. Frames from the clips keep 143 and 275 files at 0.5, which fits a single-room library. Keep 0.5.
- **`TEXT_MIN_SCORE = 0.01`:** "a dog on a beach" 0, "shelves full of clothes" 4, "a person using a laptop" 209. Keep.

Bugs the pass found, all fixed:

- On exFAT, macOS writes `._000000.jpg` companions, and ingest read them as frames. Every video on an exFAT/FAT drive failed.
- Importing Ultralytics replaces `PIL.Image.open` with a version that tries `pip install pi-heif` on any open failure and hides the real error. `objects.py` restores the original.
- Media could show in the grid before their preview existed, and the thumbnail stayed hidden.
- One corrupt `snapsort.db` broke every call.
- A drive pulled mid-ingest showed "crashed" or "some files failed". After the pull, the database kept a video whose frame files never reached the disk, so every rescan skipped it.

Also verified in the final pass: typing "laptop" one key at a time runs one search (250 ms debounce), the People picker filters the grid, and an uploaded image ranks itself first.

Cut at hackathon scope, **user-confirmed 2026-10-10** (Q17, Q18):

- Which app the macOS privacy prompt names in dev mode. It changes no code: the error points to System Settings › Privacy & Security whichever app is named, and a privacy denial raises the same `PermissionError` the `chmod` drill does. Packaged builds (Q10, excluded) get their own prompt anyway. Observing it needs a terminal without Full Disk Access and a person to answer the prompt.
- The items marked "CUT" in §5.

Note: the test disk image detached once by itself between runs. It didn't happen again while idle or during the test suites, and nothing in the app ejects without the sidebar button.

## 1. Goal and success criteria

Replace the mock with the real Python backend in the Electron app. Process whole folders on the internal disk and on external drives, with each drive keeping its own index in a `snapsort/` folder.

Done when, in dev mode (`pnpm dev` + `uv run`):

1. "+ Add folder" on the internal disk creates `~/Library/Application Support/snapsort/` if missing and processes the folder recursively. While models load, the sidebar shows "Loading models…". Then it shows "Ceremony · 124 / 2,310 files". The job can be cancelled.
2. "+ Add folder" on an external drive creates `<drive>/snapsort/` on first use, and the drive appears with its folder tree.
3. Clicking a folder in the tree shows that folder and its subfolders only.
4. Unplugging the drive removes it and its media from the sidebar, grid, counts and any open view. Plugging it back in, even at a different mount path, restores everything with no re-ingest.
5. The grid pages through the whole library with real previews (HEIC included). Video cards show a default frame, or the best-matching frame once search lands (Phase 6).
6. The viewer shows real images (HEIC included). It plays H.264 and HEVC video with seeking, falls back to 1 fps frames for files it can't decode, and draws face and object boxes aligned to the media.
7. The inspector shows real metadata: dimensions, duration, capture date, camera, file size, codec, place, people and objects.
8. The People view shows real face crops, and renaming a person persists.
9. Rescan picks up new files and removes deleted ones. It never removes files it couldn't read.
10. Eject from the sidebar unmounts the drive. Reveal in Finder opens the folder.
11. Failures are visible, not silent. Each of these shows a clear error and leaves the other libraries working:
    - permission denied
    - drive pulled mid-ingest
    - disk full
    - corrupt library
    - sidecar crash
12. TASKS.md §5 check: ingest a folder, search, and see results in the UI.

## 2. Scope

**Included**

- Per-drive library storage (index, frames, previews, relative paths, lock, durability settings)
- `snapsort serve`: a stdio JSON-RPC sidecar for every read and for person rename
- `snapsort ingest --json`: progress events, safe cancel, pruning on rescan, error codes
- Previews at ingest, a `metadata` module, HEIC display renditions
- Contract change to string IDs, plus libraries, the folder tree, metadata fields, the ingest job API and an error envelope
- Electron main: sidecar process manager, ingest job queue, volume detection, eject, ID-based media protocol with Range support
- Renderer: removing demo state, plus the sidebar, paged grid, viewer, inspector, people and error states on real data
- Search and filters wiring once `date-filter` merges, including the UI controls Phase 6 needs that don't exist yet

**Excluded**

- Chatbot backend. In sidecar mode the AI panel shows "model unavailable". (Q11)
- Packaging, signing, notarization, bundled Python. Dev mode only. (Q10)
- Cross-drive person matching. "Anna" on two drives is two persons. (consequence of Q1)
- Remembering disconnected drives (Q8 B), live filesystem browsing (Q4 B), transcoding unless Phase 0 fails (Q5)
- Network volumes (SMB, AFP, NFS, WebDAV), refused because SQLite WAL doesn't work over network filesystems
- Capture-date sort and filter in the UI before Phase 6. `date-filter` provides them in `search()`.
- Remove folder, folder watching, people merge, split, hide or reassign (frontend plan rev 2)
- Time Machine exclusion of the internal library's frames and previews (`tmutil addexclusion`). Add it if backup size becomes a complaint.
- TanStack Virtual. Add it only if Phase 7 measures a scroll problem with paged loading.

## 3. Decisions

| # | Topic | Decision | Basis |
|---|---|---|---|
| Q1 | Where the index lives | One index per drive in `<drive root>/snapsort/` (layout in §4.1). | User-confirmed |
| Q2 | Internal disk | `~/Library/Application Support/snapsort/` | User-confirmed |
| Q3 | Electron ↔ Python | A long-lived `snapsort serve` over stdio JSON-RPC. Ingest is a separate `snapsort ingest` child per job. | User-confirmed |
| Q4 | Sidebar tree | Folders added with "Add folder", per drive. Subfolders come from ingested `media.path`. A click filters to the folder and its subfolders. | User-confirmed |
| Q5 | Video playback | Play the original with Range support. On a decode error, step through 1 fps frames and offer "Open in QuickTime". | User-confirmed. Gate in Phase 0. |
| Q6 | Metadata | A `metadata` ingest module for dimensions, duration, fps, camera make/model, file size and codec. Capture date comes from `capture_date` (Q16). | User-confirmed |
| Q7 | Grid previews | 512px previews for images and video frames, made by the pipeline at ingest, plus a backfill | User-confirmed |
| Q8 | Drive lifecycle | `snapsort/` is created on the first "Add folder" on that drive. The sidebar shows only mounted drives with `snapsort/library.json`. | User-confirmed |
| Q9 | Ingest UX | File count, cancel, serial job queue | User-confirmed. Reverses frontend plan §1 #15. |
| Q10 | Packaging | Dev mode only. The sidecar command is configurable (default `uv run snapsort serve`). | User-confirmed |
| Q11 | Chatbot | Excluded | User-confirmed |
| Q12 | IDs | Strings `"<libraryId>:<localId>"` for media, persons and folders | User-confirmed. Changes frontend plan §1 #20. |
| Q13 | Rescan | Prunes media under the folder whose files are confirmed gone | User-confirmed |
| Q14 | Unblocking the UI | Phase 3 ships an interim filter-free `query` (scope, folder, sort, paging). Phase 6 swaps in `search()`. | User-confirmed (review) |
| Q15 | Spotlight | Generated files live in `frames.noindex/`, `previews.noindex/` and `faces.noindex/`, so Spotlight skips them. | User-confirmed (review). Adjusts the Q1 layout. |
| Q17 | Dev-mode privacy prompt check | Cut. Denial handling is verified with the `chmod` drill; which app the prompt names isn't observed. | User-confirmed (rev 5) |
| Q18 | Plan items marked CUT in §5 | Stay cut for the hackathon. Each has a working fallback. | User-confirmed (rev 5) |
| Q16 | Capture date | `getMedia` reads the `capture_date` module from `date-filter`. `metadata` doesn't store a date. | User-confirmed (review). Narrows Q6. |

**Assumptions** (flagged for review, cheap to change):

| # | Assumption | Why |
|---|---|---|
| A1 | `media.path` is stored relative to the library root: the mount point for drives, `/` for the internal disk. The `frames.path` column is dropped. A frame path is derived: video `frames.noindex/<media_id>/<idx:06d>.jpg`, image = the media path. `Frame` still gets absolute paths. | The mount path changes. For an image, `frames.path` is the original file, so it can't be relative to the data dir. |
| A2 | Existing `.snapsort/` dev databases are deleted, not migrated. | Dev data only. This makes the schema changes free. |
| A3 | Python owns library layout and discovery: `library_for(path)` is the only place a root is computed, and the CLI derives the root from `--data-dir` (no `--root` flag). One exception: main builds `preview` and `frame` file paths itself from the `libraryId → dataDir` map that `listLibraries` returns. | One implementation, and no sidecar round-trip per thumbnail. |
| A4 | Ingest skips the resolved data dir wherever it is. It also skips `$RECYCLE.BIN`, `System Volume Information`, app library packages (`*.photoslibrary`, `*.photolibrary`, `*.fcpbundle`, `*.imovielibrary`) and iCloud dataless files (`st_flags & 0x40000000`, skip reason "in iCloud, not downloaded"). | The internal data dir has no dot, so adding `~` would ingest its own frames. The rest are junk, or reads that trigger downloads. |
| A5 | Folder IDs are `"<libraryId>:<relative dir>"`, with `""` for the drive root. The folder filter is a sidecar post-filter: `path == p or path.startswith(p + "/")`. | Tree nodes have no row IDs. This is segment-safe (`Trip` ≠ `Trip 2`, `_` isn't a wildcard). Under `combine="any"` a folder stays a scope. |
| A6 | `faceRef` crops are cut by the sidecar from the representative face's frame and bbox and cached as `faces.noindex/<resultId>.jpg`. | The faces design left crops out. `AUTOINCREMENT` makes result IDs safe cache keys. |
| A7 | The sidecar opens one SQLite connection per request, read-only (`file:…?mode=ro`), except `renamePerson`. `busy_timeout` is 5 s, and a lock timeout returns a typed `BUSY` error. | No handles to close before eject. Read-only SD cards still work. Grouping can hold the write lock for minutes. |
| A8 | `SNAPSORT_BACKEND=mock\|sidecar` is the only switch (default `sidecar` on macOS). The renderer never builds its own mock. Storybook uses an explicit flag. | Five components silently fall back to `new MockSnapsortApi()` today. |
| A9 | A video's default card frame is the middle frame (`idx = n // 2`) until search supplies `bestFrameTs`. | The first frame is often black. |
| A10 | HEIC images get a display rendition on first open: the sidecar decodes with `load_image` into a JPEG (≤ 2560px), cached as `previews.noindex/display/<id>.jpg`. | Chromium can't render HEIC. Doing it lazily avoids a full-size copy of every photo. |
| A11 | Main receives an IPC envelope `{ok: true, value} \| {ok: false, error: {code, message}}`. The preload unwraps it and throws a typed `ApiError`. | Error codes don't survive `ipcMain.handle` rejections. |

## 4. Implementation plan

### 4.1 Storage layout (per library)

```
<library root>/snapsort/            external: /Volumes/<name>/snapsort   internal: ~/Library/Application Support/snapsort
  library.json                      {"id": "<uuid4>", "volumeUuid": "<diskutil VolumeUUID|null>", "version": 1}
  snapsort.db  (+ -wal, -shm)       schema below; paths relative (A1)
  ingest.lock                       flock held by the running ingest
  frames.noindex/<media_id>/<idx:06d>.jpg      full-res 1 fps frames
  frames.noindex/.tmp-<uuid>/                  extraction in progress; stale ones deleted at ingest start
  previews.noindex/<media_id>.jpg              512px, images
  previews.noindex/<media_id>/<idx:06d>.jpg    512px, video frames
  previews.noindex/display/<media_id>.jpg      HEIC display rendition, on demand (A10)
  faces.noindex/<result_id>.jpg                face crops, on demand (A6)
```

Schema changes:

- `AUTOINCREMENT` on `media`, `results` and `persons`. SQLite reuses the highest deleted ID otherwise, which would make preview URLs and face-crop caches serve a different file.
- `CREATE INDEX results_frame ON results(frame_id)`. Without it, the prune cascade scans `results` once per frame: measured 17.4 s for one 1,000-frame video against 300k results, versus 5 ms with the index.
- New `sources(id, path UNIQUE, added_at)` table.
- `frames.path` dropped (A1).
- `PRAGMA fullfsync=ON` on connections to libraries under `/Volumes`, because macOS `fsync` doesn't flush the drive cache without it.

### 4.2 Processes

```
Renderer ──window.snapsort (preload, envelope A11)──▶ Electron main
   ├─ SidecarClient ──stdio JSON-RPC──▶ uv run snapsort serve          (long-lived; reads + rename)
   ├─ IngestQueue ──spawn (detached)──▶ uv run snapsort ingest <dir> --data-dir … --json [--prune]
   ├─ snapsort-media:// ── preview/frame: path from libraryId→dataDir map; file/display/face: resolveMedia
   └─ /Volumes poll (2 s) ──▶ "libraries:changed" to all windows
```

**stdout discipline** (sidecar and ingest `--json`):

- At startup: `proto = os.fdopen(os.dup(1), "w", buffering=1); os.dup2(2, 1)`. All stray Python and C output, including the ultralytics logger and `print`, then goes to stderr. Protocol lines go to `proto`, one flush per line.
- Main spawns with `PYTHONUNBUFFERED=1` and `stdio: ['pipe', 'pipe', 'inherit']`, reads stdout with `readline`, and logs and skips lines that aren't JSON.

**Sidecar:**

- Requests run on a small thread pool, and stdout writes go through a lock.
- Models load lazily on the first text or image search, cached behind a lock.
- The sidecar exits when stdin closes.
- Main applies a 30 s timeout per call (120 s for `query`), which returns `SIDECAR_TIMEOUT`.
- On a crash, main restarts with backoff (1, 2, 4 s) and stops after 5 failures per minute, showing "Backend unavailable — see terminal".
- If spawning fails with ENOENT (`uv` not on PATH), main shows a message naming the command.
- The cwd is the repo root: `resolve(app.getAppPath(), '../..')`. Main logs the resolved command.

**Ingest child:**

- Spawned with `detached: true`. Cancel, quit and restart signal the whole group: `process.kill(-pid, 'SIGTERM')`, then SIGKILL after 3 s.
- Python installs `signal.signal(SIGTERM, lambda *_: sys.exit(143))`, so `subprocess.run` kills ffmpeg on the way out.
- Under `--json`, a daemon thread blocks on stdin EOF and then kills its own group. electron-vite restarts or a crash of main can't leave an orphan writing to the drive.
- `fcntl.flock(ingest.lock)` prevents two ingests on one library, including a CLI run alongside the app. Contention returns `LOCKED`.

### 4.3 Sidecar JSON-RPC

- **Request and response:** `{"id": 1, "method": "query", "params": {…}}` returns `{"id": 1, "result": …}` or `{"id": 1, "error": {"code": "…", "message": "…"}}`.
- **Error codes:** `QUERY_ERROR`, `BUSY`, `NOT_FOUND`, `LIBRARY_GONE`, `PERMISSION_DENIED`, `MODEL_UNAVAILABLE`.
- **Streaming (reserved for chat):** `{"method": "chat.event", "params": {"streamId", "type": "token|step|patch|done|error", …}}`.

| Method | Backs | Notes |
|---|---|---|
| `listLibraries()` | sidebar; replaces `listFolders` and the mock drive | Scans `/Volumes/*` (skipping symlinks such as `Macintosh HD → /`) for `snapsort/library.json`, plus Application Support. Returns `{id, name, root, dataDir, isExternal, ejectable, totalBytes, freeBytes, status: ok\|error\|duplicate\|readonly, error?, folders: FolderNode[]}`. If two mounted libraries share an `id`, the first is served and the other gets `duplicate`. |
| `libraryFor(path)` | main, before ingest | `realpath` first, then walk up to the mount point. Network filesystems are refused (filesystem type from `diskutil info -plist`). Returns `{root, dataDir, exists, writable}`. |
| `getCounts()` | sidebar counts | Summed over libraries with `status: ok` |
| `query(search, cursor, limit)` | grid, person detail, viewer prev/next | See the response table below |
| `getMedia(id)` | viewer, inspector | `media` + `metadata`, `capture_date`, `location` (display name, lat and lon from `results.data`; name nullable), persons, `objects` |
| `getDetections(id, ts)` | box overlay | `faces` (+ `person_faces`) and `objects` on the frame nearest `ts` |
| `listPeople()`, `renamePerson(id, name)` | People view | Persons with ≥ 1 face, plus `faceRef`. Rename returns `BUSY` while grouping holds the lock. |
| `listPlaces()`, `getLabelManifest()` | pickers (Phase 6) | Place display name + lat/lon from `results.data`; object labels + counts |
| `resolveMedia(id, kind)` | main, for `file`, `display`, `face` | Absolute path, generating `display`/`face` on first request |
| `chat(...)` | AI panel | `MODEL_UNAVAILABLE` |

**`query` response** (interim in Phase 3; Phase 6 keeps the shape):

| Field | Definition |
|---|---|
| `items[]` | `MediaSummary`: `id`, `kind`, `name` (basename), `folderId` (A5, parent dir), `addedAt`, `capturedAt?`, `durationS` (from `metadata`, else frame count), `faceCount` (distinct persons in the file), `score?`, `matches?` (`FrameMatch.score` made nullable), `bestFrameTs` (A9 until Phase 6), `matched` (bool, for highlight view) |
| `total` | Media in mounted libraries within the folder scope, before filters |
| `matched` | Items passing filters. Equals `total` in the interim. |
| `facets` | `{images, videos}` counted before `scope` is applied |
| `nextCursor` | `{token, offset}`. The merged, sorted hit list is cached in the sidecar under `token`, and evicted on a new search, ingest `end` or `libraries:changed`. Pages stay stable while ingest writes. |
| Sort | Interim: `newest`/`oldest` by `added_at`, `name`. `relevance` maps to `similarity` when `q` or `similarTo` is set, otherwise `newest`. Tie-break `(libraryId, localId)`. |
| `view: 'highlight'` | All items in scope, each with a `matched` flag. `filter` returns matched items only. |

### 4.4 Media protocol

- **URLs:** `snapsort-media://<kind>/<id>[/<ts>]`, with `kind ∈ file | display | preview | frame | face`.
- **ID check:** IDs are validated against `/^[0-9a-f-]{36}:\d+$/`. Raw paths are never accepted. That replaces the current handler at `mediaProtocol.ts:11-18`, which strips the leading `/`, drops the Range header, and returns an SVG with status 200 on any error.
- **Serving:** files are served with `fs.createReadStream`. A Range request gets a 206, a missing file gets a 404, and responses carry `Cache-Control: immutable`, which `AUTOINCREMENT` makes safe. Seeking through `protocol.handle` + `net.fetch` is still an open bug in Electron 34 (electron#38749), and the fix was backported only to Electron 37 and 38.
- **Eject support:** main tracks its open read streams per library root so eject can close them.

### 4.5 User flows and edge cases

**Add folder.** Native picker → `libraryFor(path)` (refuse network fs) → enqueue → return `{jobId}` immediately. Ingest then:

1. Takes the lock and creates `snapsort/` and `library.json` if missing.
2. Cleans stale `.tmp-*` dirs and inserts the `sources` row.
3. Emits `start {total}`, then `setup {module}` events while models load (the first run downloads SigLIP, DINOv2 and YOLO weights).
4. Emits `file {done}` events, then `grouping`, and finally `end`, which is sent from a `finally` block.

On `end`, main broadcasts it, and the renderer calls `queryClient.invalidateQueries()` and shows a toast.

Failure codes in `error` / `end`:

| Code | When | UI |
|---|---|---|
| `PERMISSION_DENIED` | the source or a subtree can't be read (`os.walk(onerror=…)`); a dev-mode privacy denial is attributed to the terminal | Toast pointing to System Settings › Privacy & Security › Files & Folders |
| `READ_ONLY` | creating `snapsort/` fails (NTFS on macOS, locked SD card) | "Can't write to <drive>" |
| `DRIVE_GONE` | `os.path.ismount(root)` turns false between files, or a write fails with an I/O error | "Drive disconnected". Queued jobs for that library are dropped. |
| `DISK_FULL` | free space under max(1 GB, 5%) before a file, or SQLite "disk is full" | Toast with `freeBytes` |
| `LOCKED` | another ingest holds `ingest.lock` | "Already processing this drive" |
| exit without `end` | crash | Job marked failed |

Other cases:

- A folder inside an existing source is added as a second `sources` row and nests in the tree.
- A drive root is skipped as its own data dir (A4).

**Plug and unplug.**

- Main polls `readdirSync('/Volumes')` every 2 s and broadcasts `libraries:changed` when the list changes. A poll catches mounts that `fs.watch` sees before the volume is readable.
- The renderer then invalidates everything and drops filters, quick-action filters and selections whose ID prefix belongs to a library that is gone. It also closes a viewer or person detail from that library.
- A running job on a vanished library fails with `DRIVE_GONE`.

**Eject.**

- Hidden when `ejectable` is false, for example internal APFS volumes under `/Volumes`.
- Refused while a job targets the drive.
- Otherwise the renderer closes the viewer and clears `<video src>` for that library, main destroys its open read streams under the root, and runs `diskutil eject <root>`. On failure it retries once after 1 s, then shows diskutil's message, which names the dissenting app.

**Rescan (`--prune`).**

- If any enumeration error occurs, the job reports `PERMISSION_DENIED` and nothing is pruned.
- A media row is deleted only when `os.stat` raises `FileNotFoundError`. Dataless iCloud files count as present.
- Just before the delete transaction, ingest re-reads `library.json` and checks that the `id` still matches.
- Deleted media take their frame, preview, display and face files with them.
- Persons left with no faces drop out of `listPeople`.

**Open a video.**

- `<video src="snapsort-media://file/<id>">` opens at `t` or the first match.
- `<video>` drives the store: `timeupdate` → current ts, scrubber seek → `currentTime`, speed → `playbackRate`. This replaces the simulated `setInterval` in `MediaDetailView`.
- Detections are fetched only while paused, at the nearest whole second.
- On a media error, or `videoWidth === 0` at `loadedmetadata`, the viewer switches to frame stepping over previews, with "Open in QuickTime" (`shell.openPath`).

**Corrupt or unreadable library.** `listLibraries` reports `status: error` for it, and the fan-out skips it. The other libraries keep working.

### 4.6 Changes to existing code (verified)

| File | Today | Change |
|---|---|---|
| `snapsort/cli.py` (main) | `DATA_DIR = Path(".snapsort")` hardcoded | `--data-dir` on every subcommand (`ingest`, `group`, `search`, `people`, `places`; default `.snapsort`); root derived from the data dir (A3); `--json`, `--prune`; `serve` |
| `snapsort/ingest.py` (main) | Absolute paths. `rglob` silently ignores errors. Print lines. ffmpeg inside the `_register` transaction. No index on `results(frame_id)`. | Everything in §4.1 and §4.2, plus the skips in A4, relative and derived paths, temp-dir extraction then one short transaction (media insert, `os.replace`, frames insert), ffmpeg run with `cwd=out` and a relative pattern (fixes the `%` and missing-ffmpeg TASKS findings), `_write` errors caught, previews, prune, `allow_nan=False` |
| `snapsort/search.py` (`main` text search; `date-filter` filters engine) | Two different `search()` functions | Reconciled at the `date-filter` merge (§6). The sidecar joins `Hit.path` with the root. The folder filter stays in the sidecar (A5). |
| `snapsort/group.py` (main) | Takes `data_dir` and reads no paths | No change |
| `tests/e2e/test_ingest.py`, `tests/e2e/test_cli.py`, `tests/group/test_group.py`, `tests/pipeline/test_inputs.py` | Read `frames.path` and the hardcoded data dir. Test the dot-folder rule against `.snapsort`. | Derived frame paths, `--data-dir`, a data-dir skip test |
| `packages/contract/src/api.ts`, `query.ts` | Integer IDs. Flat `Folder`. Mock-shaped `ExternalDrive`. Blocking `pickAndAddFolder`/`rescanFolder`. `tags` fields. Required `FrameMatch.score` and `place.name`. | String IDs. `Library`, `FolderNode`. `pickAndAddFolder`/`rescanFolder` return `{jobId} \| null`. `getIngestJobs`, `cancelIngest`, `ejectDrive`, `revealInFinder(folderId)`. Ingest and `libraries:changed` events. Metadata fields (`capturedAt`, `camera`, `sizeBytes`, `codec`, `fps`). `matched` flag. Nullable `FrameMatch.score` and `place.name`. Drop `tags`, `MediaTag`, `listFolders`, `Folder`, `ExternalDrive`. |
| `packages/mock/src/*` and tests | Integer IDs, exact `folderId` match, `mockExternalDrive` | Follows the contract. Same segment-safe folder prefix match as the sidecar. |
| `apps/desktop/src/main/index.ts` | All handlers call `MockSnapsortApi`. `disableHardwareAcceleration()` (l.37) and `no-sandbox` (l.41) run unconditionally. `sandbox: false` (l.91). `mainWindow` never cleared. | Adapter switch (A8), `SidecarClient`, `IngestQueue`, volume poll, eject, envelope (A11) with zod validation of arguments and sidecar replies, `sandbox: true`, hardware-acceleration and `no-sandbox` switches only off macOS, broadcast to all windows, `mainWindow` cleared on `closed` |
| `apps/desktop/src/main/mediaProtocol.ts` | Raw paths, SVG placeholders | §4.4 |
| `apps/desktop/src/preload/index.ts` | Passes raw invoke results through. Chat thread functions stubbed. | Unwraps the envelope. Adds new methods and an `onEvent` subscription. |
| `renderer/src/stores/useUiStore.ts` | Demo defaults: person filter `[1, 2]` (l.138), "Groom + Bride" quick action, `view: 'highlight'`, AI panel open. Numeric IDs. | `filters: []`, `quickActions: []`, `view: 'filter'`. String IDs. `openMediaDetail(id, ts?)`. Dropping stale library IDs. |
| `renderer/src/App.tsx`, `PeopleView.tsx`, `PersonDetailView.tsx`, `FilterBar.tsx`, `MediaDetailView.tsx` | Each builds `new MockSnapsortApi()` as a fallback. Fake counts (248, 66, 182, 36). `limit: 60`/`100` with no cursor. No error states. | One `renderer/src/api.ts` (A8). `useInfiniteQuery` with a scroll sentinel. Loading, empty and error states. No numeric fallbacks. Viewer navigation over flattened pages. |
| `renderer/src/components/Sidebar.tsx` | Imports `mockLocalFolders`/`mockExternalDrive`. Simulated eject. | `listLibraries`, recursive tree, capacity, status badges, job progress, cancel, eject, reveal |
| `renderer/src/components/AskAiPanel.tsx`, `utils/aiFilterEngine.ts` | Local fake parser with hardcoded IDs and counts. Never calls `api.chat`. Seeded demo chat. | Sidecar mode shows "model unavailable". The fake parser runs only in mock mode. Seed removed. |
| `renderer/src/components/MediaCanvas.tsx`, `MediaFilmstrip.tsx`, `VideoTimelineScrubber.tsx` | Placeholder graphic. Overlay on a fixed 16:10 box. Icons in the filmstrip. Hardcoded "4K UHD". | Real `<img>` (display rendition for HEIC) and `<video>`. Overlay positioned over the rendered media rectangle. Filmstrip previews. Frame-step fallback. Whole-second duration formatting. |
| `renderer/src/components/MediaDetailsInspector.tsx`, `MediaGrid.tsx` | "Folder #id", hardcoded "4K Video", tags section, `faceCount === 2` as the match ring | Real metadata. Folder path. `tags` removed. Match ring from `matched`. |
| ID-typed code | `number` IDs in the store, `PeopleView`, `PersonDetailView`, `MediaGrid`, `MediaFilmstrip`, `VideoTimelineScrubber`, `MediaDetailsInspector`, `query.ts`, and the tests (`useUiStore.test.ts`, `aiFilterEngine.test.ts`, `mockApi.test.ts`, `query.test.ts`). Raw-ID labels like "Person #", "Unnamed Face #", "ID:". | `string`. Labels use names or a "Unnamed" fallback, never raw IDs. |

### 4.7 Validation approach

- **Python:** pytest for each change, using the temp-DB pattern from `tests/group/test_group.py`. The sidecar is tested by piping JSON lines into `snapsort serve`. Ingest `--json` is tested as a subprocess, including killing it mid-video.
- **TS:** Vitest for the contract and the mock. Mock and sidecar responses are parsed with the same zod schemas.
- **Manual:**
  - The §1 checklist on an internal folder and on an **exFAT** USB stick, the common camera and stick format.
  - Privacy (TCC) checks from a terminal **without** Full Disk Access.
  - The video fallback checked with a generated **ProRes** fixture (`ffmpeg -c:v prores_ks`), because Chromium may play `.mkv`.
  - A "different mount path" forced by mounting a same-named volume first, so the library drive lands at `/Volumes/X 1`.

## 5. Roadmap

### Phase 0: Prerequisites and checks

Outcome: the branch has the current backend, and video and privacy behavior are known.

Prerequisites: none.

- [x] Merge `main` into `frontend` (39 commits behind; no overlap in `apps/` or `packages/`)
- [x] Call `disableHardwareAcceleration()` and add `no-sandbox` only when `process.platform !== 'darwin'`. Chromium has no software HEVC decoder.
- [x] Replace the `snapsort-media://file` handler with the `fs.createReadStream` handler: 206 for Range, 404 for a missing file (§4.4; ID resolution comes in Phase 4)
- [x] HEVC check: log `canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"')` and `chrome://gpu` "Video Decode". Play and seek a real iPhone HEVC `.mov`. Record the results with hardware acceleration on. (Done on generated HEVC files and four iPhone Dolby Vision files, see §6.)
- [x] Generate a ProRes fixture and confirm it errors, which is the fallback trigger. (It errors only without an audio track, see §6.)
- [x] Privacy check: from a terminal without Full Disk Access, run `pnpm dev` and add a USB folder and a `~/Desktop` folder through the picker. Record which app is prompted and whether a Python child spawned by Electron can read the picked folder. Then deny, and record the behavior. **Partly run: a Python child spawned by Electron gets the launcher's access. Denial handling verified with the `chmod` drill (Phase 7). Which app the prompt names in dev mode: CUT (Q17, user-confirmed).**

Acceptance: `uv run pytest` and `pnpm -r typecheck` pass on the merged branch. Seeking works with the new handler. The HEVC, ProRes and privacy results are written into §6.

**Decision gate:** if HEVC fails with hardware acceleration on, reopen Q5 and choose between on-demand H.264 proxies (Q5 B) and accepting the frame fallback for most phone footage.

### Phase 1: Per-drive libraries in the pipeline

Outcome: `snapsort ingest` writes a portable, relocatable library to any data dir. It is safe to cancel, kill or unplug, and it reports progress and errors as JSON.

Prerequisites: Phase 0 merge. Coordinate with the `date-filter` owner, because the relative-path change touches `search.py` reads (§6).

- [x] `cli.py`: `--data-dir` on every subcommand. `library_for()` derives the root. Inputs not under the root are rejected. **Built.**
- [x] Schema per §4.1: `AUTOINCREMENT`, `results(frame_id)` index, `sources`, drop `frames.path`, `fullfsync` under `/Volumes` **Built: `results(frame_id)` index, `sources`. CUT: `AUTOINCREMENT`, dropping `frames.path` (kept, relative) and `fullfsync`.**
- [x] `library.json` (UUID + `volumeUuid`) created once if missing **Built. CUT: `volumeUuid`.**
- [x] Relative `media.path` and derived frame paths (A1); update `group.py` callers and the tests listed in §4.6 **Built. Frame paths are stored relative instead of derived.**
- [x] Enumeration with `os.walk(onerror=…)`; the skips in A4; `PERMISSION_DENIED` when the source can't be read **Built.**
- [x] Extraction into `frames.noindex/.tmp-<uuid>/`, then one short transaction. Clean stale temp dirs at start. ffmpeg runs with `cwd=out` and a relative pattern. **CUT: extraction stays inside the register transaction. A failed or missing extraction is rolled back and redone on the next run.**
- [x] stdout discipline (§4.2), the SIGTERM handler, the stdin-EOF watchdog under `--json`, and `flock` on `ingest.lock` **Built: stdout discipline, SIGTERM handler, process-group kill. CUT: stdin-EOF watchdog, `flock`.**
- [x] `--json` events `start`, `setup`, `file`, `grouping`, `error`, `end` (from `finally`) with the §4.5 codes. Free-space and `ismount` checks before each file. `_write` errors caught. **Built: `start`, `file`, `grouping`, `error`, `end` with `PERMISSION_DENIED`, `READ_ONLY`, `DISK_FULL`, `DRIVE_GONE`, `INGEST_FAILED`. `setup` became the "starting" phase.**
- [x] `--prune` per §4.5 **Built.**
- [x] `allow_nan=False` in `validate` and `_write` (TASKS deferred finding) **Built.**

Acceptance (pytest):

- A library moved to a different root resolves every media and frame path.
- `library.json` is written once, and its `id` is the same on every later run.
- Ingesting `~`-like roots skips the data dir.
- A `chmod 000` subfolder makes prune delete nothing and report `PERMISSION_DENIED`.
- A missing source deletes nothing.
- Prune of a 1,000-frame video takes under 1 s.
- `--json` emits a valid stream with no stray lines on stdout.
- SIGTERM mid-video leaves no ffmpeg process and no media row without frames, and a re-run finishes cleanly.
- A second ingest on the same data dir gets `LOCKED`.

Manual: ingest on an exFAT USB stick, rename the volume, and run `snapsort search --data-dir …` (the `date-filter` CLI).

### Phase 2: Previews and metadata

Outcome: every media item has a 512px preview, and every file has a metadata result.

Prerequisites: Phase 1 (same files and layout).

- [x] One preview path in PIL (`draft()` + `thumbnail(512)`) for images and video frames. It reuses the decoded image when available and generates missing previews for "up to date" files (backfill). **Built from the already-decoded frame. CUT: backfill for files ingested before previews existed.**
- [x] `snapsort/modules/metadata.py` on frame 0: width and height from `Frame.image.size` (already rotated), plus duration, fps and codec (ffprobe for videos; `N/A` and `0/0` become `None`), camera make and model, size in bytes. No capture date (Q16). Test at `tests/modules/test_metadata.py`. **Built, with `tests/modules/test_metadata.py`.**

Acceptance:

- pytest with the generated HEIC, PNG and 3 s video fixtures: a HEIC preview is a JPEG, a video has one preview per frame, a portrait video reports rotated dimensions, and metadata has no NaN.
- Re-running ingest on an existing library runs only `metadata` plus the backfill.
- Record the backfill time. Adding a module decodes every video frame today, so this is a known ceiling.

### Phase 3: `snapsort serve` sidecar

Outcome: every read in `SnapsortApi` is available over stdio JSON-RPC, across all mounted libraries. No dependency on the filters merge.

Prerequisites: Phases 1–2.

- [x] JSON-lines loop, stdout discipline, thread pool, locked writes, exit on stdin EOF, typed errors (§4.3) **Built.**
- [x] `listLibraries` (symlink skip, duplicate detection, per-library status, `ejectable`) and `libraryFor` (`realpath`, network refusal) **Built: symlink skip, duplicate (clone) skip, corrupt-library skip, `libraryFor` with `realpath`. CUT: per-library status badges, network-fs refusal.**
- [x] ID prefixing and parsing (Q12); folder tree from `sources` + `media.path`; read-only connections (A7) **Built with numeric ids (§0). Per-request connections that close. CUT: read-only mode.**
- [x] Interim `query` per the §4.3 response table: scope, folder post-filter (A5), sort, highlight, cached merged list with `{token, offset}` cursor **Replaced: `search()` from `date-filter` serves every query. Offset cursor. CUT: cached merged list.**
- [x] `getCounts`, `getMedia` (with `capture_date` when present), `getDetections`, `listPeople`, `renamePerson` (`BUSY`), `listPlaces`, `getLabelManifest`, `resolveMedia` with `display` (A10) and `face` (A6) **Built.**
- [x] `chat` → `MODEL_UNAVAILABLE` **Built in main: chat returns an error event.**

Acceptance: subprocess tests with libraries under different roots.

- IDs are unique and route back to the right library, and counts sum correctly.
- The merged sort and paging stay stable while rows are inserted between pages.
- The folder filter keeps `Trip` and `Trip 2` apart, and matches `a_b` literally.
- A garbage `snapsort.db` in one library leaves the other queryable.
- Two roots with the same `id` produce one `duplicate`.
- A symlink into a fake mount and `/Volumes/Macintosh HD/…` resolve to the right library.
- Rename persists, and returns `BUSY` while another connection holds the write lock.
- HEIC `display` and `face` crops are generated and cached.
- The process exits within 1 s of stdin closing.

### Phase 4: Electron reads real data

Outcome: the app browses, views and plays real libraries, with visible errors. Libraries come from Phase 1–2 CLI runs.

Prerequisites: Phase 3. The contract and mock change can start alongside Phase 1 (§6).

- [x] Contract and mock per §4.6, plus every ID-typed file and test listed there **Built with numeric ids (§0).**
- [x] Remove demo state from the store and the AI panel. Add one `renderer/src/api.ts` with no mock fallback (A8). Show the AI panel as "model unavailable" in sidecar mode. **Built: demo filters, quick action and highlight default removed; AI panel starts closed. CUT: single `api.ts`.**
- [x] `SidecarClient` per §4.2: detached spawn, group kill, `readline`, timeouts, backoff, ENOENT handling, repo-root cwd **Built: readline, timeouts, restart, ENOENT message, repo-root cwd.**
- [x] Envelope (A11) and zod validation in main. `sandbox: true`. Broadcast events to all windows. **Built: envelope, broadcast to all windows. CUT: zod validation in main, `sandbox: true`.**
- [x] Media protocol per §4.4, with ID resolution and main-built preview and frame paths (A3) **Built.**
- [x] `/Volumes` poll → `libraries:changed` → invalidate everything and drop stale IDs **Built.**
- [x] Sidebar: libraries, recursive tree, capacity, status badges (error, duplicate, read-only) **Built. CUT: status badges.**
- [x] Grid: `useInfiniteQuery` with a sentinel, previews, the A9 default frame, the `matched` ring **Built.**
- [x] States: sidecar down (with retry), no libraries ("Add folder" call to action), no results, `QUERY_ERROR`, library error. No numeric fallbacks. **Built.**
- [x] Viewer: `<img>`/display rendition, media-rect overlay, `<video>`-driven time, detections when paused, frame-step fallback with "Open in QuickTime", filmstrip previews, `openMediaDetail(id, ts?)` **Built.**
- [x] Inspector: metadata, capture date, folder path, place, people, objects **Built.**
- [x] People: `faceRef` crops, rename with error rollback **Built.**

Acceptance:

- Success criteria 3, 4, 5 (default frame), 6, 7 and 8 pass manually on one internal and one exFAT USB library.
- A cold start shows no filter chips.
- The ProRes fixture shows the fallback.
- Killing the sidecar shows "Backend unavailable", and it recovers.
- `rg '@snapsort/mock' apps/desktop/src/renderer` finds nothing.
- Vitest passes, and `SNAPSORT_BACKEND=mock` still runs.

### Phase 5: Folders and ingest jobs from the UI

Outcome: users add, rescan, cancel, eject and reveal folders without the CLI, and every failure is visible.

Prerequisites: Phase 4.

- [x] `IngestQueue`: `pickAndAddFolder` → `libraryFor` → enqueue → `{jobId}`; serial execution; parse events; group-kill cancel and quit; "exit without `end`" counts as failed; drop queued jobs for unmounted libraries **Built. CUT: dropping queued jobs for unmounted drives (they fail with a visible error).**
- [x] `getIngestJobs()` so progress survives a reload or a new window **Built.**
- [x] `rescanFolder` with `--prune` **Built.**
- [x] Sidebar: queued, "Loading models…", running "124 / 2,310" and done states; cancel; toasts for every §4.5 code; `invalidateQueries()` on `end` **Built. Job rows show each error instead of toasts.**
- [x] Eject per §4.5, and `revealInFinder(folderId)` **Built.**

Acceptance:

- Success criteria 1, 2, 9, 10 and 11 (except sidecar crash, covered in Phase 4) pass manually.
- Cancelling mid-folder then rescanning finishes without duplicates.
- A queued second folder starts after the first.
- A dev-server restart mid-ingest leaves no `ingest` process.
- Pulling the drive mid-ingest gives "Drive disconnected", and after a replug the DB opens and a rescan completes.
- Eject with a video open from that drive succeeds.

### Phase 6: Search and filters on real data

Outcome: the search bar, facet pickers, chips, Find similar and the video match marks work on real data.

Prerequisites:

- Phase 4.
- `date-filter` merged into `main` and reconciled with `main`'s text search (`search.py`, `cli.py` conflicts), with `q` built on `ClipEmbed.embed_text`/`match_probability` and a `label` (objects) filter.
- `search()` accepting `similar={"vector": …}`.

All of these need the filters owner (§6).

Wiring:

- [x] `LibrarySearch` → `search()`: `f[]` → `filters`; `similarTo` → a vector computed once in the sidecar (from `mediaId`/`ts`, or a staged image); `q`; `sort` per §4.3; `scope` → `mediaKind`; folder post-filter (A5) **Built.**
- [x] Fan-out routing: **Built: persons route to their library, "not in this library" is empty. CUT: per-library `LIBRARY_GONE` mid-query.**
  - With `all`, skip a library if a filter names a person, place or date it lacks.
  - With `any`, drop only those filters, and skip the library if none remain.
  - Treat "not in this library" as empty.
  - Skip libraries with a mismatched embedding version, with a warning.
  - Treat a library pulled mid-query as `LIBRARY_GONE` for that library only.
- [x] `Hit.matches`, `segments` and `best_ts` → `MediaSummary`. Decide whether `segments` goes into the contract. **Built. `segments` stays out of the contract.**
- [x] `stageQueryImage`: main writes a temp file and returns an `imageRef` that maps to its path **Built.**

New UI (build work, not wiring):

- [x] People, Objects and Places pickers, replacing the inert Scene and Tags pills **Built (existing pickers, now on real data).**
- [x] Find similar on cards and in the viewer **Built in the viewer. CUT: on cards.**
- [x] Image button with picker, drop and paste, plus the Filter button handler **Built: picker. CUT: drop and paste. The Filter button was removed on `frontend`.**
- [x] Full sort menu **Built: the sort pill cycles best match or most similar, newest, oldest, name.**
- [x] Scrubber `matches` prop and marks, best frame on cards **Built.**
- [x] `q` debounced by 250 ms, with `placeholderData: keepPreviousData` **Built.**

Acceptance:

- Success criterion 12.
- A person + place query returns the same files as `snapsort search --data-dir … --person … --place …`.
- With two drives mounted, a place that exists only on drive A, an `any` query and Find similar from drive A each return results with no error.
- A video result opens at its first match, with marks on the scrubber.
- Find similar ranks the source item first.

### Phase 7: End-to-end pass

Outcome: the §1 checklist is verified on real hardware and real failure cases.

Prerequisites: Phases 4–6.

- [x] Run the §1 checklist on a library of at least a few hundred files, with HEIC and iPhone video, on the internal disk and an exFAT USB stick, from a terminal without Full Disk Access **Done, see §0. The terminal had file access, see the privacy item.**
- [x] Failure drills: unplug mid-ingest; a near-full stick; a cloned drive with a duplicate `library.json`; a corrupt `snapsort.db`; privacy denial **Done, see §0.**
- [x] Re-check `MIN_SCORE = 0.5` on the larger library (filters design, Findings) **Done: keep 0.5.**
- [x] Measure ingest throughput (files/min) and disk use per hour of video (frames + previews) **Done.**
- [x] Measure grid scrolling at the library's size. Add TanStack Virtual only if it stutters. **Done: no stutter, no virtualization.**

Acceptance: every §1 item and drill passes. The measurements are recorded in §6.

## 6. Dependencies, uncertainties, next step

**Order:** 0 → 1 → 2 → 3 → 4 → 5. Phase 6 follows 4 plus the `date-filter` merge, and 7 comes last.

**Parallel work** (no shared files):

- The Phase 4 contract and mock change (`packages/contract`, `packages/mock` and their tests) can run alongside Phases 1–3. Agree on §4.3 first. The renderer-side ID change touches the same components as the rest of Phase 4, so it stays in Phase 4.
- The Phase 2 `metadata` module (`snapsort/modules/metadata.py`) can run alongside Phase 1. Phase 2 previews can't, because both edit `snapsort/ingest.py`.
- Phase 1 must not run alongside further `date-filter` edits to `snapsort/search.py` or `snapsort/cli.py`. Either merge `date-filter` first or agree on the relative-path change with its owner.

**Owner questions for the filters work** (block Phase 6):

1. Merge `date-filter`, not `worktree-filters`. `date-filter` adds `capture_date` and the `date` filter, and conflicts with `main`'s text search in `search.py` and `cli.py`.
2. Who folds `q` (main's SigLIP text search) and `label` (objects) into the filters `search()`?
3. Add `similar={"vector": …}` so the sidecar embeds once and fans out.
4. The `date` filter raises when some files were never checked for a capture date (`search.py` `_date`). Should that be per-library empty under fan-out?

**Phase 0 results** (2026-10-10, Electron 34.5.8, M1 Pro, generated 1080p30 10 s test files):

| Check | Hardware acceleration on (macOS now) | Off (before Phase 0) |
|---|---|---|
| `getGPUFeatureStatus().video_decode` | `enabled` | `disabled_software` |
| `canPlayType` HEVC Main / Main10 | `probably` / `probably` | `""` / `""` |
| H.264 `.mp4` | Plays, seeks to 7 s, 0 dropped | Plays, seeks |
| HEVC Main `.mov` (`hvc1`) | Plays, seeks to 7 s, 0 dropped | `videoWidth` 0, audio plays, no error |
| HEVC Main10 HLG `.mov` (`hvc1`) | Plays, seeks to 7 s, 2 dropped | `videoWidth` 0, audio plays, no error |
| iPhone `.MOV` ×4: HEVC Main10, Dolby Vision profile 8 (HLG), 1080p30, rotated −90°, 9 s to 273 s, up to 283 MB | All play, 0 dropped. Seeks to 70% (up to 191 s) work. Shown as 1080×1920, so Chromium applies the rotation like ffmpeg's frame extraction does. | |
| ProRes 422 `.mov` with audio | `videoWidth` 0, audio plays, **no error** | |
| ProRes 422 `.mov` without audio | `MediaError 4` (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`) | |
| `snapsort-media://file` Range | `bytes=0-99` → 206, `bytes=-100` → 206, `bytes=1000-` → 206, past end → 416, missing file → 404, no Range → 200 | |

So an unsupported video track with a supported audio track fails silently. The fallback trigger in §4.5 now also checks `videoWidth === 0`. The Q5 decision gate does not fire. Files were made with `ffmpeg -f lavfi -i testsrc2 … -c:v hevc_videotoolbox -tag:v hvc1` (Main10: `-profile:v main10 -pix_fmt p010le`) and `-c:v prores_ks`.

Privacy, partial: launched from the Claude Code shell, which already has file access, Electron main and a `uv run python` child both read `~/Documents` and iCloud Drive (710 files) with no prompt and no errors. So the child inherits the launcher's access. Still open: a terminal without Full Disk Access, a USB folder and `~/Desktop`, which app the prompt names, and what a denial looks like.

**Open uncertainties**

| Item | Blocks | Resolve by |
|---|---|---|
| ~~Whether the picker's folder grant reaches the Python child in dev mode~~ | Resolved: the child gets the launcher's access, and a denial reports `PERMISSION_DENIED`. Prompt attribution cut (§0). | |
| `segments` in the contract | Phase 6 card and scrubber design | Frontend decision at Phase 6 |
| Ingest throughput, disk use per hour of video | Expectations, whether progress needs an ETA, whether a frame-size cap is needed | Phase 7 measurement |
| WAL durability on exFAT when a drive is pulled | Trust in recovery after a yank | Phase 5 and 7 drills (`fullfsync` on) |

**First step:** finish Phase 0 with the privacy check, then start Phase 1.

## 7. Revision history

- **rev 1** (2026-10-10): Q1–Q13 from the planning session.
- **rev 2** (2026-10-10): applied 32 findings from four Opus reviews:
  - pipeline and SQLite
  - Electron and sidecar
  - renderer and contract
  - drives and traceability

  Added Q14–Q16 and assumptions A9–A11. Rewrote A1, A3, A4, A5 and A7.
- **rev 3** (2026-10-10): Phase 0 results. Merge done, macOS keeps hardware acceleration, Range handler in place. Video fallback also triggers on `videoWidth === 0`. iPhone Dolby Vision HEVC plays.
- **rev 4** (2026-10-10): built Phases 1–7 at hackathon scope on `frontend`. §0 lists changes from the plan, results and what's open.
- **rev 5** (2026-10-10): Phase 7 drills (permission denied, disk full, cloned drive), large-library measurements, search debounce, NaN check. Every §5 item marked built, done or cut.
- **rev 6** (2026-10-10): user confirmed the privacy-prompt cut (Q17) and the §5 CUT items (Q18).
