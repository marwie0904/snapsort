import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useShelfStore, toShelfItem } from '../stores/useShelfStore';
import type { ShelfItem } from '@snapsort/contract';

describe('useShelfStore', () => {
  beforeEach(() => {
    useShelfStore.setState({
      items: [],
      selectedIds: [],
      isPinned: true,
    });
    vi.restoreAllMocks();
  });

  it('correctly normalizes media input into a ShelfItem', () => {
    const item = toShelfItem({
      id: 10,
      kind: 'video',
      name: 'CER_0412',
      durationS: 30,
      folderId: 1,
      addedAt: '2026-10-01T00:00:00Z',
      faceCount: 2,
    });

    expect(item.id).toBe(10);
    expect(item.kind).toBe('video');
    expect(item.name).toBe('CER_0412');
    expect(item.durationS).toBe(30);
    expect(item.path).toBe('/media/CER_0412.mp4');
    expect(item.thumbUrl).toBe('snapsort-media://frame/10/1');
  });

  it('adds items and prevents duplicates', async () => {
    const store = useShelfStore.getState();

    await store.addItem({
      id: 1,
      kind: 'video',
      name: 'CLIP_01',
      folderId: 1,
      addedAt: '2026-10-01',
      faceCount: 1,
    });

    expect(useShelfStore.getState().items.length).toBe(1);
    expect(useShelfStore.getState().items[0].id).toBe(1);

    // Try adding the same item again
    await store.addItem({
      id: 1,
      kind: 'video',
      name: 'CLIP_01',
      folderId: 1,
      addedAt: '2026-10-01',
      faceCount: 1,
    });

    expect(useShelfStore.getState().items.length).toBe(1);
  });

  it('adds multiple items in batch', async () => {
    const store = useShelfStore.getState();

    await store.addItems([
      { id: 1, kind: 'image', name: 'IMG_01', folderId: 1, addedAt: '2026', faceCount: 0 },
      { id: 2, kind: 'video', name: 'VID_02', folderId: 1, addedAt: '2026', faceCount: 2 },
    ]);

    expect(useShelfStore.getState().items.length).toBe(2);
  });

  it('removes an item by id and cleans up selectedIds', async () => {
    const store = useShelfStore.getState();
    await store.addItems([
      { id: 1, kind: 'image', name: 'IMG_01', folderId: 1, addedAt: '2026', faceCount: 0 },
      { id: 2, kind: 'video', name: 'VID_02', folderId: 1, addedAt: '2026', faceCount: 2 },
    ]);

    store.toggleSelect(1);
    expect(useShelfStore.getState().selectedIds).toContain(1);

    await store.removeItem(1);

    expect(useShelfStore.getState().items.length).toBe(1);
    expect(useShelfStore.getState().items[0].id).toBe(2);
    expect(useShelfStore.getState().selectedIds).not.toContain(1);
  });

  it('clears all shelf items and selection', async () => {
    const store = useShelfStore.getState();
    await store.addItems([
      { id: 1, kind: 'image', name: 'IMG_01', folderId: 1, addedAt: '2026', faceCount: 0 },
      { id: 2, kind: 'video', name: 'VID_02', folderId: 1, addedAt: '2026', faceCount: 2 },
    ]);

    store.selectAll();
    expect(useShelfStore.getState().selectedIds.length).toBe(2);

    await store.clearShelf();

    expect(useShelfStore.getState().items.length).toBe(0);
    expect(useShelfStore.getState().selectedIds.length).toBe(0);
  });

  it('handles multi-selection actions (toggleSelect, selectAll, clearSelection)', async () => {
    const store = useShelfStore.getState();
    await store.addItems([
      { id: 1, kind: 'image', name: 'IMG_01', folderId: 1, addedAt: '2026', faceCount: 0 },
      { id: 2, kind: 'video', name: 'VID_02', folderId: 1, addedAt: '2026', faceCount: 2 },
      { id: 3, kind: 'image', name: 'IMG_03', folderId: 1, addedAt: '2026', faceCount: 1 },
    ]);

    store.toggleSelect(1);
    expect(useShelfStore.getState().selectedIds).toEqual([1]);

    store.toggleSelect(1);
    expect(useShelfStore.getState().selectedIds).toEqual([]);

    store.selectAll();
    expect(useShelfStore.getState().selectedIds).toEqual([1, 2, 3]);

    store.clearSelection();
    expect(useShelfStore.getState().selectedIds).toEqual([]);
  });

  it('triggers startDrag with appropriate file paths', async () => {
    const mockStartDrag = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).window = {
      snapsort: {
        startNativeDrag: mockStartDrag,
      },
    };

    const store = useShelfStore.getState();
    await store.addItems([
      { id: 1, kind: 'image', name: 'IMG_01', folderId: 1, addedAt: '2026', faceCount: 0 },
      { id: 2, kind: 'video', name: 'VID_02', folderId: 1, addedAt: '2026', faceCount: 2 },
    ]);

    // Drag single item
    await store.startDrag([2]);
    expect(mockStartDrag).toHaveBeenCalledWith(['/media/VID_02.mp4']);

    // Drag selected
    mockStartDrag.mockClear();
    store.selectAll();
    await store.startDrag();
    expect(mockStartDrag).toHaveBeenCalledWith(['/media/IMG_01.jpg', '/media/VID_02.mp4']);

    delete (globalThis as any).window;
  });

  it('toggles alwaysOnTop pin status', async () => {
    const mockTogglePin = vi.fn().mockResolvedValue(false);
    (globalThis as any).window = {
      snapsort: {
        toggleShelfPin: mockTogglePin,
      },
    };

    const store = useShelfStore.getState();
    await store.togglePin();

    expect(mockTogglePin).toHaveBeenCalled();
    expect(useShelfStore.getState().isPinned).toBe(false);

    delete (globalThis as any).window;
  });
});
