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
});
