import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { useDelayedUnmount } from '../utils/useDelayedUnmount';

export interface DateRangePillProps {
  from?: string;
  to?: string;
  /** Days as YYYY-MM-DD; both undefined clears the filter. */
  onChange: (from?: string, to?: string) => void;
}

const inputClass =
  'w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--border-focus)] transition-colors dark:[color-scheme:dark]';

/** Capture date range picker, styled like FacetPopoverPill. */
export const DateRangePill: React.FC<DateRangePillProps> = ({ from, to, onChange }) => {
  const [open, setOpen] = useState(false);
  const mounted = useDelayedUnmount(open, 120);
  const popoverRef = useRef<HTMLDivElement>(null);
  const active = Boolean(from || to);

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
        aria-label="Filter by capture date"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition active:scale-[0.97] ${
          active || open
            ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-semibold shadow-xs'
            : 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-focus)]'
        }`}
      >
        <Calendar
          size={12}
          className={active || open ? 'text-[var(--accent-ink)]' : 'text-[var(--text-muted)]'}
        />
        <span>Dates</span>
        <ChevronDown
          size={11}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {mounted && (
        <div
          className={`absolute top-full left-0 mt-2 w-60 bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl shadow-dropdown p-2.5 z-50 text-xs origin-top-left ${
            open
              ? 'animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150'
              : 'animate-out fade-out zoom-out-95 duration-120 pointer-events-none'
          }`}
        >
          <div className="pb-2 border-b border-[var(--border)] text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
            Capture date
          </div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2 pt-2.5">
            <label htmlFor="date-from" className="text-[var(--text-muted)]">
              From
            </label>
            <input
              id="date-from"
              type="date"
              value={from ?? ''}
              max={to}
              onChange={(e) => onChange(e.target.value || undefined, to)}
              className={inputClass}
            />
            <label htmlFor="date-to" className="text-[var(--text-muted)]">
              To
            </label>
            <input
              id="date-to"
              type="date"
              value={to ?? ''}
              min={from}
              onChange={(e) => onChange(from, e.target.value || undefined)}
              className={inputClass}
            />
          </div>
          {active && (
            <div className="pt-1.5 mt-2.5 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => onChange(undefined, undefined)}
                className="w-full py-1.5 rounded-lg text-xs font-semibold text-[var(--accent)] hover:bg-[var(--surface-3)]/60 transition-colors"
              >
                Clear dates
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
