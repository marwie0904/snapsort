import { create } from 'zustand';
import type { ShelfItem, MediaSummary, MediaDetail } from '@snapsort/contract';

function getSnapsort() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return null;
}

export function toShelfItem(
  input: ShelfItem | MediaSummary | MediaDetail
): ShelfItem {
  const path =
    'path' in input && typeof input.path === 'string'
      ? input.path
      : `/media/${input.name}${input.kind === 'video' ? '.mp4' : '.jpg'}`;

  return {
    id: input.id,
    kind: input.kind,
    name: input.name,
    path,
    durationS: input.durationS,
    thumbUrl:
      'thumbUrl' in input && input.thumbUrl
        ? input.thumbUrl
        : input.kind === 'video'
        ? `snapsort-media://frame/${input.id}/1`
        : `snapsort-media://preview/${input.id}`,
  };
}

interface ShelfState {
  items: ShelfItem[];
  selectedIds: number[];
  isPinned: boolean;

  openShelf: () => Promise<void>;
  closeShelf: () => Promise<void>;
  togglePin: () => Promise<void>;
  addItem: (input: ShelfItem | MediaSummary | MediaDetail) => Promise<void>;
  addItems: (inputs: (ShelfItem | MediaSummary | MediaDetail)[]) => Promise<void>;
  removeItem: (id: number) => Promise<void>;
  clearShelf: () => Promise<void>;

  toggleSelect: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;

  startDrag: (ids?: number[]) => Promise<void>;
  setItems: (items: ShelfItem[]) => void;
  initShelfSync: () => () => void;
}

export const useShelfStore = create<ShelfState>((set, get) => ({
  items: [],
  selectedIds: [],
  isPinned: true,

  openShelf: async () => {
    const api = getSnapsort();
    console.log('[shelf] openShelf called, api:', api);
    if (api && typeof api.openShelfWindow === 'function') {
      try {
        await api.openShelfWindow();
        return;
      } catch (err) {
        console.error('[shelf] openShelfWindow error:', err);
      }
    }

    // Fallback if running in web browser or old instance without IPC bridge
    if (typeof window !== 'undefined') {
      console.warn('[shelf] Falling back to window.open for shelf popup');
      const url = `${window.location.origin}${window.location.pathname}?view=shelf#shelf`;
      window.open(url, 'snapsort-shelf', 'width=420,height=580,menubar=no,toolbar=no,location=no,status=no');
    }
  },

  closeShelf: async () => {
    const api = getSnapsort();
    if (api?.closeShelfWindow) {
      await api.closeShelfWindow();
    }
  },

  togglePin: async () => {
    const api = getSnapsort();
    if (api?.toggleShelfPin) {
      const next = await api.toggleShelfPin();
      set({ isPinned: next });
    } else {
      set((s) => ({ isPinned: !s.isPinned }));
    }
  },

  addItem: async (input) => {
    const item = toShelfItem(input);
    const current = get().items;
    if (current.some((i) => i.id === item.id)) return;

    const api = getSnapsort();
    if (api?.addToShelf) {
      const updated = await api.addToShelf(item);
      set({ items: updated });
    } else {
      set((s) => ({ items: [...s.items, item] }));
    }
  },

  addItems: async (inputs) => {
    const formatted = inputs.map(toShelfItem);
    const current = get().items;
    const toAdd = formatted.filter((item) => !current.some((i) => i.id === item.id));
    if (toAdd.length === 0) return;

    const api = getSnapsort();
    if (api?.addToShelf) {
      const updated = await api.addToShelf(toAdd);
      set({ items: updated });
    } else {
      set((s) => ({ items: [...s.items, ...toAdd] }));
    }
  },

  removeItem: async (id) => {
    const api = getSnapsort();
    if (api?.removeFromShelf) {
      const updated = await api.removeFromShelf(id);
      set((s) => ({
        items: updated,
        selectedIds: s.selectedIds.filter((sid) => sid !== id),
      }));
    } else {
      set((s) => ({
        items: s.items.filter((i) => i.id !== id),
        selectedIds: s.selectedIds.filter((sid) => sid !== id),
      }));
    }
  },

  clearShelf: async () => {
    const api = getSnapsort();
    if (api?.clearShelf) {
      await api.clearShelf();
    }
    set({ items: [], selectedIds: [] });
  },

  toggleSelect: (id) => {
    set((s) => {
      const exists = s.selectedIds.includes(id);
      return {
        selectedIds: exists
          ? s.selectedIds.filter((sid) => sid !== id)
          : [...s.selectedIds, id],
      };
    });
  },

  selectAll: () => {
    set((s) => ({
      selectedIds: s.items.map((i) => i.id),
    }));
  },

  clearSelection: () => {
    set({ selectedIds: [] });
  },

  startDrag: async (ids) => {
    const { items, selectedIds } = get();
    const targetIds = ids && ids.length > 0 ? ids : selectedIds.length > 0 ? selectedIds : items.map((i) => i.id);
    const targetItems = items.filter((i) => targetIds.includes(i.id));
    if (targetItems.length === 0) return;

    const filePaths = targetItems.map((i) => i.path);
    const api = getSnapsort();
    if (api?.startNativeDrag) {
      await api.startNativeDrag(filePaths);
    }
  },

  setItems: (items) => set({ items }),

  initShelfSync: () => {
    const api = getSnapsort();
    if (!api) return () => {};

    // Initial load
    if (api.getShelfItems) {
      api.getShelfItems().then((items) => {
        if (items) set({ items });
      });
    }
    if (api.isShelfPinned) {
      api.isShelfPinned().then((pinned) => {
        set({ isPinned: pinned });
      });
    }

    // Subscribe to IPC sync
    if (api.onShelfSync) {
      const unsubscribe = api.onShelfSync((items) => {
        set({ items });
      });
      return unsubscribe;
    }

    return () => {};
  },
}));
