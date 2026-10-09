import {
  ChatStreamCallback,
  Detections,
  Folder,
  IngestResult,
  LabelManifest,
  LibrarySearch,
  MediaDetail,
  MediaSummary,
  Person,
  PlaceSummary,
  SceneSummary,
  SidebarCounts,
  SnapsortApi,
  ShelfItem,
  Thread,
  ThreadDetail,
  getLabelFilterIds,
} from '@snapsort/contract';
import {
  mockCounts,
  mockFolders,
  mockLabelManifest,
  mockMediaList,
  mockPeople,
  mockPlaces,
} from './mockData';

export class MockSnapsortApi implements SnapsortApi {
  private media: MediaDetail[] = [...mockMediaList];
  private people: Person[] = [...mockPeople];
  private folders: Folder[] = [...mockFolders];
  private threads: ThreadDetail[] = [
    {
      id: 1,
      title: 'Wedding Highlights',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: 'm1',
          role: 'user',
          content: 'Group all images where the groom and bride are visible, no other audience',
          createdAt: new Date(Date.now() - 60000).toISOString(),
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Done. I found 36 matches and applied these filters:',
          steps: [
            { action: 'filter', description: 'Includes: groom, bride' },
            { action: 'filter', description: 'Max people: 2' },
          ],
          suggestions: ['Only video', 'Add cake cutting'],
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ];

  async query(req: { search: LibrarySearch; cursor?: string; limit: number }) {
    const { search, cursor, limit = 60 } = req;
    let list = [...this.media];

    // Filter by scope
    if (search.scope === 'images') {
      list = list.filter((m) => m.kind === 'image');
    } else if (search.scope === 'videos') {
      list = list.filter((m) => m.kind === 'video');
    }

    // Filter by folder scope
    const folderFilter = search.f.find((f) => f.kind === 'folder');
    if (folderFilter && folderFilter.kind === 'folder') {
      list = list.filter((m) => m.folderId === folderFilter.id);
    }

    // Helper: test if an item matches the active filters
    const matchesFilters = (m: MediaDetail): boolean => {
      // Semantic text search (simulated)
      if (search.q) {
        const qLower = search.q.toLowerCase();
        const matchesName = m.name.toLowerCase().includes(qLower);
        const matchesLabel = m.labels.some((l) => l.labelId.toLowerCase().includes(qLower));
        const matchesPlace = m.place?.name.toLowerCase().includes(qLower) ?? false;
        if (!matchesName && !matchesLabel && !matchesPlace) return false;
      }

      // Filter array
      for (const f of search.f) {
        if (f.kind === 'person') {
          if (f.match === 'all') {
            const hasAll = f.ids.every((id) => m.people.some((p) => p.id === id));
            if (!hasAll) return false;
          } else {
            const hasAny = f.ids.some((id) => m.people.some((p) => p.id === id));
            if (!hasAny) return false;
          }
        } else if (f.kind === 'label') {
          const ids = getLabelFilterIds(f);
          if (ids.length > 0) {
            const has = (id: string) => m.labels.some((l) => l.labelId === id);
            const ok = (f.match ?? 'all') === 'all' ? ids.every(has) : ids.some(has);
            if (!ok) return false;
          }
        } else if (f.kind === 'scene') {
          if (f.ids.length > 0) {
            const has = (id: string) => (m.tags ?? []).some((t) => t.id === id);
            const ok = f.match === 'all' ? f.ids.every(has) : f.ids.some(has);
            if (!ok) return false;
          }
        } else if (f.kind === 'place') {
          if (m.place?.name !== f.name) return false;
        } else if (f.kind === 'mediaKind') {
          if (m.kind !== f.value) return false;
        } else if (f.kind === 'folder') {
          if (m.folderId !== f.id) return false;
        }
      }
      return true;
    };

    const total = list.length;
    let matchedCount = 0;

    // View mode: 'filter' (hide non-matches) vs 'highlight' (keep all, outline matches)
    if (search.view === 'highlight') {
      // In highlight mode, attach score 1 to matches and sort matches first
      list = list.map((m) => {
        const isMatch = matchesFilters(m);
        if (isMatch) matchedCount++;
        return {
          ...m,
          score: isMatch ? 1 : 0,
        };
      });
    } else {
      // Normal filter mode: only keep matches
      list = list.filter((m) => {
        const isMatch = matchesFilters(m);
        if (isMatch) matchedCount++;
        return isMatch;
      });
    }

    // Sort: In highlight mode, matches (score === 1) come first, with secondary sort applied
    list.sort((a, b) => {
      if (search.view === 'highlight') {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (scoreDiff !== 0) return scoreDiff;
      }
      if (search.sort === 'name') {
        return a.name.localeCompare(b.name);
      } else if (search.sort === 'oldest') {
        return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      } else {
        // 'newest' or default
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      }
    });

    // Pagination
    const startIndex = cursor ? parseInt(cursor, 10) : 0;
    const paginated = list.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < list.length ? (startIndex + limit).toString() : undefined;

    const imagesCount = list.filter((m) => m.kind === 'image').length;
    const videosCount = list.filter((m) => m.kind === 'video').length;

    // Strip full detail fields down to MediaSummary
    const items: MediaSummary[] = paginated.map((d) => ({
      id: d.id,
      kind: d.kind,
      name: d.name,
      folderId: d.folderId,
      addedAt: d.addedAt,
      durationS: d.durationS,
      faceCount: d.faceCount,
      score: d.score,
      matches: d.matches,
      bestFrameTs: d.bestFrameTs,
    }));

    return {
      items,
      nextCursor,
      total,
      matched: matchedCount,
      facets: {
        images: imagesCount,
        videos: videosCount,
      },
    };
  }

  async getMedia(id: number): Promise<MediaDetail> {
    const item = this.media.find((m) => m.id === id);
    if (!item) throw new Error(`Media with ID ${id} not found`);
    return item;
  }

  async getDetections(id: number, ts?: number): Promise<Detections> {
    const item = await this.getMedia(id);
    const isVideo = item.kind === 'video';

    // If video and timestamp provided, check which entities appear near this timestamp
    const activePeople = isVideo && ts !== undefined
      ? item.people.filter((p) => {
          if (!p.timestamps || p.timestamps.length === 0) return true;
          return p.timestamps.some((t) => Math.abs(t - ts) <= 2);
        })
      : item.people;

    // If no one matched window, fallback to at least one person if item has people
    const displayPeople = activePeople.length > 0 ? activePeople : item.people.slice(0, 1);

    const faces = displayPeople.map((p, index) => {
      const wobble = ts !== undefined ? ((ts + index) % 5) * 0.02 - 0.04 : 0;
      return {
        personId: p.id,
        name: p.name,
        box: {
          x: Math.max(0.05, Math.min(0.7, 0.15 + (index % 3) * 0.28 + wobble)),
          y: Math.max(0.08, Math.min(0.5, 0.18 + wobble)),
          w: 0.22,
          h: 0.28,
        },
      };
    });

    const activeLabels = isVideo && ts !== undefined
      ? item.labels.filter((l) => {
          if (!l.timestamps || l.timestamps.length === 0) return true;
          return l.timestamps.some((t) => Math.abs(t - ts) <= 3);
        })
      : item.labels;

    const displayLabels = activeLabels.length > 0 ? activeLabels : item.labels.slice(0, 1);

    const objects = displayLabels.map((l, index) => {
      const wobble = ts !== undefined ? ((ts + index) % 4) * 0.02 - 0.03 : 0;
      return {
        labelId: l.labelId,
        name: l.name || l.labelId,
        box: {
          x: Math.max(0.1, Math.min(0.65, 0.2 + (index % 3) * 0.26 + wobble)),
          y: Math.max(0.4, Math.min(0.7, 0.52 + wobble)),
          w: 0.28,
          h: 0.32,
        },
        score: 0.92,
      };
    });

    const activeTags = (item.tags || []).filter((t) => {
      if (!isVideo || ts === undefined || !t.timestamps || t.timestamps.length === 0) return true;
      return t.timestamps.some((time) => Math.abs(time - ts) <= 4);
    }).map((t) => ({ id: t.id, name: t.name }));

    return { faces, objects, tags: activeTags };
  }

  async stageQueryImage(input: { path: string } | { bytes: ArrayBuffer; mime: string }) {
    return { imageRef: `mock_ref_${Date.now()}` };
  }

  async getCounts(): Promise<SidebarCounts> {
    return {
      all: this.media.length,
      images: this.media.filter((m) => m.kind === 'image').length,
      videos: this.media.filter((m) => m.kind === 'video').length,
      people: this.people.length,
      places: mockPlaces.length,
      objects: mockLabelManifest.modules[0].labels.length,
      scenes: (await this.listScenes()).length,
    };
  }

  async getLabelManifest(): Promise<LabelManifest> {
    return mockLabelManifest;
  }

  async listPlaces(): Promise<PlaceSummary[]> {
    return mockPlaces;
  }

  async listScenes(): Promise<SceneSummary[]> {
    const byId = new Map<string, SceneSummary>();
    for (const m of this.media) {
      for (const t of m.tags ?? []) {
        const existing = byId.get(t.id);
        if (existing) {
          existing.count++;
        } else {
          byId.set(t.id, {
            id: t.id,
            name: t.name,
            count: 1,
            coverMediaId: m.id,
            coverTs: t.timestamps?.[0],
          });
        }
      }
    }
    return [...byId.values()].sort((a, b) => b.count - a.count);
  }

  async listPeople(): Promise<Person[]> {
    return this.people;
  }

  async renamePerson(id: number, name: string): Promise<void> {
    const p = this.people.find((person) => person.id === id);
    if (p) p.name = name;
  }

  async pickAndAddFolder(): Promise<{ folder: Folder; result: IngestResult } | null> {
    const newId = this.folders.length + 1;
    const newFolder: Folder = {
      id: newId,
      name: `Folder ${newId}`,
      path: `/Users/mac/Media/Folder_${newId}`,
    };
    this.folders.push(newFolder);
    return {
      folder: newFolder,
      result: { newFiles: 24, processedModules: ['people', 'objects', 'places'] },
    };
  }

  async rescanFolder(id: number): Promise<IngestResult> {
    return { newFiles: 5, processedModules: ['people', 'objects', 'places'] };
  }

  async listFolders(): Promise<Folder[]> {
    return this.folders;
  }

  async revealInFinder(id: number): Promise<void> {
    // No-op in mock
  }

  chat(
    req: { threadId: number; text: string; current: LibrarySearch },
    onEvent: ChatStreamCallback
  ): () => void {
    let cancelled = false;

    setTimeout(() => {
      if (cancelled) return;
      onEvent({
        type: 'step',
        step: { action: 'detect', description: 'Analyzing request intent...' },
      });
    }, 150);

    setTimeout(() => {
      if (cancelled) return;
      onEvent({
        type: 'step',
        step: { action: 'filter', description: 'Includes: groom, bride' },
      });
      onEvent({
        type: 'patch',
        patch: {
          filters: {
            add: [
              { kind: 'person', ids: [1, 2], match: 'all', source: 'ai' },
              { kind: 'mediaKind', value: 'image', source: 'ai' },
            ],
          },
        },
      });
    }, 400);

    setTimeout(() => {
      if (cancelled) return;
      onEvent({
        type: 'token',
        token: 'Done. I found 36 matches and applied these filters:',
      });
    }, 700);

    setTimeout(() => {
      if (cancelled) return;
      onEvent({
        type: 'suggestions',
        suggestions: ['Only video', 'Add cake cutting'],
      });
      onEvent({ type: 'done' });
    }, 950);

    return () => {
      cancelled = true;
    };
  }

  async listThreads(): Promise<Thread[]> {
    return this.threads.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async createThread(title = 'New Search'): Promise<Thread> {
    const thread: ThreadDetail = {
      id: this.threads.length + 1,
      title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    this.threads.unshift(thread);
    return thread;
  }

  async getThread(id: number): Promise<ThreadDetail> {
    const t = this.threads.find((th) => th.id === id);
    if (!t) throw new Error(`Thread ${id} not found`);
    return t;
  }

  // Shelf methods
  private shelfItems: ShelfItem[] = [];
  private shelfPinned = true;
  private shelfListeners: Set<(items: ShelfItem[]) => void> = new Set();

  async openShelfWindow(): Promise<void> {
    // In mock/browser environment, simulated
  }

  async closeShelfWindow(): Promise<void> {
    // In mock/browser environment, simulated
  }

  async toggleShelfPin(pinned?: boolean): Promise<boolean> {
    this.shelfPinned = pinned !== undefined ? pinned : !this.shelfPinned;
    return this.shelfPinned;
  }

  async isShelfPinned(): Promise<boolean> {
    return this.shelfPinned;
  }

  async getShelfItems(): Promise<ShelfItem[]> {
    return [...this.shelfItems];
  }

  async addToShelf(items: ShelfItem | ShelfItem[]): Promise<ShelfItem[]> {
    const list = Array.isArray(items) ? items : [items];
    for (const item of list) {
      if (!this.shelfItems.some((existing) => existing.id === item.id)) {
        this.shelfItems.push(item);
      }
    }
    this.notifyShelfListeners();
    return [...this.shelfItems];
  }

  async removeFromShelf(id: number): Promise<ShelfItem[]> {
    this.shelfItems = this.shelfItems.filter((item) => item.id !== id);
    this.notifyShelfListeners();
    return [...this.shelfItems];
  }

  async clearShelf(): Promise<void> {
    this.shelfItems = [];
    this.notifyShelfListeners();
  }

  async startNativeDrag(_filePaths: string[]): Promise<void> {
    // In browser/mock environment, simulated
  }

  onShelfSync(callback: (items: ShelfItem[]) => void): () => void {
    this.shelfListeners.add(callback);
    callback([...this.shelfItems]);
    return () => {
      this.shelfListeners.delete(callback);
    };
  }

  private notifyShelfListeners(): void {
    for (const listener of this.shelfListeners) {
      listener([...this.shelfItems]);
    }
  }
}
