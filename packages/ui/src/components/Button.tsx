import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'accent' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center font-medium transition-all duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-0,#0F0F0F)] disabled:opacity-50 disabled:pointer-events-none cursor-pointer';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1 rounded-full gap-1.5 h-7',
    md: 'text-sm px-4 py-2 rounded-full gap-2 h-9',
    lg: 'text-sm font-bold px-6 py-3.5 rounded-full gap-2 h-12',
  }[size];

  const variantClasses = {
    accent:
      'bg-[#FFC400] text-[#111111] hover:bg-[#E5B000] active:bg-[#CC9D00] hover:scale-[1.02] active:scale-[0.98] font-bold shadow-sm',
    secondary:
      'bg-[var(--surface-2,#1C1C1C)] text-[var(--text,#F5F5F5)] border border-[var(--border,#2A2A2A)] hover:bg-[var(--surface-3,#262626)] active:scale-[0.98]',
    ghost:
      'bg-transparent text-[var(--text-muted,#8A8A8A)] hover:text-[var(--text,#F5F5F5)] hover:bg-[var(--surface-2,#1C1C1C)]',
    outline:
      'bg-transparent text-[var(--text,#F5F5F5)] border border-[var(--border,#2A2A2A)] hover:border-[var(--accent,#FFC400)] active:scale-[0.98]',
    danger:
      'bg-[var(--danger,#FF5A4E)] text-white hover:brightness-110 active:brightness-90 active:scale-[0.98]',
  }[variant];

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${widthClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
