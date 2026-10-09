import { create } from 'zustand';
import { getLabelFilterIds, type Filter, type LibrarySearch, type Match, type SimilarTo } from '@snapsort/contract';

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
  similarTo: SimilarTo | null;
  filters: Filter[];
  quickActions: QuickAction[];
  activeQuickActionId: string | null;
  sort: 'newest' | 'oldest' | 'relevance' | 'name' | 'similarity';
  view: 'filter' | 'highlight';
  aiPanelOpen: boolean;

  // View navigation
  currentView: 'library' | 'people' | 'person-detail' | 'media-detail' | 'scenes' | 'tags' | 'places';
  selectedPersonId: number | null;
  selectedMediaId: number | null;
  currentMediaTimestamp: number;
  isPlaying: boolean;
  showDetections: boolean;
  hoveredEntityId: string | null;
  inspectorTab: 'categorized' | 'timeline';
  customPeopleNames: Record<number, string>;

  openMediaDetail: (id: number, ts?: number) => void;
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
  navigateToScenes: () => void;
  navigateToTags: () => void;
  navigateToPlaces: () => void;
  navigateToPersonDetail: (id: number) => void;
  navigateToLibrary: () => void;
  setPersonName: (id: number, name: string) => void;
  togglePersonFilter: (personId: number) => void;
  filterByPersonAndNavigate: (personId: number) => void;

  // Facet actions (People, Scenes, Objects, Places)
  toggleFacetItem: (kind: 'person' | 'scene' | 'label' | 'place', id: number | string) => void;
  setFacetMatch: (kind: 'person' | 'scene' | 'label' | 'place', match: 'all' | 'any') => void;
  filterByFacetAndNavigate: (
    kind: 'person' | 'scene' | 'label' | 'place',
    ids: Array<number | string>,
    match?: 'all' | 'any'
  ) => void;
  getFacetSelection: (kind: 'person' | 'scene' | 'label' | 'place') => {
    ids: Array<number | string>;
    match: 'all' | 'any';
  };

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setActiveTab: (tab: 'library' | 'folders') => void;
  selectFolder: (id: number | null, name: string | null, driveName?: string | null) => void;
  clearSelectedFolder: () => void;

  setScope: (scope: 'all' | 'images' | 'videos') => void;
  setQ: (q: string) => void;
  setSimilarTo: (similarTo: SimilarTo | null) => void;
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
  similarTo: null,
  filters: [],
  quickActions: [],
  activeQuickActionId: null,
  sort: 'newest',
  view: 'filter',
  aiPanelOpen: false, // the assistant is a local demo until the chat backend lands

  currentView: 'library',
  selectedPersonId: null,
  selectedMediaId: null,
  currentMediaTimestamp: 0,
  isPlaying: false,
  showDetections: true,
  hoveredEntityId: null,
  inspectorTab: 'categorized',
  customPeopleNames: {},

  openMediaDetail: (id: number, ts?: number) =>
    set({
      currentView: 'media-detail',
      selectedMediaId: id,
      currentMediaTimestamp: ts ?? 0,
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

  navigateToScenes: () =>
    set({
      currentView: 'scenes',
      selectedPersonId: null,
    }),

  navigateToTags: () =>
    set({
      currentView: 'tags',
      selectedPersonId: null,
    }),

  navigateToPlaces: () =>
    set({
      currentView: 'places',
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

  toggleFacetItem: (kind, id) =>
    set((state) => {
      const withoutKind = state.filters.filter((f) => f.kind !== kind);
      const existing = state.filters.find((f) => f.kind === kind);

      if (kind === 'person') {
        const numId = Number(id);
        const existingFilter = existing as Extract<Filter, { kind: 'person' }> | undefined;
        const currentIds = existingFilter?.ids ?? [];
        const match = existingFilter?.match ?? 'all';
        const newIds = currentIds.includes(numId)
          ? currentIds.filter((i) => i !== numId)
          : [...currentIds, numId];
        if (newIds.length === 0) {
          return { filters: withoutKind, activeQuickActionId: null };
        }
        return {
          filters: [...withoutKind, { kind: 'person', ids: newIds, match, source: 'user' }],
          activeQuickActionId: null,
        };
      }

      if (kind === 'scene') {
        const strId = String(id);
        const existingFilter = existing as Extract<Filter, { kind: 'scene' }> | undefined;
        const currentIds = existingFilter?.ids ?? [];
        const match = existingFilter?.match ?? 'any';
        const newIds = currentIds.includes(strId)
          ? currentIds.filter((i) => i !== strId)
          : [...currentIds, strId];
        if (newIds.length === 0) {
          return { filters: withoutKind, activeQuickActionId: null };
        }
        return {
          filters: [...withoutKind, { kind: 'scene', ids: newIds, match, source: 'user' }],
          activeQuickActionId: null,
        };
      }

      if (kind === 'label') {
        const strId = String(id);
        const existingFilter = existing as Extract<Filter, { kind: 'label' }> | undefined;
        const currentIds = existingFilter ? getLabelFilterIds(existingFilter) : [];
        const match = existingFilter?.match ?? 'all';
        const newIds = currentIds.includes(strId)
          ? currentIds.filter((i) => i !== strId)
          : [...currentIds, strId];
        if (newIds.length === 0) {
          return { filters: withoutKind, activeQuickActionId: null };
        }
        return {
          filters: [
            ...withoutKind,
            {
              kind: 'label',
              module: 'objects',
              labelId: newIds[0],
              labelIds: newIds,
              match,
              source: 'user',
            },
          ],
          activeQuickActionId: null,
        };
      }

      if (kind === 'place') {
        const strName = String(id);
        const existingFilter = existing as Extract<Filter, { kind: 'place' }> | undefined;
        if (existingFilter && existingFilter.name === strName) {
          return { filters: withoutKind, activeQuickActionId: null };
        }
        return {
          filters: [...withoutKind, { kind: 'place', name: strName, source: 'user' }],
          activeQuickActionId: null,
        };
      }

      return {};
    }),

  setFacetMatch: (kind, match) =>
    set((state) => {
      const existingIndex = state.filters.findIndex((f) => f.kind === kind);
      if (existingIndex === -1) return {};
      const updatedFilters = [...state.filters];
      const existing = updatedFilters[existingIndex];
      if (kind === 'person' && existing.kind === 'person') {
        updatedFilters[existingIndex] = { ...existing, match };
      } else if (kind === 'scene' && existing.kind === 'scene') {
        updatedFilters[existingIndex] = { ...existing, match };
      } else if (kind === 'label' && existing.kind === 'label') {
        updatedFilters[existingIndex] = { ...existing, match };
      }
      return { filters: updatedFilters, activeQuickActionId: null };
    }),

  filterByFacetAndNavigate: (kind, ids, match) =>
    set((state) => {
      const withoutKind = state.filters.filter((f) => f.kind !== kind);
      let newFilter: Filter | null = null;
      if (ids.length > 0) {
        if (kind === 'person') {
          newFilter = {
            kind: 'person',
            ids: ids.map(Number),
            match: match ?? 'all',
            source: 'user',
          };
        } else if (kind === 'scene') {
          newFilter = {
            kind: 'scene',
            ids: ids.map(String),
            match: match ?? 'any',
            source: 'user',
          };
        } else if (kind === 'label') {
          const strIds = ids.map(String);
          newFilter = {
            kind: 'label',
            module: 'objects',
            labelId: strIds[0],
            labelIds: strIds,
            match: match ?? 'all',
            source: 'user',
          };
        } else if (kind === 'place') {
          newFilter = {
            kind: 'place',
            name: String(ids[0]),
            source: 'user',
          };
        }
      }
      return {
        currentView: 'library',
        selectedPersonId: null,
        filters: newFilter ? [...withoutKind, newFilter] : withoutKind,
        activeQuickActionId: null,
      };
    }),

  getFacetSelection: (kind) => {
    const state = get();
    if (kind === 'person') {
      const f = state.filters.find((filter) => filter.kind === 'person') as
        | Extract<Filter, { kind: 'person' }>
        | undefined;
      return {
        ids: f?.ids ?? [],
        match: f?.match ?? 'all',
      };
    }
    if (kind === 'scene') {
      const f = state.filters.find((filter) => filter.kind === 'scene') as
        | Extract<Filter, { kind: 'scene' }>
        | undefined;
      return {
        ids: f?.ids ?? [],
        match: f?.match ?? 'any',
      };
    }
    if (kind === 'label') {
      const f = state.filters.find((filter) => filter.kind === 'label') as
        | Extract<Filter, { kind: 'label' }>
        | undefined;
      return {
        ids: f ? getLabelFilterIds(f) : [],
        match: f?.match ?? 'all',
      };
    }
    if (kind === 'place') {
      const f = state.filters.find((filter) => filter.kind === 'place') as
        | Extract<Filter, { kind: 'place' }>
        | undefined;
      return {
        ids: f ? [f.name] : [],
        match: 'all',
      };
    }
    return { ids: [], match: 'all' };
  },

  togglePersonFilter: (personId: number) => {
    get().toggleFacetItem('person', personId);
  },

  filterByPersonAndNavigate: (personId: number) => {
    get().filterByFacetAndNavigate('person', [personId]);
  },

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
  // Text search ranks by relevance; clearing it goes back to newest
  setQ: (q) =>
    set((state) => ({
      q,
      similarTo: q.trim() ? null : state.similarTo, // one search at a time: text or image
      sort: q.trim() ? (state.sort === 'newest' ? 'relevance' : state.sort) : state.sort === 'relevance' ? 'newest' : state.sort,
    })),
  setSimilarTo: (similarTo) =>
    set((state) => ({
      similarTo,
      q: similarTo ? '' : state.q,
      sort: similarTo ? 'similarity' : state.sort === 'similarity' ? 'newest' : state.sort,
    })),
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
      similarTo: s.similarTo || undefined,
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
