import React, { useEffect, useRef, useMemo } from 'react';
import { Search, Image, Sparkles, PanelLeft, Layers, X, HelpCircle } from 'lucide-react';
import { ThemeQuickButton } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';
import { useShelfStore } from '../stores/useShelfStore';
import { useOnboardingStore } from '../stores/useOnboardingStore';
import { MockSnapsortApi } from '@snapsort/mock';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

export const TopBar: React.FC = () => {
  const api = useMemo(() => getApi(), []);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    q,
    setQ,
    similarTo,
    setSimilarTo,
    aiPanelOpen,
    toggleAiPanel,
    sidebarOpen,
    toggleSidebar,
    currentView,
    navigateToLibrary,
    themePreference,
    effectiveTheme,
    cycleTheme,
  } = useUiStore();

  const { openTutorialDrawer } = useOnboardingStore();

  const { items: shelfItems, openShelf, initShelfSync } = useShelfStore();

  useEffect(() => {
    const cleanup = initShelfSync();
    return cleanup;
  }, [initShelfSync]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Ctrl+Shift+S or ⌘⇧S to open shelf
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        openShelf();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openShelf]);

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const res = await api.stageQueryImage({
        bytes: arrayBuffer,
        mime: file.type || 'image/jpeg',
      });
      setSimilarTo({ imageRef: res.imageRef, source: 'user' });
      if (currentView !== 'library') {
        navigateToLibrary();
      }
    } catch (err) {
      console.error('Failed to stage image for search:', err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Hidden file input for reverse image search */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleImageFileChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Sidebar Toggle Button */}
      <button
        type="button"
        onClick={toggleSidebar}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        className={`p-2 rounded-xl border transition-all select-none shrink-0 ${
          sidebarOpen
            ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-focus)]'
            : 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 shadow-sm'
        }`}
      >
        <PanelLeft size={16} />
      </button>

      {/* Search Input Container */}
      <div
        data-tour="search-bar"
        className="flex-1 min-w-0 flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-4 py-2 text-sm text-[var(--text)] focus-within:border-[var(--border-focus)] transition-all"
      >
        <Search size={16} className="text-[var(--text-muted)] mr-3 shrink-0" />

        {/* Visual similarity active chip */}
        {similarTo && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mr-2 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-semibold shrink-0">
            <Image size={12} />
            <span>Image reference</span>
            <button
              type="button"
              onClick={() => setSimilarTo(null)}
              aria-label="Clear image reference"
              className="p-0.5 hover:bg-black/20 rounded-full"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </div>
        )}

        <input
          ref={searchInputRef}
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (currentView !== 'library') {
              navigateToLibrary();
            }
          }}
          placeholder="Search visuals, objects, scenes, or people… (⌘K)"
          className="bg-transparent border-none outline-none w-full min-w-0 text-xs text-[var(--text)] placeholder-[var(--text-dim)]"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Reverse image search (drop or select an image)"
          aria-label="Reverse image search"
          className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors ml-2 shrink-0 cursor-pointer"
        >
          <Image size={16} />
        </button>
      </div>


      {/* Shelf Pop-up Window Trigger */}
      <button
        data-tour="shelf-button"
        type="button"
        onClick={openShelf}
        className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-focus)] rounded-full text-xs font-semibold text-[var(--text)] transition-colors select-none shrink-0 group cursor-pointer"
        title="Open Shelf Pop-up Window (Ctrl+Shift+S / ⌘⇧S)"
        aria-label="Open Staging Shelf window"
      >
        <Layers size={13} className="text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors" />
        <span>Shelf</span>
        {shelfItems.length > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-[var(--accent)] text-[var(--accent-ink)] tabular-nums">
            {shelfItems.length}
          </span>
        )}
      </button>

      {/* Quick Theme Toggle Button */}
      <div data-tour="theme-button" className="shrink-0">
        <ThemeQuickButton
          preference={themePreference}
          effectiveTheme={effectiveTheme}
          onCycle={cycleTheme}
        />
      </div>

      {/* Tutorial & Help Button */}
      <button
        type="button"
        onClick={() => openTutorialDrawer('interact')}
        aria-label="Open Tutorial & Help"
        title="Tutorial, Guide & Shortcuts (? / F1)"
        className="flex items-center justify-center p-2 rounded-full bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-focus)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors select-none shrink-0 cursor-pointer"
      >
        <HelpCircle size={15} />
      </button>

      {/* Ask AI Toggle Button */}
      <button
        data-tour="ai-button"
        type="button"
        onClick={toggleAiPanel}
        aria-label="Toggle Ask AI Assistant"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors select-none shrink-0 ${
          aiPanelOpen
            ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
            : 'bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-focus)] text-[var(--text)]'
        }`}
        title="Toggle Ask AI Assistant"
      >
        <Sparkles size={13} className={aiPanelOpen ? 'text-[var(--accent-ink)]' : 'text-[var(--accent)]'} />
        <span>Ask AI</span>
      </button>
    </div>
  );
};
