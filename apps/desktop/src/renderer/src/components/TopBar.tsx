import React, { useEffect } from 'react';
import { Search, Image, SlidersHorizontal, Sparkles, PanelLeft, Layers } from 'lucide-react';
import { ThemeQuickButton } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';
import { useShelfStore } from '../stores/useShelfStore';

export const TopBar: React.FC = () => {
  const {
    q,
    setQ,
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

  const { items: shelfItems, openShelf, initShelfSync } = useShelfStore();

  useEffect(() => {
    const cleanup = initShelfSync();
    return cleanup;
  }, [initShelfSync]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        openShelf();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openShelf]);

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Sidebar Toggle Button */}
      <button
        type="button"
        onClick={toggleSidebar}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        className={`p-2 rounded-xl border transition-all select-none shrink-0 ${
          sidebarOpen
            ? 'bg-[var(--surface-2)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-focus)]'
            : 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 shadow-sm'
        }`}
      >
        <PanelLeft size={16} />
      </button>

      {/* Search Input Container */}
      <div className="flex-1 min-w-0 flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-4 py-2 text-sm text-[var(--text)] focus-within:border-[var(--border-focus)] transition-all">
        <Search size={16} className="text-[var(--text-muted)] mr-3 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (currentView !== 'library') {
              navigateToLibrary();
            }
          }}
          placeholder="Search what's said, what's on screen, who's in it"
          className="bg-transparent border-none outline-none w-full min-w-0 text-xs text-[var(--text)] placeholder-[var(--text-dim)]"
        />
        <button
          type="button"
          title="Reverse image search"
          className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors ml-2 shrink-0"
        >
          <Image size={16} />
        </button>
      </div>

      {/* Filter Button */}
      <button
        type="button"
        className="flex items-center gap-1.5 px-4 py-2 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-focus)] rounded-full text-xs font-semibold text-[var(--text)] transition-colors select-none shrink-0"
      >
        <SlidersHorizontal size={13} className="text-[var(--text-muted)]" />
        <span>Filter</span>
      </button>

      {/* Shelf Pop-up Window Trigger */}
      <button
        type="button"
        onClick={openShelf}
        className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-focus)] rounded-full text-xs font-semibold text-[var(--text)] transition-colors select-none shrink-0 group cursor-pointer"
        title="Open Shelf Pop-up Window (Ctrl+Shift+S / ⌘⇧S)"
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
      <ThemeQuickButton
        preference={themePreference}
        effectiveTheme={effectiveTheme}
        onCycle={cycleTheme}
      />

      {/* Ask AI Toggle Button */}
      <button
        type="button"
        onClick={toggleAiPanel}
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
