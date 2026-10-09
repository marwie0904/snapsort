import React from 'react';
import defaultWordmarkLight from '../assets/wordmark-light.png';
import defaultWordmarkDark from '../assets/wordmark.png';
import { BracketMark } from './BracketMark';

export interface WordmarkProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'image' | 'bracket' | 'dot' | 'wordmark';
  theme?: 'auto' | 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg' | number;
  lightSrc?: string;
  darkSrc?: string;
  alt?: string;
}

export const Wordmark: React.FC<WordmarkProps> = ({
  variant = 'image',
  theme = 'auto',
  size = 'md',
  lightSrc = defaultWordmarkLight,
  darkSrc = defaultWordmarkDark,
  alt = 'snapsort',
  className = '',
  style,
  ...props
}) => {
  // Legacy text variants
  if (variant === 'dot') {
    const sizeClasses = {
      sm: 'text-lg',
      md: 'text-2xl',
      lg: 'text-3xl',
    }[typeof size === 'string' ? size : 'md'];

    return (
      <div
        className={`inline-flex items-baseline font-bold tracking-tight text-[var(--text,#F5F5F5)] select-none ${sizeClasses} ${className}`}
        style={style}
        {...props}
      >
        <span>snapsort</span>
        <span className="text-[var(--accent,#FFC400)] text-[1.2em] leading-none ml-[1px]">.</span>
      </div>
    );
  }

  if (variant === 'bracket' || variant === 'wordmark') {
    const sizeClasses = {
      sm: 'text-lg',
      md: 'text-2xl',
      lg: 'text-3xl',
    }[typeof size === 'string' ? size : 'md'];

    const bracketSize =
      typeof size === 'number'
        ? Math.round(size * 0.85)
        : size === 'sm'
          ? 16
          : size === 'md'
            ? 22
            : 28;

    return (
      <div
        className={`inline-flex items-center gap-1 font-black tracking-tight text-[var(--text,#F5F5F5)] select-none ${sizeClasses} ${className}`}
        style={style}
        {...props}
      >
        <span>snaps</span>
        <BracketMark size={bracketSize} className="mx-0.5" />
        <span>rt</span>
      </div>
    );
  }

  // Official image-based wordmark (default)
  let heightStyle: React.CSSProperties = {};
  let heightClass = '';

  if (typeof size === 'number') {
    heightStyle = {
      height: `${size}px`,
      width: `${Math.round((size * 1094) / 275)}px`,
    };
  } else {
    switch (size) {
      case 'sm':
        heightClass = 'h-5 w-[80px]';
        break;
      case 'lg':
        heightClass = 'h-8 w-[128px]';
        break;
      case 'md':
      default:
        heightClass = 'h-[26px] w-[104px]';
        break;
    }
  }

  return (
    <div
      className={`inline-flex items-center shrink-0 select-none ${heightClass} ${className}`}
      style={{ ...heightStyle, ...style }}
      {...props}
    >
      {theme === 'dark' ? (
        <img
          src={lightSrc}
          alt={alt}
          draggable={false}
          className="h-full w-auto object-contain select-none pointer-events-none"
        />
      ) : theme === 'light' ? (
        <img
          src={darkSrc}
          alt={alt}
          draggable={false}
          className="h-full w-auto object-contain select-none pointer-events-none"
        />
      ) : (
        <>
          <img
            src={lightSrc}
            alt={alt}
            draggable={false}
            className="hidden dark:block wordmark-theme-dark h-full w-auto object-contain select-none pointer-events-none"
          />
          <img
            src={darkSrc}
            alt={alt}
            draggable={false}
            className="block dark:hidden wordmark-theme-light h-full w-auto object-contain select-none pointer-events-none"
          />
        </>
      )}
    </div>
  );
};
