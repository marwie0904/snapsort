import { create } from 'zustand';
import type { Filter, LibrarySearch } from '@snapsort/contract';

interface UiState {
  sidebarOpen: boolean;
  activeTab: 'library' | 'folders';
  selectedFolderId: number | null;
  selectedFolderName: string | null;
  selectedFolderDrive: string | null;

  scope: 'all' | 'images' | 'videos';
  q: string;
  filters: Filter[];
  sort: 'newest' | 'oldest' | 'relevance' | 'name' | 'similarity';
  view: 'filter' | 'highlight';
  aiPanelOpen: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveTab: (tab: 'library' | 'folders') => void;
  selectFolder: (id: number | null, name: string | null, driveName?: string | null) => void;
  clearSelectedFolder: () => void;

  setScope: (scope: 'all' | 'images' | 'videos') => void;
  setQ: (q: string) => void;
  setSort: (sort: 'newest' | 'oldest' | 'relevance' | 'name' | 'similarity') => void;
  setView: (view: 'filter' | 'highlight') => void;
  toggleAiPanel: () => void;
  setAiPanelOpen: (open: boolean) => void;
  addFilter: (filter: Filter) => void;
  removeFilter: (index: number) => void;
  clearFilters: () => void;
  getSearchQuery: () => LibrarySearch;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: true,
  activeTab: 'library',
  selectedFolderId: null,
  selectedFolderName: null,
  selectedFolderDrive: null,

  scope: 'all',
  q: '',
  // Default to Groom + Bride active filter matching reference screenshot
  filters: [
    { kind: 'person', ids: [1, 2], match: 'all', source: 'ai' },
  ],
  sort: 'newest',
  view: 'highlight', // Default to highlight mode to match reference screenshot!
  aiPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1200 : true,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setActiveTab: (activeTab) => set({ activeTab }),

  selectFolder: (id, name, driveName) =>
    set((state) => {
      if (id === null) {
        return {
          selectedFolderId: null,
          selectedFolderName: null,
          selectedFolderDrive: null,
          filters: state.filters.filter((f) => f.kind !== 'folder'),
        };
      }
      const withoutFolder = state.filters.filter((f) => f.kind !== 'folder');
      return {
        selectedFolderId: id,
        selectedFolderName: name,
        selectedFolderDrive: driveName || null,
        filters: [...withoutFolder, { kind: 'folder', id, source: 'user' }],
      };
    }),

  clearSelectedFolder: () =>
    set((state) => ({
      selectedFolderId: null,
      selectedFolderName: null,
      selectedFolderDrive: null,
      filters: state.filters.filter((f) => f.kind !== 'folder'),
    })),

  setScope: (scope) =>
    set((state) => ({
      scope,
      selectedFolderId: null,
      selectedFolderName: null,
      selectedFolderDrive: null,
      filters: state.filters.filter((f) => f.kind !== 'folder'),
    })),
  setQ: (q) => set({ q }),
  setSort: (sort) => set({ sort }),
  setView: (view) => set({ view }),
  toggleAiPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  addFilter: (filter) =>
    set((state) => ({ filters: [...state.filters, filter] })),
  removeFilter: (index) =>
    set((state) => {
      const removed = state.filters[index];
      const newFilters = state.filters.filter((_, i) => i !== index);
      if (removed && removed.kind === 'folder') {
        return {
          filters: newFilters,
          selectedFolderId: null,
          selectedFolderName: null,
          selectedFolderDrive: null,
        };
      }
      return { filters: newFilters };
    }),
  clearFilters: () =>
    set({
      filters: [],
      selectedFolderId: null,
      selectedFolderName: null,
      selectedFolderDrive: null,
    }),
  getSearchQuery: () => {
    const s = get();
    return {
      scope: s.scope,
      q: s.q || undefined,
      f: s.filters,
      sort: s.sort,
      view: s.view,
    };
  },
}));
