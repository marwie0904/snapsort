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
});

