# snapsort — Technical Flags, Warnings & Improvement Opportunities

This document outlines the critical warnings, backend coordination requirements, technical hazards, and recommended architectural improvements for the **snapsort** desktop application.

---

## 1. Critical Technical Warnings & Hazards

### ⚠️ Hazard 1: Video Codecs & iPhone/Camera Footage (HEVC / H.265 / ProRes)
* **The Problem**: Electron bundles Chromium. Standard Chromium does **not** decode H.265 (HEVC), 10-bit HDR video, or Apple ProRes out of the box due to licensing constraints. Virtually all modern iPhone 4K clips and mirrorless camera footage (Sony, Canon) default to HEVC (H.265).
* **The Impact**: If a user ingests standard iPhone video into `snapsort`, `<video src="snapsort-media://file/...">` will show a blank black box or fail with `MEDIA_ERR_SRC_NOT_SUPPORTED`.
* **Action / Solution**:
  1. For grid cards: The 1 fps extracted frame previews (JPEG/WebP) bypass this issue entirely.
  2. For the full-screen video player: We must either:
     - Use a prebuilt Electron binary compiled with proprietary codecs (`electron-builder` ffmpeg override), or
     - Bundle a lightweight ffmpeg/mpv sidecar or transcode preview stream on demand, or
     - Detect unsupported codecs and fall back to opening the native player (e.g. QuickTime via `shell.openPath`) with a clear in-app prompt.

---

### ⚠️ Hazard 2: Image Decoding & Apple HEIC / RAW Files
* **The Problem**: Web browsers / Chromium cannot natively display `.heic` / `.heif` (default iOS photo format) or camera RAW formats (`.cr2`, `.cr3`, `.arw`, `.nef`).
* **The Impact**: Without preview conversion, all iPhone photos will fail to render in `<img>` tags.
* **Action / Solution**:
  - **Hard Backend Dependency**: The Python ingest pipeline *must* generate a compressed `.webp` or `.jpg` preview (~512px–1024px) for every ingested image into `.snapsort/previews/`.
  - For image search drag-and-drop: If a user drops a `.heic` file directly into the search bar from Windows/macOS, Electron main needs a quick decoding fallback (or forward the raw file path directly to the Python backend to extract embeddings).

---

### ⚠️ Hazard 3: Windows Dev vs. macOS Native Parity
* **The Problem**: Development occurs on Windows, but the target deployment is macOS (`titleBarStyle: 'hiddenInset'`, traffic lights, native App Menu, Apple Silicon binaries, notarization).
* **The Impact**:
  - `hiddenInset` on Windows causes window control collisions or default Windows caption bars if not handled conditionally.
  - Native menus (`Menu.setApplicationMenu`) behave fundamentally differently on Windows vs macOS.
  - File reveal (`shell.showItemInFolder`) opens Windows Explorer instead of Finder.
* **Action / Solution**:
  - Implement a `usePlatformChrome` hook and main-process environment guard:
    ```ts
    const isMac = process.platform === 'darwin';
    // On Windows dev: show custom subtle window frame controls or standard frame
    // On macOS: use hiddenInset with traffic light padding (titleBarOverlay or custom drag regions)
    ```
  - Enforce automated smoke tests on GitHub Actions macOS runners (`macos-latest`) for every release PR.

---

### ⚠️ Hazard 4: Large Library RAM & Virtualization Bottlenecks
* **The Problem**: Photographers routinely have 20,000 to 100,000+ assets (several gigabytes of metadata).
* **The Impact**:
  - Fetching large lists over IPC can choke the Electron message bus and serialize huge JSON arrays into V8 heap memory.
  - Scrolling thousands of DOM elements causes garbage collection spikes and dropped frames.
* **Action / Solution**:
  - **Cursor-based pagination**: Never return more than 60–100 items per query batch.
  - **Strict window virtualization**: Use `@tanstack/react-virtual` with dynamic row heights and explicit cell recycling.
  - **Lazy image loading & memory eviction**: Ensure off-screen image objects are detached from DOM so Chromium's image cache doesn't exhaust RAM.

---

### ⚠️ Hazard 5: Sidecar Process Orphanage & Crash Resilience
* **The Problem**: If the Electron app crashes, is force-quit, or updates, the spawned Python process might remain running in the background as a zombie, holding onto file locks, GPU VRAM, or database handles.
* **Action / Solution**:
  - Electron main must handle `before-quit`, `will-quit`, and unhandled process exceptions with a clean SIGTERM -> SIGKILL tree shutdown (e.g. using `tree-kill`).
  - Python sidecar should implement a parent-process heartbeat (e.g. exit immediately if stdin closes or if IPC ping fails for 10 seconds).

---

## 2. Items to Flag Down to the Backend Team

| Item | What to Flag | Why It Matters | Frontend Recommendation |
|---|---|---|---|
| **1. Ingest Previews** | Python backend must output standard WebP/JPEG previews for all images (especially HEIC/RAW). | Chromium cannot display HEIC or large 48MP RAW files in grid view without crashing or blanking. | Output `previews/{id}.webp` (max 512px on longest side, quality 80) in `.snapsort/`. |
| **2. Video Frames Structure** | Confirm folder layout and naming for 1 fps video frames. | Frontend needs a predictable URI scheme for `<img src="snapsort-media://frame/{id}/{ts}">`. | Pattern: `.snapsort/frames/{media_id}/{ts_seconds}.webp` or direct API retrieval. |
| **3. Sidecar Transport Protocol** | Stdio JSON-RPC vs. Unix Domain Socket / Localhost HTTP. | Need to know transport layer before wiring real IPC adapter in Electron main. | **Stdio JSON-RPC** or **Unix Domain Socket** is preferred over HTTP (eliminates port conflicts and firewall popups). |
| **4. AI Tool Calling Schema** | Explicit JSON schema for query patch emitted by LLM. | Must match frontend's `LibrarySearch` (`q`, `similarTo`, and `Filter[]`). | Provide backend with `packages/contract/src/query.ts` zod schemas as source of truth. |
| **5. Location Canonicalization** | How are places formatted when two locations share a name? | Filter is keyed by place name string. Multiple "Springfield" or "Beach" will merge. | Suggest returning structured `{ name: string, region?: string, country?: string }` so UI can disambiguate. |
| **6. Ingest Status Reporting** | With progress percentages removed, how does backend signal active ingest? | UI needs to show which folder is being ingested and detect completion. | Simple event: `{ folderId: number, status: 'indexing' \| 'idle', newItemsCount?: number }`. |
| **7. Detections Coordinate Space** | Bounding box coordinates standard. | Overlays must align precisely on canvas regardless of resolution or aspect ratio. | Return normalized floats: `{ x, y, w, h }` where values are `0.0` to `1.0`. |
| **8. Vector Query Latency** | Expected response times for visual search & reverse image search. | UI needs to display responsive skeleton states and debounce user input appropriately. | Recommend 250ms debouncing on text search; cancel in-flight queries via AbortSignal. |

---

## 3. High-Impact Frontend Improvements & Enhancements

### 🚀 Improvement 1: Native Drag-Out to Creative Tools (NLE Integration)
* **What**: Allow users to drag any photo or video card directly from snapsort into **Adobe Premiere Pro**, **Final Cut Pro**, **DaVinci Resolve**, or **Finder**.
* **How**: In Electron, use `webContents.startDrag({ file: item.path, icon: thumbnailPath })`.
* **Value**: Instantly turns snapsort from a passive viewer into an indispensable workflow tool for video editors and content creators.

---

### 🚀 Improvement 2: Progressive Thumbnail Pipeline (LQIP / BlurHash)
* **What**: When scrolling rapidly through thousands of items, display tiny 16x16 blurred placeholders (or CSS gradient placeholders) before full 512px previews load.
* **Value**: Eliminates dark jarring pop-in boxes during fast mouse-wheel scrolls and gives a silky-smooth native feel.

---

### 🚀 Improvement 3: Video Frame Scrubber Preview on Card Hover
* **What**: As the user moves their cursor horizontally across a video card in the grid, scrub through the 1 fps frames dynamically (like YouTube / Apple Photos).
* **Value**: Immediate preview of the entire clip without having to click and open the full media viewer.

---

### 🚀 Improvement 4: Keyboard-Driven Power User Workflow
* **What**: Full hotkey suite:
  - `J` / `K` / `L`: Reverse, pause, forward playback in video viewer.
  - `Space`: Quick Look style preview toggle.
  - `Cmd + F`: Focus visual search bar.
  - `Cmd + J`: Toggle Ask AI drawer.
  - `Cmd + Click` / `Shift + Click`: Multi-selection for bulk export or folder filtering.
  - `D`: Toggle face & object bounding boxes.
* **Value**: Professional editors live by hotkeys; elevates the app from amateur web-wrapper to high-grade desktop software.

---

### 🚀 Improvement 5: In-Memory / Local Query Cache with Undo History
* **What**: TanStack Query cache persistence + Zustand undo/redo stack for query filters.
* **Value**: Clicking back, undoing an AI suggestion, or switching between Folders is instantaneous with zero reload flicker.

---

### 🚀 Improvement 6: Graceful Offline & Model Loading Feedback
* **What**: Beautiful empty states, animated corner brackets (derived from brand assets), and warm progress feedback when local models are warming up in VRAM / RAM.
* **Value**: Local ML models take several seconds to load checkpoints into memory on startup; clear feedback prevents users from assuming the app is hung.
