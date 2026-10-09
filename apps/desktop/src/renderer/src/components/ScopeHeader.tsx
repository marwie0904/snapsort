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
  const { sort, setSort, view, setView } = useUiStore();

  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-4 pb-2">
      <div className="min-w-40">
        <h1 className="text-2xl font-bold tracking-tight text-[#F5F5F5]">All footage</h1>
        <p className="text-xs text-[#777777] mt-1 tabular-nums">
          {total} items · {clipsCount} clips · {photosCount} photos
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Highlight vs Filter Toggle */}
        <button
          onClick={() => setView(view === 'highlight' ? 'filter' : 'highlight')}
          title="Toggle between hiding non-matches and highlighting them"
          className="px-3 py-1.5 rounded-full text-xs font-medium border border-[#282828] bg-[#181818] text-[#888888] hover:text-[#E5E5E5] transition-colors"
        >
          {view === 'highlight' ? 'Mode: Highlight' : 'Mode: Filter only'}
        </button>

        {/* Sort Pill */}
        <button
          onClick={() => {
            const next = sort === 'newest' ? 'oldest' : sort === 'oldest' ? 'name' : 'newest';
            setSort(next);
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#181818] border border-[#282828] hover:border-[#444444] rounded-full text-xs font-semibold text-[#E5E5E5] transition-colors"
        >
          <ArrowUpDown size={12} className="text-[#888888]" />
          <span>
            Sort: {sort === 'newest' ? 'Newest first' : sort === 'oldest' ? 'Oldest first' : 'Name'}
          </span>
        </button>
      </div>
    </div>
  );
};
