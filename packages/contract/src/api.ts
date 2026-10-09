import { z } from 'zod';
import { Filter, LibrarySearch, QueryPatch, SimilarTo } from './query';

export const MediaKindSchema = z.enum(['image', 'video']);
export type MediaKind = z.infer<typeof MediaKindSchema>;

export const FrameMatchSchema = z.object({
  ts: z.number(),
  score: z.number(),
});
export type FrameMatch = z.infer<typeof FrameMatchSchema>;

export const MediaSummarySchema = z.object({
  id: z.number().int(),
  kind: MediaKindSchema,
  name: z.string(),
  folderId: z.number().int(),
  addedAt: z.string(),
  /** Local capture time "YYYY-MM-DD HH:MM:SS", when the file has one. */
  capturedAt: z.string().optional(),
  durationS: z.number().optional(),
  faceCount: z.number().int().default(0),
  score: z.number().optional(),
  matches: z.array(FrameMatchSchema).optional(),
  bestFrameTs: z.number().optional(),
  /** Highlight view: whether the item passes the filters. Filter view returns matches only. */
  matched: z.boolean().optional(),
});
export type MediaSummary = z.infer<typeof MediaSummarySchema>;

export const BoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type Box = z.infer<typeof BoxSchema>;

export const DetectionsSchema = z.object({
  faces: z.array(
    z.object({
      personId: z.number().int().nullable(),
      name: z.string().nullable().optional(),
      box: BoxSchema,
    })
  ),
  objects: z.array(
    z.object({
      labelId: z.string(),
      name: z.string().optional(),
      box: BoxSchema,
      score: z.number(),
    })
  ),
  tags: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .optional(),
});
export type Detections = z.infer<typeof DetectionsSchema>;

export const MediaTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  timestamps: z.array(z.number()).optional(),
});
export type MediaTag = z.infer<typeof MediaTagSchema>;

export const MediaDetailSchema = MediaSummarySchema.extend({
  path: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  place: z
    .object({
      name: z.string(),
      lat: z.number(),
      lon: z.number(),
    })
    .optional(),
  people: z.array(
    z.object({
      id: z.number().int(),
      name: z.string().nullable(),
      timestamps: z.array(z.number()).optional(),
    })
  ),
  labels: z.array(
    z.object({
      module: z.string(),
      labelId: z.string(),
      name: z.string().optional(),
      timestamps: z.array(z.number()).optional(),
    })
  ),
  tags: z.array(MediaTagSchema).optional(),
  frames: z.array(z.number()).optional(),
  folderPath: z.string().optional(),
  libraryName: z.string().optional(),
  camera: z.string().optional(),
  sizeBytes: z.number().int().optional(),
  codec: z.string().optional(),
  fps: z.number().optional(),
});
export type MediaDetail = z.infer<typeof MediaDetailSchema>;

/** A folder under an added folder. `id` filters the library to it and its subfolders. */
export interface FolderNode {
  id: number;
  name: string;
  path: string;
  count: number;
  children: FolderNode[];
}

/** A library: the internal one, or a mounted drive with a snapsort/ folder. */
export interface Library {
  id: string;
  name: string;
  root: string;
  isExternal: boolean;
  totalBytes: number;
  freeBytes: number;
  folders: FolderNode[];
}

export interface IngestJob {
  id: number;
  folderPath: string;
  libraryName: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  /** starting: models loading, before the first file. */
  phase?: 'starting' | 'files' | 'grouping';
  done: number;
  total: number;
  error?: { code: string; message: string };
}

export type BackendEvent =
  | { type: 'ingest'; job: IngestJob }
  | { type: 'libraries' };

export const PersonSchema = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  count: z.number().int(),
  faceRef: z.string().optional(),
});
export type Person = z.infer<typeof PersonSchema>;

export const FolderSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  path: z.string(),
  busy: z.boolean().optional(),
  isExternal: z.boolean().optional(),
  driveName: z.string().optional(),
});
export type Folder = z.infer<typeof FolderSchema>;

export const ExternalDriveSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  capacity: z.string(),
  used: z.string(),
  free: z.string(),
  usedPercent: z.number(),
  folders: z.array(FolderSchema),
});
export type ExternalDrive = z.infer<typeof ExternalDriveSchema>;

export const IngestResultSchema = z.object({
  newFiles: z.number().int(),
  processedModules: z.array(z.string()),
});
export type IngestResult = z.infer<typeof IngestResultSchema>;

export const SidebarCountsSchema = z.object({
  all: z.number().int(),
  images: z.number().int(),
  videos: z.number().int(),
  people: z.number().int(),
  places: z.number().int(),
  objects: z.number().int(),
  // FRONTEND-PROPOSED: pending backend review — number of distinct scenes.
  scenes: z.number().int().optional(),
});
export type SidebarCounts = z.infer<typeof SidebarCountsSchema>;

export const LabelItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  count: z.number().int().optional(),
});
export type LabelItem = z.infer<typeof LabelItemSchema>;

export const LabelModuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  labels: z.array(LabelItemSchema),
});
export type LabelModule = z.infer<typeof LabelModuleSchema>;

export const LabelManifestSchema = z.object({
  modules: z.array(LabelModuleSchema),
});
export type LabelManifest = z.infer<typeof LabelManifestSchema>;

export const PlaceSummarySchema = z.object({
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  count: z.number().int(),
});
export type PlaceSummary = z.infer<typeof PlaceSummarySchema>;

// FRONTEND-PROPOSED: pending backend review — Scene facet listing for the Scenes browse page.
export const SceneSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number().int(),
  /** Media used as the card cover. */
  coverMediaId: z.number().int().optional(),
  /** For video covers, the frame timestamp (seconds). */
  coverTs: z.number().optional(),
});
export type SceneSummary = z.infer<typeof SceneSummarySchema>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: Array<{ action: string; description: string }>;
  patch?: QueryPatch;
  suggestions?: string[];
  createdAt: string;
}

export interface Thread {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadDetail extends Thread {
  messages: ChatMessage[];
}

export type ChatStreamCallback = (event: {
  type: 'token' | 'step' | 'patch' | 'suggestions' | 'done' | 'error';
  token?: string;
  step?: { action: string; description: string };
  patch?: QueryPatch;
  suggestions?: string[];
  error?: string;
}) => void;

export const ShelfItemSchema = z.object({
  id: z.number().int(),
  kind: MediaKindSchema,
  name: z.string(),
  path: z.string(),
  durationS: z.number().optional(),
  thumbUrl: z.string().optional(),
});
export type ShelfItem = z.infer<typeof ShelfItemSchema>;

export interface SnapsortApi {
  // library + search
  query(req: {
    search: LibrarySearch;
    cursor?: string;
    limit: number;
  }): Promise<{
    items: MediaSummary[];
    nextCursor?: string;
    total: number;
    matched: number;
    facets: { images: number; videos: number };
  }>;
  getMedia(id: number): Promise<MediaDetail>;
  getDetections(id: number, ts?: number): Promise<Detections>;
  stageQueryImage(input: { path: string } | { bytes: ArrayBuffer; mime: string }): Promise<{ imageRef: string }>;
  getCounts(): Promise<SidebarCounts>;
  getLabelManifest(): Promise<LabelManifest>;
  listPlaces(): Promise<PlaceSummary[]>;
  // FRONTEND-PROPOSED: pending backend review.
  listScenes(): Promise<SceneSummary[]>;

  // people
  listPeople(): Promise<Person[]>;
  renamePerson(id: number, name: string): Promise<void>;
  /** Merges the rest into the first id, which keeps its name (or takes the first other name). Same drive only. */
  mergePeople(ids: number[]): Promise<{ id: number }>;

  // folders (ingest)
  listLibraries(): Promise<Library[]>;
  /** Opens the folder picker and queues an ingest. Null when the picker is cancelled. */
  pickAndAddFolder(): Promise<{ jobId: number } | null>;
  rescanFolder(id: number): Promise<{ jobId: number }>;
  getIngestJobs(): Promise<IngestJob[]>;
  cancelIngest(jobId: number): Promise<void>;
  ejectDrive(libraryId: string): Promise<void>;
  listFolders(): Promise<Folder[]>;
  revealInFinder(id: number): Promise<void>;
  /** Opens a media file in its default app (QuickTime for video). */
  openMedia(id: number): Promise<void>;
  onBackendEvent?(callback: (event: BackendEvent) => void): () => void;

  // AI
  chat(
    req: { threadId: number; text: string; current: LibrarySearch },
    onEvent: ChatStreamCallback
  ): () => void; // returns cancel / abort callback
  listThreads(): Promise<Thread[]>;
  createThread(title?: string): Promise<Thread>;
  getThread(id: number): Promise<ThreadDetail>;

  // Shelf
  openShelfWindow(): Promise<void>;
  closeShelfWindow(): Promise<void>;
  toggleShelfPin(pinned?: boolean): Promise<boolean>;
  isShelfPinned(): Promise<boolean>;
  getShelfItems(): Promise<ShelfItem[]>;
  addToShelf(items: ShelfItem | ShelfItem[]): Promise<ShelfItem[]>;
  removeFromShelf(id: number): Promise<ShelfItem[]>;
  clearShelf(): Promise<void>;
  startNativeDrag(filePaths: string[]): Promise<void>;
  onShelfSync?(callback: (items: ShelfItem[]) => void): () => void;
}
