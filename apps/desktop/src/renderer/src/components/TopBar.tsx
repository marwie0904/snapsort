import React from 'react';
import { Search, Image, SlidersHorizontal, Sparkles, PanelLeft } from 'lucide-react';
import { ThemeQuickButton } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';

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
