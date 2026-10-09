import React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'duration' | 'match' | 'subtle';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'duration',
  className = '',
  children,
  ...props
}) => {
  const variantClasses = {
    duration:
      'bg-black/75 text-white text-[11px] font-medium px-1.5 py-0.5 rounded tabular-nums backdrop-blur-sm',
    match:
      'bg-[var(--accent,#FFC400)] text-[var(--accent-ink,#111111)] text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm',
    subtle:
      'bg-[var(--surface-3,#262626)] text-[var(--text-muted,#8A8A8A)] text-[11px] px-1.5 py-0.5 rounded tabular-nums',
  }[variant];

  return (
    <span className={`inline-flex items-center select-none ${variantClasses} ${className}`} {...props}>
      {children}
    </span>
  );
};
