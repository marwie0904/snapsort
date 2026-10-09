import { describe, it, expect, beforeEach } from 'vitest';
import { useUiStore } from '../stores/useUiStore';

describe('useUiStore Quick Actions', () => {
  beforeEach(() => {
    useUiStore.setState({
      filters: [],
      quickActions: [],
      activeQuickActionId: null,
      scope: 'all',
      view: 'filter',
    });
  });

  it('adds a quick action and activates it', () => {
    const action = useUiStore.getState().addQuickAction('Bride with Flowers', [
      { kind: 'person', ids: [2], match: 'all', source: 'ai' },
      { kind: 'label', module: 'objects', labelId: 'flowers', source: 'ai' },
    ]);

    const state = useUiStore.getState();
    expect(state.quickActions.length).toBe(1);
    expect(state.quickActions[0].id).toBe(action.id);
    expect(state.quickActions[0].name).toBe('Bride with Flowers');
    expect(state.activeQuickActionId).toBe(action.id);
  });

  it('applies a quick action, replacing current filters', () => {
    // Set some initial noise filter
    useUiStore.getState().setFilters([{ kind: 'person', ids: [3], match: 'all', source: 'user' }]);

    const action = useUiStore.getState().addQuickAction(
      'Bride with Flowers',
      [
        { kind: 'person', ids: [2], match: 'all', source: 'ai' },
        { kind: 'label', module: 'objects', labelId: 'flowers', source: 'ai' },
      ],
      'images',
      'highlight'
    );

    useUiStore.getState().applyQuickAction(action);

    const state = useUiStore.getState();
    expect(state.filters.length).toBe(2);
    expect(state.filters).toEqual(action.filters);
    expect(state.scope).toBe('images');
    expect(state.view).toBe('highlight');
    expect(state.activeQuickActionId).toBe(action.id);
  });

  it('renames a quick action', () => {
    const action = useUiStore.getState().addQuickAction('Old Name', []);
    useUiStore.getState().renameQuickAction(action.id, 'New Name');

    const state = useUiStore.getState();
    expect(state.quickActions[0].name).toBe('New Name');
  });

  it('removes a quick action and resets active id if it was active', () => {
    const action = useUiStore.getState().addQuickAction('To Delete', []);
    expect(useUiStore.getState().activeQuickActionId).toBe(action.id);

    useUiStore.getState().removeQuickAction(action.id);

    const state = useUiStore.getState();
    expect(state.quickActions.length).toBe(0);
    expect(state.activeQuickActionId).toBeNull();
  });

  it('navigates between library, people view, and person detail', () => {
    expect(useUiStore.getState().currentView).toBe('library');

    useUiStore.getState().navigateToPeople();
    expect(useUiStore.getState().currentView).toBe('people');
    expect(useUiStore.getState().selectedPersonId).toBeNull();

    useUiStore.getState().navigateToPersonDetail(3);
    expect(useUiStore.getState().currentView).toBe('person-detail');
    expect(useUiStore.getState().selectedPersonId).toBe(3);

    useUiStore.getState().navigateToLibrary();
    expect(useUiStore.getState().currentView).toBe('library');
    expect(useUiStore.getState().selectedPersonId).toBeNull();
  });

  it('sets custom person name and toggles person filters', () => {
    useUiStore.getState().setPersonName(6, 'Uncle Bob');
    expect(useUiStore.getState().customPeopleNames[6]).toBe('Uncle Bob');

    // Toggle person 6 into filters
    useUiStore.getState().togglePersonFilter(6);
    let personFilter = useUiStore.getState().filters.find((f) => f.kind === 'person');
    expect(personFilter).toBeDefined();
    if (personFilter && personFilter.kind === 'person') {
      expect(personFilter.ids).toContain(6);
    }

    // Toggle person 3 in
    useUiStore.getState().togglePersonFilter(3);
    personFilter = useUiStore.getState().filters.find((f) => f.kind === 'person');
    if (personFilter && personFilter.kind === 'person') {
      expect(personFilter.ids).toEqual([6, 3]);
    }

    // Toggle person 6 out
    useUiStore.getState().togglePersonFilter(6);
    personFilter = useUiStore.getState().filters.find((f) => f.kind === 'person');
    if (personFilter && personFilter.kind === 'person') {
      expect(personFilter.ids).toEqual([3]);
    }

    // filterByPersonAndNavigate navigates to library and sets single person filter
    useUiStore.getState().navigateToPeople();
    useUiStore.getState().filterByPersonAndNavigate(6);
    expect(useUiStore.getState().currentView).toBe('library');
    personFilter = useUiStore.getState().filters.find((f) => f.kind === 'person');
    if (personFilter && personFilter.kind === 'person') {
      expect(personFilter.ids).toEqual([6]);
    }
  });

  it('handles media preview navigation and playback state', () => {
    // Open media detail
    useUiStore.getState().openMediaDetail(4);
    expect(useUiStore.getState().currentView).toBe('media-detail');
    expect(useUiStore.getState().selectedMediaId).toBe(4);
    expect(useUiStore.getState().currentMediaTimestamp).toBe(0);
    expect(useUiStore.getState().isPlaying).toBe(false);

    // Seek timestamp
    useUiStore.getState().seekToTimestamp(12);
    expect(useUiStore.getState().currentMediaTimestamp).toBe(12);

    // Playback toggle
    useUiStore.getState().togglePlayPause();
    expect(useUiStore.getState().isPlaying).toBe(true);

    // Toggle detections
    useUiStore.getState().setShowDetections(false);
    expect(useUiStore.getState().showDetections).toBe(false);

    // Next / Prev navigation
    const items = [{ id: 1 }, { id: 4 }, { id: 6 }];
    useUiStore.getState().nextMedia(items);
    expect(useUiStore.getState().selectedMediaId).toBe(6);

    useUiStore.getState().prevMedia(items);
    expect(useUiStore.getState().selectedMediaId).toBe(4);

    // Close detail returns to library
    useUiStore.getState().closeMediaDetail();
    expect(useUiStore.getState().currentView).toBe('library');
    expect(useUiStore.getState().selectedMediaId).toBeNull();
  });

  describe('Theme Management', () => {
    const storageMap = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => storageMap.get(key) ?? null,
      setItem: (key: string, val: string) => storageMap.set(key, val),
      removeItem: (key: string) => storageMap.delete(key),
      clear: () => storageMap.clear(),
    };

    const mockClassList = {
      classes: new Set<string>(),
      add: (cls: string) => mockClassList.classes.add(cls),
      remove: (cls: string) => mockClassList.classes.delete(cls),
      contains: (cls: string) => mockClassList.classes.has(cls),
    };

    const mockAttributes = new Map<string, string>();
    const mockDocument = {
      documentElement: {
        setAttribute: (attr: string, val: string) => mockAttributes.set(attr, val),
        getAttribute: (attr: string) => mockAttributes.get(attr) ?? null,
        classList: mockClassList,
      },
    };

    beforeEach(() => {
      storageMap.clear();
      mockClassList.classes.clear();
      mockAttributes.clear();

      (globalThis as any).localStorage = mockLocalStorage;
      (globalThis as any).window = {
        localStorage: mockLocalStorage,
        matchMedia: (query: string) => ({
          matches: false,
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      };
      (globalThis as any).document = mockDocument;

      useUiStore.getState().setThemePreference('system');
    });

    it('defaults to system theme preference and computes effective theme', () => {
      const state = useUiStore.getState();
      expect(state.themePreference).toBe('system');
      expect(['light', 'dark']).toContain(state.effectiveTheme);
    });

    it('sets theme preference to light and updates DOM attributes', () => {
      useUiStore.getState().setThemePreference('light');
      const state = useUiStore.getState();
      expect(state.themePreference).toBe('light');
      expect(state.effectiveTheme).toBe('light');
      expect(mockLocalStorage.getItem('snapsort-theme-preference')).toBe('light');
      expect(mockDocument.documentElement.getAttribute('data-theme')).toBe('light');
      expect(mockDocument.documentElement.classList.contains('light')).toBe(true);
      expect(mockDocument.documentElement.classList.contains('dark')).toBe(false);
    });

    it('sets theme preference to dark and updates DOM attributes', () => {
      useUiStore.getState().setThemePreference('dark');
      const state = useUiStore.getState();
      expect(state.themePreference).toBe('dark');
      expect(state.effectiveTheme).toBe('dark');
      expect(mockLocalStorage.getItem('snapsort-theme-preference')).toBe('dark');
      expect(mockDocument.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(mockDocument.documentElement.classList.contains('dark')).toBe(true);
      expect(mockDocument.documentElement.classList.contains('light')).toBe(false);
    });

    it('cycles through system -> dark -> light -> system', () => {
      useUiStore.getState().setThemePreference('system');
      expect(useUiStore.getState().themePreference).toBe('system');

      useUiStore.getState().cycleTheme();
      expect(useUiStore.getState().themePreference).toBe('dark');

      useUiStore.getState().cycleTheme();
      expect(useUiStore.getState().themePreference).toBe('light');

      useUiStore.getState().cycleTheme();
      expect(useUiStore.getState().themePreference).toBe('system');
    });

    it('initializes theme listener and returns cleanup function', () => {
      const cleanup = useUiStore.getState().initThemeListener();
      expect(typeof cleanup).toBe('function');
      cleanup();
    });
  });

  describe('Facet Actions (People, Scenes, Tags)', () => {
    beforeEach(() => {
      useUiStore.setState({
        filters: [],
        currentView: 'library',
      });
    });

    it('toggles scene facet items with any match default', () => {
      useUiStore.getState().toggleFacetItem('scene', 'vows');
      let sel = useUiStore.getState().getFacetSelection('scene');
      expect(sel.ids).toEqual(['vows']);
      expect(sel.match).toBe('any');

      useUiStore.getState().toggleFacetItem('scene', 'ceremony');
      sel = useUiStore.getState().getFacetSelection('scene');
      expect(sel.ids).toEqual(['vows', 'ceremony']);

      useUiStore.getState().setFacetMatch('scene', 'all');
      sel = useUiStore.getState().getFacetSelection('scene');
      expect(sel.match).toBe('all');

      useUiStore.getState().toggleFacetItem('scene', 'vows');
      useUiStore.getState().toggleFacetItem('scene', 'ceremony');
      sel = useUiStore.getState().getFacetSelection('scene');
      expect(sel.ids).toEqual([]);
    });

    it('toggles tag/label facet items with all match default', () => {
      useUiStore.getState().toggleFacetItem('label', 'dress');
      let sel = useUiStore.getState().getFacetSelection('label');
      expect(sel.ids).toEqual(['dress']);
      expect(sel.match).toBe('all');

      useUiStore.getState().toggleFacetItem('label', 'suit');
      sel = useUiStore.getState().getFacetSelection('label');
      expect(sel.ids).toEqual(['dress', 'suit']);
    });

    it('toggles place facet item', () => {
      useUiStore.getState().toggleFacetItem('place', 'Tokyo');
      let sel = useUiStore.getState().getFacetSelection('place');
      expect(sel.ids).toEqual(['Tokyo']);

      // Clicking another place replaces it
      useUiStore.getState().toggleFacetItem('place', 'Kyoto');
      sel = useUiStore.getState().getFacetSelection('place');
      expect(sel.ids).toEqual(['Kyoto']);

      // Clicking same place deselects it
      useUiStore.getState().toggleFacetItem('place', 'Kyoto');
      sel = useUiStore.getState().getFacetSelection('place');
      expect(sel.ids).toEqual([]);
    });

    it('supports similarTo reverse image search in getSearchQuery', () => {
      useUiStore.getState().setSimilarTo({ imageRef: 'ref-123', source: 'user' });
      expect(useUiStore.getState().sort).toBe('similarity');

      const query = useUiStore.getState().getSearchQuery();
      expect(query.similarTo).toEqual({ imageRef: 'ref-123', source: 'user' });
      expect(query.sort).toBe('similarity');

      // Clearing similarTo
      useUiStore.getState().setSimilarTo(null);
      const queryAfter = useUiStore.getState().getSearchQuery();
      expect(queryAfter.similarTo).toBeUndefined();
    });

    it('filters by facet and navigates to library view', () => {
      useUiStore.getState().navigateToScenes();
      expect(useUiStore.getState().currentView).toBe('scenes');

      useUiStore.getState().filterByFacetAndNavigate('scene', ['vows'], 'any');
      expect(useUiStore.getState().currentView).toBe('library');
      const sel = useUiStore.getState().getFacetSelection('scene');
      expect(sel.ids).toEqual(['vows']);
    });
  });
});


