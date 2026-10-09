import React from 'react';
import { Laptop, Sun, Moon } from 'lucide-react';

export type ThemeOption = 'system' | 'light' | 'dark';

export interface ThemeSegmentedControlProps {
  value: ThemeOption;
  onChange: (value: ThemeOption) => void;
  className?: string;
  showLabels?: boolean;
}

export const ThemeSegmentedControl: React.FC<ThemeSegmentedControlProps> = ({
  value,
  onChange,
  className = '',
  showLabels = true,
}) => {
  const options: Array<{ id: ThemeOption; label: string; icon: React.FC<{ size?: number; className?: string }> }> = [
    { id: 'system', label: 'Auto', icon: Laptop },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme mode"
      className={`inline-flex items-center p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] select-none ${className}`}
    >
      {options.map((opt) => {
        const isSelected = value === opt.id;
        const IconComponent = opt.icon;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.id)}
            title={`Set theme to ${opt.label}`}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 ${
              isSelected
                ? 'bg-[var(--surface-1)] text-[var(--text)] font-semibold shadow-xs border border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/40 border border-transparent'
            }`}
          >
            <IconComponent
              size={13}
              className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}
            />
            {showLabels && <span className="text-[11px] leading-tight">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
};
