import React from 'react';
import type { MediaSummary } from '@snapsort/contract';
import { Badge } from '@snapsort/ui';

interface MediaGridProps {
  items: MediaSummary[];
  viewMode: 'filter' | 'highlight';
  onItemClick?: (id: number) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MediaGrid: React.FC<MediaGridProps> = ({
  items,
  viewMode,
  onItemClick,
}) => {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4 pb-12">
      {items.map((item) => {
        // In highlight mode, check if item is a match (score === 1 or 2 people)
        const isMatch = item.score !== undefined ? item.score > 0 : item.faceCount === 2;
        const showYellowRing = viewMode === 'highlight' && isMatch;

        return (
          <div
            key={item.id}
            onClick={() => onItemClick?.(item.id)}
            className="group flex flex-col cursor-pointer select-none"
          >
            {/* Card Thumbnail Container */}
            <div
              className={`relative aspect-[16/10] rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xs overflow-hidden transition-all duration-150 ${
                showYellowRing
                  ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--ring-offset)]'
                  : 'hover:ring-1 hover:ring-[var(--border-focus)]'
              }`}
            >
              {/* Media Preview Image / Placeholder */}
              <div className="w-full h-full bg-[var(--surface-2)] flex items-center justify-center">
                {/* Fallback pattern */}
                <div className="w-8 h-8 rounded-lg bg-[var(--surface-3)]/70" />
              </div>

              {/* Video Duration Badge */}
              {item.kind === 'video' && item.durationS && (
                <div className="absolute bottom-2 right-2">
                  <Badge variant="duration">{formatDuration(item.durationS)}</Badge>
                </div>
              )}
            </div>

            {/* Caption Line */}
            <div className="mt-2 px-0.5">
              <span className="text-[11px] text-[var(--text-muted)] group-hover:text-[var(--text)] font-medium leading-tight transition-colors">
                {item.name} · {item.faceCount} {item.faceCount === 1 ? 'person' : 'people'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
