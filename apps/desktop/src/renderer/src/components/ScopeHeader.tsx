import React from 'react';
import { ArrowUpDown } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';

interface ScopeHeaderProps {
  total: number;
  clipsCount: number;
  photosCount: number;
}

export const ScopeHeader: React.FC<ScopeHeaderProps> = ({
  total = 248,
  clipsCount = 66,
  photosCount = 182,
}) => {
  const {
    sort,
    setSort,
    view,
    setView,
    scope,
    selectedFolderName,
    selectedFolderDrive,
    clearSelectedFolder,
    q,
    similarTo,
  } = useUiStore();
  // A text or image search adds its ranking to the sort cycle
  type Sort = typeof sort;
  const ranked: Sort | null = similarTo ? 'similarity' : q.trim() ? 'relevance' : null;
  const sorts: Sort[] = [...(ranked ? [ranked] : []), 'newest', 'oldest', 'name'];
  const sortLabel = {
    relevance: 'Best match',
    similarity: 'Most similar',
    newest: 'Newest first',
    oldest: 'Oldest first',
    name: 'Name',
  }[sort];

  const title = selectedFolderName
    ? selectedFolderName
    : scope === 'images'
    ? 'Photos'
    : scope === 'videos'
    ? 'Videos'
    : 'All footage';

  return (
    <div className="relative flex flex-wrap items-end justify-between gap-3 pt-4 pb-2">
      {/* Subtle Amber Ambient Radial Glow */}
      <div
        className="absolute inset-0 -top-6 -left-8 -right-8 h-32 pointer-events-none opacity-80"
        style={{
          background:
            'radial-gradient(60% 60% at 20% 0%, rgba(255, 196, 0, 0.07) 0%, rgba(255, 196, 0, 0.01) 50%, transparent 100%)',
        }}
      />

      <div className="min-w-40 relative z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{title}</h1>
          
          {/* Canonical 100% On-Device Status Badge */}
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] shadow-xs select-none">
            <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse motion-reduce:animate-none shrink-0" />
            <span>Zero Cloud Calls • 100% Local Apple Silicon</span>
          </span>

          {selectedFolderDrive && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[var(--surface-2)] text-[var(--accent-text)] border border-[var(--border)]">
              {selectedFolderDrive}
            </span>
          )}
          {selectedFolderName && (
            <button
              onClick={clearSelectedFolder}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-text)] transition-colors ml-1 cursor-pointer"
              title="Return to library footage"
            >
              ✕ Clear
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)] mt-1.5 tabular-nums">
          {total} items · {clipsCount} clips · {photosCount} photos
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Highlight vs Filter Toggle */}
        <button
          data-tour="mode-toggle"
          onClick={() => setView(view === 'highlight' ? 'filter' : 'highlight')}
          title="Toggle between hiding non-matches and highlighting them"
          className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-focus)] transition-colors cursor-pointer"
        >
          {view === 'highlight' ? 'Mode: Highlight' : 'Mode: Filter only'}
        </button>

        {/* Sort Pill */}
        <button
          onClick={() => setSort(sorts[(sorts.indexOf(sort) + 1) % sorts.length])}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-focus)] rounded-full text-xs font-semibold text-[var(--text)] transition-colors"
        >
          <ArrowUpDown size={12} className="text-[var(--text-muted)]" />
          <span>
            Sort: {sortLabel}
          </span>
        </button>
      </div>
    </div>
  );
};
