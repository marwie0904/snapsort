import React from 'react';
import { Sparkles, X } from 'lucide-react';

export interface FilterPillProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  active?: boolean;
  isAi?: boolean;
  onRemove?: () => void;
  count?: number;
}

export const FilterPill: React.FC<FilterPillProps> = ({
  label,
  active = false,
  isAi = false,
  onRemove,
  count,
  className = '',
  onClick,
  ...props
}) => {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors select-none ${
        active
          ? 'bg-[var(--accent,#FFC400)] text-[var(--accent-ink,#111111)] shadow-sm font-semibold'
          : 'bg-[var(--surface-2,#1C1C1C)] text-[var(--text,#F5F5F5)] border border-[var(--border,#2A2A2A)] hover:border-[var(--text-muted,#8A8A8A)]'
      } ${className}`}
      {...props}
    >
      {isAi && (
        <Sparkles
          size={12}
          className={active ? 'text-black fill-black' : 'text-[var(--accent,#FFC400)]'}
        />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums ${
            active ? 'bg-black/15 text-black' : 'bg-[var(--surface-3,#262626)] text-[var(--text-muted,#8A8A8A)]'
          }`}
        >
          {count}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={`p-0.5 rounded-full hover:bg-black/20 focus:outline-none ml-0.5`}
          aria-label={`Remove filter ${label}`}
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
};
