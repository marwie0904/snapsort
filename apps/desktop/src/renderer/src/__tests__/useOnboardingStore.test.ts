import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingStore, TOUR_STEPS } from '../stores/useOnboardingStore';

// Simple mock for localStorage in Node environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe('useOnboardingStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboardingStore.getState().resetOnboarding();
  });

  it('initializes with welcome open for first-time user', () => {
    const state = useOnboardingStore.getState();
    expect(state.hasSeenWelcome).toBe(false);
    expect(state.welcomeOpen).toBe(true);
    expect(state.tourActive).toBe(false);
    expect(state.tutorialDrawerOpen).toBe(false);
  });

  it('closes welcome modal and marks hasSeenWelcome', () => {
    const store = useOnboardingStore.getState();
    store.closeWelcome();

    const state = useOnboardingStore.getState();
    expect(state.welcomeOpen).toBe(false);
    expect(state.hasSeenWelcome).toBe(true);
    expect(localStorage.getItem('snapsort-welcome-seen')).toBe('true');
  });

  it('starts interactive tour and transitions through steps', () => {
    const store = useOnboardingStore.getState();
    store.startTour();

    let state = useOnboardingStore.getState();
    expect(state.tourActive).toBe(true);
    expect(state.welcomeOpen).toBe(false);
    expect(state.currentStepIndex).toBe(0);

    store.nextTourStep();
    state = useOnboardingStore.getState();
    expect(state.currentStepIndex).toBe(1);

    store.prevTourStep();
    state = useOnboardingStore.getState();
    expect(state.currentStepIndex).toBe(0);

    // Prev step does not go below 0
    store.prevTourStep();
    state = useOnboardingStore.getState();
    expect(state.currentStepIndex).toBe(0);

    // Advance to end
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      store.nextTourStep();
    }
    state = useOnboardingStore.getState();
    expect(state.tourActive).toBe(false);
  });

  it('opens and closes tutorial drawer with specified tab', () => {
    const store = useOnboardingStore.getState();
    store.openTutorialDrawer('shortcuts');

    let state = useOnboardingStore.getState();
    expect(state.tutorialDrawerOpen).toBe(true);
    expect(state.tutorialTab).toBe('shortcuts');
    expect(state.welcomeOpen).toBe(false);

    store.setTutorialTab('buttons');
    state = useOnboardingStore.getState();
    expect(state.tutorialTab).toBe('buttons');

    store.closeTutorialDrawer();
    state = useOnboardingStore.getState();
    expect(state.tutorialDrawerOpen).toBe(false);
  });

  it('supports spotlighting a single element and clearing it', () => {
    const store = useOnboardingStore.getState();
    store.spotlightSingleElement({
      selector: '[data-tour="shelf-button"]',
      title: 'Staging Shelf',
      description: 'Test shelf spotlight',
      shortcut: '⌘⇧S',
    });

    let state = useOnboardingStore.getState();
    expect(state.singleSpotlight).not.toBeNull();
    expect(state.singleSpotlight?.selector).toBe('[data-tour="shelf-button"]');
    expect(state.tutorialDrawerOpen).toBe(false);

    store.clearSingleSpotlight();
    state = useOnboardingStore.getState();
    expect(state.singleSpotlight).toBeNull();
  });

  it('resets onboarding state completely', () => {
    const store = useOnboardingStore.getState();
    store.closeWelcome();
    expect(useOnboardingStore.getState().hasSeenWelcome).toBe(true);

    store.resetOnboarding();
    const state = useOnboardingStore.getState();
    expect(state.hasSeenWelcome).toBe(false);
    expect(state.welcomeOpen).toBe(true);
    expect(state.tourActive).toBe(false);
    expect(state.singleSpotlight).toBeNull();
  });
});
