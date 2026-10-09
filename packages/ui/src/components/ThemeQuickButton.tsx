import React from 'react';
import { Laptop, Sun, Moon } from 'lucide-react';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemeQuickButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  preference: ThemePreference;
  effectiveTheme?: 'light' | 'dark';
  onCycle: () => void;
}

export const ThemeQuickButton: React.FC<ThemeQuickButtonProps> = ({
  preference,
  effectiveTheme,
  onCycle,
  className = '',
  ...props
}) => {
  const label =
    preference === 'system'
      ? `Auto (${effectiveTheme ?? 'dark'})`
      : preference === 'light'
      ? 'Light'
      : 'Dark';

  const IconComponent =
    preference === 'system' ? Laptop : preference === 'light' ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={onCycle}
      title={`Theme: ${label} (Click to toggle)`}
      aria-label={`Current theme is ${label}. Click to cycle.`}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-focus)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors select-none text-xs font-semibold shrink-0 ${className}`}
      {...props}
    >
      <IconComponent
        size={14}
        className={preference === 'light' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}
      />
      <span className="hidden sm:inline text-[11px] font-medium">{label}</span>
    </button>
  );
};
