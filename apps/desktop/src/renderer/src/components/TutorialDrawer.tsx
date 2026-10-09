import React from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  Search,
  Image,
  SlidersHorizontal,
  Layers,
  PanelLeft,
  SunMoon,
  Keyboard,
  ExternalLink,
  RotateCcw,
  Play,
  Eye,
  Check,
} from 'lucide-react';
import { useOnboardingStore, TutorialTab, SingleSpotlightInfo } from '../stores/useOnboardingStore';
import { useUiStore } from '../stores/useUiStore';

export interface TutorialDrawerProps {
  isOpen?: boolean;
  activeTab?: TutorialTab;
  onClose?: () => void;
  onTabChange?: (tab: TutorialTab) => void;
  onStartTour?: () => void;
  onSpotlightSingle?: (info: SingleSpotlightInfo) => void;
}

export const TutorialDrawer: React.FC<TutorialDrawerProps> = ({
  isOpen,
  activeTab,
  onClose,
  onTabChange,
  onStartTour,
  onSpotlightSingle,
}) => {
  const store = useOnboardingStore();
  const { setQ, navigateToLibrary, currentView } = useUiStore();

  const effectiveOpen = isOpen !== undefined ? isOpen : store.tutorialDrawerOpen;
  const effectiveTab = activeTab !== undefined ? activeTab : store.tutorialTab;
  const handleClose = onClose || store.closeTutorialDrawer;
  const handleTabChange = onTabChange || store.setTutorialTab;
  const handleStartTour = onStartTour || (() => store.startTour(0));
  const handleSpotlightSingle = onSpotlightSingle || store.spotlightSingleElement;

  if (!effectiveOpen) return null;

  const handleTrySearchPrompt = (prompt: string) => {
    setQ(prompt);
    if (currentView !== 'library') {
      navigateToLibrary();
    }
    handleClose();
  };

  const buttonDirectoryItems = [
    {
      name: 'Visual Search Bar',
      selector: '[data-tour="search-bar"]',
      icon: Search,
      shortcut: '⌘K',
      description: 'Search footage semantically using visual keywords, scenes, or actions.',
    },
    {
      name: 'Reverse Image Search',
      selector: '[data-tour="search-bar"]',
      icon: Image,
      description: 'Stage an image file to find visually similar footage across your library.',
    },
    {
      name: 'Smart Facet Filters',
      selector: '[data-tour="filter-bar"]',
      icon: SlidersHorizontal,
      description: 'Filter detected People, Objects, Places, and Scenes with ALL/ANY logic.',
    },
    {
      name: 'Staging Shelf',
      selector: '[data-tour="shelf-button"]',
      icon: Layers,
      shortcut: '⌘⇧S',
      description: 'Collect media across multiple folders and external SSDs into an export tray.',
    },
    {
      name: 'Ask AI Assistant',
      selector: '[data-tour="ai-button"]',
      icon: Sparkles,
      description: 'Converse in natural language to build compound queries and locate moments.',
    },
    {
      name: 'Sidebar & Storage',
      selector: '[data-tour="sidebar"]',
      icon: PanelLeft,
      description: 'Browse Library counts, People, Scenes, Tags, and manage external drives.',
    },
    {
      name: 'Theme Toggle',
      selector: '[data-tour="theme-button"]',
      icon: SunMoon,
      description: 'Cycle between System, Light, and Obsidian Dark display modes.',
    },
    {
      name: 'Highlight vs Filter Mode',
      selector: '[data-tour="mode-toggle"]',
      icon: Eye,
      description: 'Choose whether non-matching items are hidden completely or dimmed in place.',
    },
  ];

  return (
    <aside
      className="fixed top-0 right-0 z-50 h-full w-96 bg-[var(--surface-1)] border-l border-[var(--border)] shadow-2xl flex flex-col select-none transition-all duration-300 animate-in slide-in-from-right"
      aria-label="Tutorial and Shortcuts Drawer"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-[var(--accent)]" />
          <h2 className="text-sm font-bold text-[var(--text)] tracking-tight">
            Tutorial & Guide
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleStartTour}
            title="Start Interactive Tour"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] transition-colors cursor-pointer"
          >
            <RotateCcw size={11} />
            <span>Tour</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close guide"
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Segmented Tab Bar */}
      <div className="px-5 pt-3 pb-2 shrink-0">
        <div className="grid grid-cols-3 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleTabChange('interact')}
            className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
              effectiveTab === 'interact'
                ? 'bg-[var(--surface-3)] text-[var(--text)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Interact
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('buttons')}
            className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
              effectiveTab === 'buttons'
                ? 'bg-[var(--surface-3)] text-[var(--text)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Buttons
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('shortcuts')}
            className={`py-1.5 rounded-lg transition-all text-center cursor-pointer ${
              effectiveTab === 'shortcuts'
                ? 'bg-[var(--surface-3)] text-[var(--text)] shadow-xs'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            Shortcuts
          </button>
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5 text-xs text-[var(--text)]">
        {/* TAB 1: How to Interact */}
        {effectiveTab === 'interact' && (
          <div className="space-y-5">
            {/* Semantic Search */}
            <div className="bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[var(--text)]">
                <Search size={14} className="text-[var(--accent)]" />
                <span>Semantic & Natural Search</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Describe scenes, camera angles, emotions, or lighting. The neural model indexes footage locally.
              </p>
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-dim)]">
                  Try these prompts:
                </div>
                {[
                  'Bride and groom laughing at altar',
                  'Cinematic golden hour beach sunset',
                  'Red sports car in rainy neon street',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => handleTrySearchPrompt(sample)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg bg-[var(--surface-1)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-[11px] text-[var(--text)] flex items-center justify-between group transition-colors cursor-pointer"
                  >
                    <span className="truncate italic">"{sample}"</span>
                    <Play
                      size={10}
                      className="text-[var(--text-dim)] group-hover:text-[var(--accent)] shrink-0 ml-1"
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Reverse Image Search */}
            <div className="bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[var(--text)]">
                <Image size={14} className="text-[var(--overlay-object)]" />
                <span>Reverse Image Matching</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Click the image icon in the search bar or drop a reference frame to find matching compositions, color grades, and subjects.
              </p>
            </div>

            {/* Computer Vision & Facial Recognition */}
            <div className="bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[var(--text)]">
                <SlidersHorizontal size={14} className="text-[var(--accent)]" />
                <span>Facets & Bounding Boxes</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Click any detected person or object in the media player to filter instantly. Use the Facet Pills at the top to combine multiple people or objects with <strong>ALL</strong> or <strong>ANY</strong> logic.
              </p>
            </div>

            {/* Staging Shelf */}
            <div className="bg-[var(--surface-2)]/50 border border-[var(--border)] rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs text-[var(--text)]">
                <Layers size={14} className="text-[var(--accent)]" />
                <span>Cross-Folder Staging Shelf</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Click the Shelf button or press <kbd className="font-mono bg-[var(--surface-1)] px-1 py-0.5 rounded border border-[var(--border)]">⌘⇧S</kbd> to open the pop-up staging window. Gather assets from multiple drives and drag them directly into editing software.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: Button Directory */}
        {effectiveTab === 'buttons' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] text-[var(--text-muted)]">
                Click "Spotlight" to locate any control on screen:
              </span>
            </div>

            {buttonDirectoryItems.map((item) => {
              const ItemIcon = item.icon;
              return (
                <div
                  key={item.name}
                  className="p-3 rounded-xl bg-[var(--surface-2)]/60 border border-[var(--border)] hover:border-[var(--border-focus)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-1.5 rounded-lg bg-[var(--surface-3)] text-[var(--accent)] shrink-0">
                        <ItemIcon size={14} />
                      </div>
                      <span className="font-bold text-xs text-[var(--text)] truncate">
                        {item.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.shortcut && (
                        <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--surface-1)] text-[var(--text-muted)] border border-[var(--border)]">
                          {item.shortcut}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          handleSpotlightSingle({
                            selector: item.selector,
                            title: item.name,
                            description: item.description,
                            shortcut: item.shortcut,
                          })
                        }
                        title={`Highlight ${item.name}`}
                        className="px-2 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] text-[10px] font-bold hover:brightness-105 transition-all cursor-pointer"
                      >
                        Spotlight
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1.5 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: Shortcuts */}
        {effectiveTab === 'shortcuts' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-dim)] mb-2">
                Navigation & Search
              </h4>
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 overflow-hidden">
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Focus Search Input</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--accent)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    ⌘K / Ctrl+K
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Open Staging Shelf</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--accent)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    ⌘⇧S / Ctrl+Shift+S
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Open Tutorial & Shortcuts</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--accent)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    ? / F1
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Close Overlays / Drawers</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    Esc
                  </kbd>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-dim)] mb-2">
                Media Player & Timeline
              </h4>
              <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 overflow-hidden">
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Play / Pause Video</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--text)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    Space
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Step Backward / Forward (1s)</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--text)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    ← / →
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Shuttle Scrubber (Rev/Pause/Fwd)</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--text)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    J / K / L
                  </kbd>
                </div>
                <div className="flex items-center justify-between p-2.5">
                  <span className="text-[11px] text-[var(--text)]">Toggle Fullscreen Canvas</span>
                  <kbd className="font-mono text-[10px] bg-[var(--surface-1)] text-[var(--text)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    F
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border)] bg-[var(--surface-2)]/50 shrink-0 flex items-center justify-between">
        <span className="text-[11px] text-[var(--text-muted)]">
          Need a quick refresh?
        </span>
        <button
          type="button"
          onClick={handleStartTour}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-xs hover:brightness-105 transition-all shadow-sm cursor-pointer"
        >
          <Sparkles size={12} />
          <span>Launch Tour</span>
        </button>
      </div>
    </aside>
  );
};
