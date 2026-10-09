import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, CheckSquare, Square, ArrowUpRight, Search, X } from 'lucide-react';
import { useDelayedUnmount } from '../utils/useDelayedUnmount';

export interface FacetItem {
  id: string | number;
  name: string;
  count: number;
}

export interface FacetPopoverPillProps {
  kind: 'person' | 'scene' | 'label' | 'place';
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: FacetItem[];
  selectedIds: Array<string | number>;
  match?: 'all' | 'any';
  onToggle: (id: string | number) => void;
  onSetMatch?: (match: 'all' | 'any') => void;
  onBrowseAll?: () => void;
  browseLabel?: string;
  showMatchToggle?: boolean;
}

export const FacetPopoverPill: React.FC<FacetPopoverPillProps> = ({
  label,
  icon: Icon,
  items,
  selectedIds,
  match = 'all',
  onToggle,
  onSetMatch,
  onBrowseAll,
  browseLabel,
  showMatchToggle = true,
}) => {
  const [open, setOpen] = useState(false);
  const mounted = useDelayedUnmount(open, 120);
  const [search, setSearch] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  const activeCount = selectedIds.length;

  return (
    <div
      className="relative shrink-0 select-none text-xs"
      ref={popoverRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition active:scale-[0.97] ${
          activeCount > 0 || open
            ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-xs'
            : 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-focus)]'
        }`}
      >
        <Icon
          size={12}
          className={activeCount > 0 || open ? 'text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}
        />
        <span>{label}</span>
        {activeCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 text-black font-semibold tabular-nums">
            {activeCount}
          </span>
        )}
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {mounted && (
        <div
          className={`absolute top-full left-0 mt-2 w-72 bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl shadow-dropdown p-2.5 z-50 text-xs origin-top-left ${
            open
              ? 'animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150'
              : 'animate-out fade-out zoom-out-95 duration-120 pointer-events-none'
          }`}
        >
          {/* Header with Title + Any/All segmented switch */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider truncate">
                Select {label}
              </span>
              <span className="text-[10px] text-[var(--text-dim)] font-normal tabular-nums">
                ({items.length})
              </span>
            </div>

            {/* Any / All Toggle */}
            {showMatchToggle && onSetMatch && (
              <div className="flex items-center p-0.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[10px]">
                <button
                  type="button"
                  onClick={() => onSetMatch('any')}
                  title="Match any selected item (OR)"
                  className={`px-2 py-0.5 rounded font-medium transition-all ${
                    match === 'any'
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Any
                </button>
                <button
                  type="button"
                  onClick={() => onSetMatch('all')}
                  title="Match all selected items (AND)"
                  className={`px-2 py-0.5 rounded font-medium transition-all ${
                    match === 'all'
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-bold shadow-xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  All
                </button>
              </div>
            )}
          </div>

          {/* Search box if items > 4 */}
          {items.length > 4 && (
            <div className="relative my-2">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg pl-7 pr-7 py-1 text-xs text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          {/* Checklist */}
          <div className="max-h-56 overflow-y-auto py-1 space-y-0.5">
            {filteredItems.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-[var(--text-muted)]">
                No {label.toLowerCase()} found
              </div>
            ) : (
              filteredItems.map((item) => {
                const isSelected = selectedIds.some((id) => String(id) === String(item.id));
                return (
                  <div
                    key={String(item.id)}
                    onClick={() => onToggle(item.id)}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-[var(--surface-3)]/60 cursor-pointer text-[var(--text)] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <CheckSquare size={13} className="text-[var(--accent)] shrink-0" />
                      ) : (
                        <Square size={13} className="text-[var(--text-dim)] shrink-0" />
                      )}
                      <span
                        className={`truncate text-xs ${
                          isSelected ? 'text-[var(--text)] font-semibold' : 'text-[var(--text-muted)]'
                        }`}
                      >
                        {item.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-[var(--text-dim)] font-medium tabular-nums shrink-0 ml-2">
                      {item.count}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Link to full Browse view if provided */}
          {onBrowseAll && browseLabel && (
            <div className="pt-1.5 mt-1 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onBrowseAll();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--accent)] hover:bg-[var(--surface-3)]/60 transition-colors"
              >
                <span>{browseLabel}</span>
                <ArrowUpRight size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
