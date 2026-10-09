import { create } from 'zustand';
import type { Filter, LibrarySearch } from '@snapsort/contract';

export interface QuickAction {
  id: string;
  name: string;
  filters: Filter[];
  scope?: 'all' | 'images' | 'videos';
  view?: 'filter' | 'highlight';
  createdAt: string;
}

interface UiState {
  sidebarOpen: boolean;
  activeTab: 'library' | 'folders';
  selectedFolderId: number | null;
  selectedFolderName: string | null;
  selectedFolderDrive: string | null;

  scope: 'all' | 'images' | 'videos';
  q: string;
  filters: Filter[];
  quickActions: QuickAction[];
  activeQuickActionId: string | null;
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
  setFilters: (filters: Filter[], quickActionId?: string | null) => void;
  addQuickAction: (name: string, filters: Filter[], scope?: 'all' | 'images' | 'videos', view?: 'filter' | 'highlight') => QuickAction;
  removeQuickAction: (id: string) => void;
  renameQuickAction: (id: string, name: string) => void;
  applyQuickAction: (action: QuickAction) => void;
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
  quickActions: [
    {
      id: 'qa-default-1',
      name: 'Groom + Bride',
      filters: [
        { kind: 'person', ids: [1, 2], match: 'all', source: 'ai' },
      ],
      scope: 'all',
      view: 'highlight',
      createdAt: new Date().toISOString(),
    },
  ],
  activeQuickActionId: 'qa-default-1',
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
    set((state) => ({
      filters: [...state.filters, filter],
      activeQuickActionId: null,
    })),
  removeFilter: (index) =>
    set((state) => {
      const removed = state.filters[index];
      const newFilters = state.filters.filter((_, i) => i !== index);
      if (removed && removed.kind === 'folder') {
        return {
          filters: newFilters,
          activeQuickActionId: null,
          selectedFolderId: null,
          selectedFolderName: null,
          selectedFolderDrive: null,
        };
      }
      return { filters: newFilters, activeQuickActionId: null };
    }),
  clearFilters: () =>
    set({
      filters: [],
      activeQuickActionId: null,
      selectedFolderId: null,
      selectedFolderName: null,
      selectedFolderDrive: null,
    }),
  setFilters: (filters, quickActionId = null) =>
    set({
      filters,
      activeQuickActionId: quickActionId,
    }),
  addQuickAction: (name, filters, scope = 'all', view = 'filter') => {
    const newAction: QuickAction = {
      id: `qa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Custom Filter',
      filters,
      scope,
      view,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      quickActions: [...state.quickActions, newAction],
      activeQuickActionId: newAction.id,
    }));
    return newAction;
  },
  removeQuickAction: (id) =>
    set((state) => ({
      quickActions: state.quickActions.filter((qa) => qa.id !== id),
      activeQuickActionId: state.activeQuickActionId === id ? null : state.activeQuickActionId,
    })),
  renameQuickAction: (id, name) =>
    set((state) => ({
      quickActions: state.quickActions.map((qa) =>
        qa.id === id ? { ...qa, name: name.trim() || qa.name } : qa
      ),
    })),
  applyQuickAction: (action) =>
    set((state) => ({
      filters: [...action.filters],
      scope: action.scope ?? state.scope,
      view: action.view ?? state.view,
      activeQuickActionId: action.id,
    })),
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
