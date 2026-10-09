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

export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

export function getInitialThemePreference(): ThemePreference {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem('snapsort-theme-preference');
    if (saved === 'system' || saved === 'light' || saved === 'dark') {
      return saved as ThemePreference;
    }
  }
  return 'system';
}

export function resolveEffectiveTheme(pref: ThemePreference): EffectiveTheme {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export function applyThemeToDocument(theme: EffectiveTheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }
}

// Initial hydration sync
if (typeof window !== 'undefined') {
  applyThemeToDocument(resolveEffectiveTheme(getInitialThemePreference()));
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

  // View navigation
  currentView: 'library' | 'people' | 'person-detail' | 'media-detail';
  selectedPersonId: number | null;
  selectedMediaId: number | null;
  currentMediaTimestamp: number;
  isPlaying: boolean;
  showDetections: boolean;
  hoveredEntityId: string | null;
  inspectorTab: 'categorized' | 'timeline';
  customPeopleNames: Record<number, string>;

  openMediaDetail: (id: number) => void;
  closeMediaDetail: () => void;
  seekToTimestamp: (ts: number) => void;
  togglePlayPause: () => void;
  setIsPlaying: (playing: boolean) => void;
  setShowDetections: (show: boolean) => void;
  setHoveredEntityId: (id: string | null) => void;
  setInspectorTab: (tab: 'categorized' | 'timeline') => void;
  nextMedia: (items: Array<{ id: number }>) => void;
  prevMedia: (items: Array<{ id: number }>) => void;

  navigateToPeople: () => void;
  navigateToPersonDetail: (id: number) => void;
  navigateToLibrary: () => void;
  setPersonName: (id: number, name: string) => void;
  togglePersonFilter: (personId: number) => void;
  filterByPersonAndNavigate: (personId: number) => void;

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

  // Theme
  themePreference: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setThemePreference: (pref: ThemePreference) => void;
  cycleTheme: () => void;
  initThemeListener: () => () => void;
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

  currentView: 'library',
  selectedPersonId: null,
  selectedMediaId: null,
  currentMediaTimestamp: 0,
  isPlaying: false,
  showDetections: true,
  hoveredEntityId: null,
  inspectorTab: 'categorized',
  customPeopleNames: {},

  openMediaDetail: (id: number) =>
    set({
      currentView: 'media-detail',
      selectedMediaId: id,
      currentMediaTimestamp: 0,
      isPlaying: false,
      hoveredEntityId: null,
    }),

  closeMediaDetail: () =>
    set({
      currentView: 'library',
      selectedMediaId: null,
      isPlaying: false,
      hoveredEntityId: null,
    }),

  seekToTimestamp: (ts: number) =>
    set({
      currentMediaTimestamp: Math.max(0, ts),
    }),

  togglePlayPause: () =>
    set((state) => ({ isPlaying: !state.isPlaying })),

  setIsPlaying: (isPlaying: boolean) =>
    set({ isPlaying }),

  setShowDetections: (showDetections: boolean) =>
    set({ showDetections }),

  setHoveredEntityId: (hoveredEntityId: string | null) =>
    set({ hoveredEntityId }),

  setInspectorTab: (inspectorTab: 'categorized' | 'timeline') =>
    set({ inspectorTab }),

  nextMedia: (items: Array<{ id: number }>) =>
    set((state) => {
      if (!state.selectedMediaId || items.length === 0) return {};
      const currentIndex = items.findIndex((item) => item.id === state.selectedMediaId);
      if (currentIndex === -1) return {};
      const nextIndex = (currentIndex + 1) % items.length;
      return {
        selectedMediaId: items[nextIndex].id,
        currentMediaTimestamp: 0,
        isPlaying: false,
        hoveredEntityId: null,
      };
    }),

  prevMedia: (items: Array<{ id: number }>) =>
    set((state) => {
      if (!state.selectedMediaId || items.length === 0) return {};
      const currentIndex = items.findIndex((item) => item.id === state.selectedMediaId);
      if (currentIndex === -1) return {};
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      return {
        selectedMediaId: items[prevIndex].id,
        currentMediaTimestamp: 0,
        isPlaying: false,
        hoveredEntityId: null,
      };
    }),

  navigateToPeople: () =>
    set({
      currentView: 'people',
      selectedPersonId: null,
    }),

  navigateToPersonDetail: (id: number) =>
    set({
      currentView: 'person-detail',
      selectedPersonId: id,
    }),

  navigateToLibrary: () =>
    set({
      currentView: 'library',
      selectedPersonId: null,
    }),

  setPersonName: (id: number, name: string) =>
    set((state) => {
      const trimmed = name.trim();
      return {
        customPeopleNames: {
          ...state.customPeopleNames,
          [id]: trimmed,
        },
      };
    }),

  togglePersonFilter: (personId: number) =>
    set((state) => {
      const existingIndex = state.filters.findIndex((f) => f.kind === 'person');
      if (existingIndex === -1) {
        return {
          filters: [
            ...state.filters,
            { kind: 'person', ids: [personId], match: 'all', source: 'user' },
          ],
          activeQuickActionId: null,
        };
      }
      const existing = state.filters[existingIndex] as Extract<Filter, { kind: 'person' }>;
      const hasId = existing.ids.includes(personId);
      const newIds = hasId
        ? existing.ids.filter((id) => id !== personId)
        : [...existing.ids, personId];

      if (newIds.length === 0) {
        return {
          filters: state.filters.filter((_, idx) => idx !== existingIndex),
          activeQuickActionId: null,
        };
      }
      const updatedFilters = [...state.filters];
      updatedFilters[existingIndex] = {
        ...existing,
        ids: newIds,
      };
      return {
        filters: updatedFilters,
        activeQuickActionId: null,
      };
    }),

  filterByPersonAndNavigate: (personId: number) =>
    set((state) => {
      const withoutPerson = state.filters.filter((f) => f.kind !== 'person');
      return {
        currentView: 'library',
        selectedPersonId: null,
        filters: [
          ...withoutPerson,
          { kind: 'person', ids: [personId], match: 'all', source: 'user' },
        ],
        activeQuickActionId: null,
      };
    }),

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

  // Theme Implementation
  themePreference: getInitialThemePreference(),
  effectiveTheme: resolveEffectiveTheme(getInitialThemePreference()),

  setThemePreference: (pref: ThemePreference) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('snapsort-theme-preference', pref);
    }
    const effective = resolveEffectiveTheme(pref);
    applyThemeToDocument(effective);
    set({ themePreference: pref, effectiveTheme: effective });
  },

  cycleTheme: () => {
    const current = get().themePreference;
    const next: ThemePreference =
      current === 'system' ? 'dark' : current === 'dark' ? 'light' : 'system';
    get().setThemePreference(next);
  },

  initThemeListener: () => {
    const initialPref = get().themePreference;
    const initialEffective = resolveEffectiveTheme(initialPref);
    applyThemeToDocument(initialEffective);
    set({ effectiveTheme: initialEffective });

    if (typeof window === 'undefined' || !window.matchMedia) {
      return () => {};
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => {
      if (get().themePreference === 'system') {
        const newTheme: EffectiveTheme = e.matches ? 'dark' : 'light';
        applyThemeToDocument(newTheme);
        set({ effectiveTheme: newTheme });
      }
    };
    mediaQuery.addEventListener('change', listener);
    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  },
}));
