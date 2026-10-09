import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'duration' | 'match' | 'subtle' | 'status';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'duration',
  className = '',
  children,
  ...props
}) => {
  const variantClasses = {
    duration:
      'bg-black/75 text-white text-[11px] font-medium px-2 py-0.5 rounded-full tabular-nums backdrop-blur-sm',
    match:
      'bg-[var(--accent,#FFC400)] text-[var(--accent-ink,#111111)] text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm',
    subtle:
      'bg-[var(--surface-3,#262626)] text-[var(--text-muted,#8A8A8A)] text-[11px] px-2 py-0.5 rounded-full tabular-nums',
    status:
      'bg-[var(--surface-2,#1C1C1C)] text-[var(--text,#F5F5F5)] border border-[var(--border,#2A2A2A)] text-xs font-semibold px-3 py-1 rounded-full gap-2',
  }[variant];

  return (
    <span className={`inline-flex items-center select-none ${variantClasses} ${className}`} {...props}>
      {children}
    </span>
  );
};
