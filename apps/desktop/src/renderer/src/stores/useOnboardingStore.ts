import { create } from 'zustand';

export interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  shortcut?: string;
  placement?: 'bottom' | 'top' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'search-bar',
    targetSelector: '[data-tour="search-bar"]',
    title: 'Intelligent Visual Search & Image Drop',
    description:
      'Type naturally to find visual concepts, colors, or objects. Click the photo icon to drop an image reference for reverse similarity search.',
    shortcut: '⌘K',
    placement: 'bottom',
  },
  {
    id: 'filter-bar',
    targetSelector: '[data-tour="filter-bar"]',
    title: 'Smart Facet Filters & Quick Actions',
    description:
      'Filter footage by detected People, Objects, Places, and Scenes with ALL/ANY matching, or save current filter sets as 1-click Quick Actions.',
    placement: 'bottom',
  },
  {
    id: 'shelf-button',
    targetSelector: '[data-tour="shelf-button"]',
    title: 'Cross-Folder Staging Shelf',
    description:
      'Stage photos and clips from any folder or external drive into an always-on-top pop-up window, ready to drag straight into NLEs or Finder.',
    shortcut: '⌘⇧S',
    placement: 'bottom',
  },
  {
    id: 'ai-button',
    targetSelector: '[data-tour="ai-button"]',
    title: 'Ask AI Natural Language Assistant',
    description:
      'Prompt your on-device AI in plain English (e.g. "bride and groom laughing") to automatically structure filters and locate exact moments.',
    placement: 'bottom',
  },
  {
    id: 'sidebar',
    targetSelector: '[data-tour="sidebar"]',
    title: 'Library Navigation & External Drives',
    description:
      'Switch between Photos, Videos, and specialized views for People, Scenes, and Tags. Removable SSDs can be browsed and safely unmounted here.',
    placement: 'right',
  },
];

export type TutorialTab = 'interact' | 'buttons' | 'shortcuts';

const WELCOME_SEEN_KEY = 'snapsort-welcome-seen';

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

function getStoredWelcomeSeen(): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }
  try {
    return storage.getItem(WELCOME_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export interface SingleSpotlightInfo {
  selector: string;
  title: string;
  description: string;
  shortcut?: string;
}

interface OnboardingState {
  hasSeenWelcome: boolean;
  welcomeOpen: boolean;
  tutorialDrawerOpen: boolean;
  tutorialTab: TutorialTab;
  tourActive: boolean;
  currentStepIndex: number;
  singleSpotlight: SingleSpotlightInfo | null;

  // Actions
  setHasSeenWelcome: (seen: boolean) => void;
  openWelcome: () => void;
  closeWelcome: () => void;
  openTutorialDrawer: (tab?: TutorialTab) => void;
  closeTutorialDrawer: () => void;
  setTutorialTab: (tab: TutorialTab) => void;
  startTour: (stepIndex?: number) => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  endTour: () => void;
  spotlightSingleElement: (info: SingleSpotlightInfo) => void;
  clearSingleSpotlight: () => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => {
  const initialSeen = getStoredWelcomeSeen();

  return {
    hasSeenWelcome: initialSeen,
    welcomeOpen: !initialSeen,
    tutorialDrawerOpen: false,
    tutorialTab: 'interact',
    tourActive: false,
    currentStepIndex: 0,
    singleSpotlight: null,

    setHasSeenWelcome: (seen: boolean) => {
      try {
        const storage = getStorage();
        if (storage) {
          storage.setItem(WELCOME_SEEN_KEY, seen ? 'true' : 'false');
        }
      } catch {
        // ignore
      }
      set({ hasSeenWelcome: seen });
    },

    openWelcome: () => set({ welcomeOpen: true }),

    closeWelcome: () => {
      get().setHasSeenWelcome(true);
      set({ welcomeOpen: false });
    },

    openTutorialDrawer: (tab?: TutorialTab) => {
      get().setHasSeenWelcome(true);
      set((state) => ({
        tutorialDrawerOpen: true,
        tutorialTab: tab || state.tutorialTab,
        welcomeOpen: false,
        tourActive: false,
        singleSpotlight: null,
      }));
    },

    closeTutorialDrawer: () => set({ tutorialDrawerOpen: false }),

    setTutorialTab: (tab: TutorialTab) => set({ tutorialTab: tab }),

    startTour: (stepIndex = 0) => {
      get().setHasSeenWelcome(true);
      set({
        tourActive: true,
        currentStepIndex: Math.max(0, Math.min(stepIndex, TOUR_STEPS.length - 1)),
        welcomeOpen: false,
        tutorialDrawerOpen: false,
        singleSpotlight: null,
      });
    },

    nextTourStep: () => {
      const { currentStepIndex } = get();
      if (currentStepIndex < TOUR_STEPS.length - 1) {
        set({ currentStepIndex: currentStepIndex + 1 });
      } else {
        set({ tourActive: false });
      }
    },

    prevTourStep: () => {
      const { currentStepIndex } = get();
      if (currentStepIndex > 0) {
        set({ currentStepIndex: currentStepIndex - 1 });
      }
    },

    endTour: () => {
      set({ tourActive: false, singleSpotlight: null });
    },

    spotlightSingleElement: (info: SingleSpotlightInfo) => {
      set({
        singleSpotlight: info,
        tourActive: false,
        tutorialDrawerOpen: false,
        welcomeOpen: false,
      });
    },

    clearSingleSpotlight: () => {
      set({ singleSpotlight: null });
    },

    resetOnboarding: () => {
      try {
        const storage = getStorage();
        if (storage) {
          storage.removeItem(WELCOME_SEEN_KEY);
        }
      } catch {
        // ignore
      }
      set({
        hasSeenWelcome: false,
        welcomeOpen: true,
        tutorialDrawerOpen: false,
        tutorialTab: 'interact',
        tourActive: false,
        currentStepIndex: 0,
        singleSpotlight: null,
      });
    },
  };
});
