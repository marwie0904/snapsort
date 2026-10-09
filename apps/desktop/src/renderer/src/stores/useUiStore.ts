import { create } from 'zustand';
import type { Filter, LibrarySearch } from '@snapsort/contract';

interface UiState {
  scope: 'all' | 'images' | 'videos';
  q: string;
  filters: Filter[];
  sort: 'newest' | 'oldest' | 'relevance' | 'name' | 'similarity';
  view: 'filter' | 'highlight';
  aiPanelOpen: boolean;

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
  scope: 'all',
  q: '',
  // Default to Groom + Bride active filter matching reference screenshot
  filters: [
    { kind: 'person', ids: [1, 2], match: 'all', source: 'ai' },
  ],
  sort: 'newest',
  view: 'highlight', // Default to highlight mode to match reference screenshot!
  aiPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 1200 : true,

  setScope: (scope) => set({ scope }),
  setQ: (q) => set({ q }),
  setSort: (sort) => set({ sort }),
  setView: (view) => set({ view }),
  toggleAiPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
  setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  addFilter: (filter) =>
    set((state) => ({ filters: [...state.filters, filter] })),
  removeFilter: (index) =>
    set((state) => ({
      filters: state.filters.filter((_, i) => i !== index),
    })),
  clearFilters: () => set({ filters: [] }),
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
