import React from 'react';

export interface BracketMarkProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
}

export const BracketMark: React.FC<BracketMarkProps> = ({
  size = 24,
  color = 'var(--accent, #FFC400)',
  className = '',
  ...props
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Top Left */}
      <path
        d="M15 45 C15 25 25 15 45 15 C48 15 50 17 50 20 C50 23 48 25 45 25 C32 25 25 32 25 45 C25 48 23 50 20 50 C17 50 15 48 15 45 Z"
        fill={color}
      />
      {/* Top Right */}
      <path
        d="M85 45 C85 25 75 15 55 15 C52 15 50 17 50 20 C50 23 52 25 55 25 C68 25 75 32 75 45 C75 48 77 50 80 50 C83 50 85 48 85 45 Z"
        fill={color}
      />
      {/* Bottom Left */}
      <path
        d="M15 55 C15 75 25 85 45 85 C48 85 50 83 50 80 C50 77 48 75 45 75 C32 75 25 68 25 55 C25 52 23 50 20 50 C17 50 15 52 15 55 Z"
        fill={color}
      />
      {/* Bottom Right */}
      <path
        d="M85 55 C85 75 75 85 55 85 C52 85 50 83 50 80 C50 77 52 75 55 75 C68 75 75 68 75 55 C75 52 77 50 80 50 C83 50 85 52 85 55 Z"
        fill={color}
      />
    </svg>
  );
};
