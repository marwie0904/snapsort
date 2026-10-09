import React, { useState, useMemo } from 'react';
import { Search, X, CheckSquare, Square, Filter, ArrowRight, ArrowUpDown } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';

export interface FacetCardItem {
  id: string;
  name: string;
  count: number;
  coverMediaId?: number;
  coverTs?: number;
}

interface FacetCardGridProps {
  kind: 'scene' | 'label';
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: FacetCardItem[];
  isLoading?: boolean;
  emptyMessage?: string;
  defaultMatch: 'all' | 'any';
}

const cardGradients = [
  'from-amber-600/25 via-amber-500/10 to-transparent text-[#FFC400]',
  'from-sky-600/25 via-blue-500/10 to-transparent text-[#5AC8FA]',
  'from-purple-600/25 via-indigo-500/10 to-transparent text-purple-400',
  'from-emerald-600/25 via-teal-500/10 to-transparent text-emerald-400',
  'from-rose-600/25 via-pink-500/10 to-transparent text-rose-400',
  'from-orange-600/25 via-amber-500/10 to-transparent text-orange-400',
];

export const FacetCardGrid: React.FC<FacetCardGridProps> = ({
  kind,
  title,
  subtitle,
  icon: Icon,
  items,
  isLoading = false,
  emptyMessage = 'No items found',
  defaultMatch,
}) => {
  const { filterByFacetAndNavigate, getFacetSelection } = useUiStore();
  const currentFacetFilter = getFacetSelection(kind);

  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'count' | 'name'>('count');
  // Local multi-selection (initiated by shift/ctrl click or checkboxes)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(defaultMatch);

  // Filtered & sorted items
  const displayItems = useMemo(() => {
    let list = [...items];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((item) => item.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      if (sortOrder === 'count') {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [items, search, sortOrder]);

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleCardClick = (item: FacetCardItem, e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Toggle into selection
      toggleSelectId(item.id);
      return;
    }

    if (selectedIds.length > 0) {
      // If a multi-selection is in progress, plain click also toggles
      toggleSelectId(item.id);
      return;
    }

    // Default: replace filter and navigate to library!
    filterByFacetAndNavigate(kind, [item.id], defaultMatch);
  };

  const applyMultiSelection = () => {
    if (selectedIds.length > 0) {
      filterByFacetAndNavigate(kind, selectedIds, matchMode);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-1 select-none relative">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border)] shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] flex items-center gap-2.5">
            <Icon size={22} className="text-[var(--accent)]" />
            <span>{title}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)] font-medium tabular-nums">
              {items.length} total
            </span>
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">{subtitle}</p>
        </div>

        {/* Controls: Search & Sort */}
        <div className="flex items-center gap-2">
          {/* Sort Selector */}
          <button
            type="button"
            onClick={() => setSortOrder(sortOrder === 'count' ? 'name' : 'count')}
            title="Toggle sort order"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-focus)] transition-colors"
          >
            <ArrowUpDown size={12} />
            <span>{sortOrder === 'count' ? 'Most items' : 'A – Z'}</span>
          </button>

          {/* Search Input */}
          <div className="relative w-full sm:w-60">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find..."
              className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-full pl-8 pr-7 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid Content */}
      <div className="py-6 flex-1">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[16/11] rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] animate-pulse"
              />
            ))}
          </div>
        ) : displayItems.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
            {search ? 'No matching results found.' : emptyMessage}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 pb-20">
            {displayItems.map((item, idx) => {
              const gradient = cardGradients[idx % cardGradients.length];
              const isSelected = selectedIds.includes(item.id);
              const isActiveInFilter = currentFacetFilter.ids.some(
                (id) => String(id) === String(item.id)
              );

              return (
                <div
                  key={item.id}
                  onClick={(e) => handleCardClick(item, e)}
                  className={`group relative flex flex-col rounded-2xl bg-[var(--card-bg)] border transition-all cursor-pointer shadow-xs overflow-hidden ${
                    isSelected
                      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] bg-[var(--surface-2)]'
                      : isActiveInFilter
                        ? 'border-[var(--accent)]/60 bg-[var(--surface-2)]'
                        : 'border-[var(--card-border)] hover:border-[var(--border-focus)] hover:bg-[var(--surface-2)]'
                  }`}
                >
                  {/* Visual 16:9 Cover Box */}
                  <div className="relative aspect-[16/10] w-full bg-[var(--surface-2)] overflow-hidden flex items-center justify-center">
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-80 group-hover:opacity-100 transition-opacity`}
                    />

                    {/* Central Icon / Monogram */}
                    <div className="relative z-0 flex flex-col items-center justify-center p-2 text-center">
                      <Icon size={24} className="opacity-90 drop-shadow-xs mb-1" />
                      <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider line-clamp-1">
                        {kind === 'scene' ? 'Scene' : 'Tag'}
                      </span>
                    </div>

                    {/* Checkbox for Multi-select */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelectId(item.id);
                      }}
                      title="Select"
                      className={`absolute top-2.5 left-2.5 p-1 rounded-md backdrop-blur-xs transition-opacity z-10 ${
                        isSelected
                          ? 'text-[var(--accent)] bg-black/40 opacity-100'
                          : 'text-[var(--text-muted)] bg-black/30 opacity-0 group-hover:opacity-100 hover:text-[var(--text)]'
                      }`}
                    >
                      {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                    </button>

                    {/* Quick Filter Action Button on Hover */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        filterByFacetAndNavigate(kind, [item.id], defaultMatch);
                      }}
                      title={`Filter by ${item.name}`}
                      className="absolute top-2.5 right-2.5 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] bg-black/30 hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <Filter size={12} />
                    </button>
                  </div>

                  {/* Card Details */}
                  <div className="p-3">
                    <div className="text-xs font-bold text-[var(--text)] truncate group-hover:text-[var(--accent)] transition-colors">
                      {item.name}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mt-1 tabular-nums">
                      <span>{item.count} items</span>
                      {isActiveInFilter && (
                        <span className="text-[10px] font-semibold text-[var(--accent)]">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky Bottom Multi-Select Bar */}
      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 left-0 right-0 z-30 mx-auto max-w-lg bg-[var(--surface-1)] border border-[var(--border)] shadow-xl rounded-2xl p-2.5 flex items-center justify-between gap-3 text-xs animate-in slide-in-from-bottom-3 duration-150">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-[11px] tabular-nums">
              {selectedIds.length}
            </span>
            <span className="font-semibold text-[var(--text)]">selected</span>

            {/* Any / All match toggle */}
            <div className="flex items-center p-0.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[10px] ml-1">
              <button
                type="button"
                onClick={() => setMatchMode('any')}
                className={`px-2 py-0.5 rounded font-medium transition-all ${
                  matchMode === 'any'
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Any
              </button>
              <button
                type="button"
                onClick={() => setMatchMode('all')}
                className={`px-2 py-0.5 rounded font-medium transition-all ${
                  matchMode === 'all'
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                All
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={applyMultiSelection}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-sm hover:brightness-105 transition-all cursor-pointer"
            >
              <span>Show in library</span>
              <ArrowRight size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
