# Frontend plan: changes to match snapsort scope

Reference: snapsort `README.md` and `TASKS.md` (planned scope), not the current backend code.

## Remove

- **Transcripts**: remove `transcript[]` from `MediaDetail`, the transcript panel and click-to-seek. No speech processing is planned.
- **OCR**: remove `ocr[]` from `MediaDetail` and the viewer's OCR section. No OCR is planned.
- **Speech and on-screen text in `q`**: `q` searches visuals only, using the text-image embedding.
- **Scene and Tags facets** and the `/tags/$labelId` route. No scene or tag module is planned. Objects replaces them (see Add).
- **Capture dates**: remove the `dateRange` filter, date-group headers and newest/oldest sort by capture date.
- **`peopleCount` filter** ("Max 2 people"). The planned filters are person, object and location. Drop it from the Milestone 5 test prompt.
- **Folder management beyond ingest**: remove watching, Pause/Resume, Remove, per-folder progress bars, the per-file error popover and `onIndexProgress`. Keep Add folder and Rescan. Both run ingest, and re-running ingest only processes new files and modules.
- **People edits beyond naming**: remove Merge, Hide, per-face "Not this person / Assign to…", their undo toasts, `mergePeople`, `setPersonHidden` and `reassignFace`. Keep the cluster grid, person detail and rename.

## Add

- **Image search** (reverse image search by vibe/theme): add image upload, drop and paste in the search bar, plus "Find similar" on cards and in the viewer. Add a query field such as `similarTo: { mediaId } | { image }`, sorted by similarity.
- **Timeline-based matching for videos**: video results are per frame (1 fps), each with a timestamp. `MediaSummary` returns the matching timestamps, and the card shows the best-matching frame. The viewer marks matches on the scrubber and opens at the first match.
- **Objects facet**: object detection labels, using the existing `label` filter.
- **Detection overlays in the viewer**: draw face and object boxes on the current frame (TASKS: "Media detail (frames, detections, faces)").
- **Search tools in chat**: the chatbot gets search and filters as tools (TASKS), so AI tool calls can set `q` and `similarTo`, not only `Filter[]`.

## Change

- **Places**: the location module stores a place name plus lat/lon. Key the `place` filter and `/places/...` routes by place name, not by an id.
- **Sort**: `relevance` (search), `name`, and `newest`/`oldest` by date added.
- **Thumbnails**: not planned. TASKS only plans serving media and frame files, and HEIC originals don't render in Chromium. This needs a backend task, or the grid uses originals and video frames.
- **Schema names**: media kind is `image | video` (not `photo`), and IDs are integers.

## Hold

- **Outfits**: add a facet only if the feasibility check passes.
