import React from 'react';
import defaultIconSrc from '../assets/icon.png';

export interface AppIconProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'size'> {
  size?: 'sm' | 'md' | 'lg' | number;
  src?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({
  size = 'md',
  src = defaultIconSrc,
  alt = 'snapsort app icon',
  className = '',
  style,
  ...props
}) => {
  let sizeStyle: React.CSSProperties = {};
  let sizeClass = '';

  if (typeof size === 'number') {
    sizeStyle = { width: `${size}px`, height: `${Math.round((size * 368) / 384)}px` };
  } else {
    switch (size) {
      case 'sm':
        sizeClass = 'w-5 h-5';
        break;
      case 'lg':
        sizeClass = 'w-10 h-10';
        break;
      case 'md':
      default:
        sizeClass = 'w-7 h-7';
        break;
    }
  }

  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      style={{ ...sizeStyle, ...style }}
      className={`object-contain select-none shrink-0 ${sizeClass} ${className}`}
      {...props}
    />
  );
};
