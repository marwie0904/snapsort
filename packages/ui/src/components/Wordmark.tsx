import React from 'react';
import { BracketMark } from './BracketMark';

export interface WordmarkProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'wordmark' | 'dot';
  size?: 'sm' | 'md' | 'lg';
}

export const Wordmark: React.FC<WordmarkProps> = ({
  variant = 'dot',
  size = 'md',
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
  }[size];

  if (variant === 'dot') {
    return (
      <div
        className={`inline-flex items-baseline font-bold tracking-tight text-[var(--text,#F5F5F5)] select-none ${sizeClasses} ${className}`}
        {...props}
      >
        <span>snapsort</span>
        <span className="text-[var(--accent,#FFC400)] text-[1.2em] leading-none ml-[1px]">.</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 font-black tracking-tight text-[var(--text,#F5F5F5)] select-none ${sizeClasses} ${className}`}
      {...props}
    >
      <span>snaps</span>
      <BracketMark size={size === 'sm' ? 16 : size === 'md' ? 22 : 28} className="mx-0.5" />
      <span>rt</span>
    </div>
  );
};
