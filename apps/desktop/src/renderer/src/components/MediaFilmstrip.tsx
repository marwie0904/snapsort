import React, { useRef } from 'react';
import type { MediaSummary } from '@snapsort/contract';
import { Film, Image as ImageIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface MediaFilmstripProps {
  items: MediaSummary[];
  selectedMediaId: number;
  onSelectMedia: (id: number) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MediaFilmstrip: React.FC<MediaFilmstripProps> = ({
  items,
  selectedMediaId,
  onSelectMedia,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentIndex = items.findIndex((i) => i.id === selectedMediaId);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -300 : 300;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <div className="w-full flex flex-col gap-2 pt-1 select-none">
      {/* Filmstrip Header */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="text-[var(--text-muted)] font-medium">
          Footage in view{' '}
          <span className="text-[var(--text)] font-semibold">
            {currentIndex >= 0 ? currentIndex + 1 : 1} of {items.length}
          </span>
        </span>

        {/* Scroll Chevrons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="p-1 rounded-lg bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] transition-all cursor-pointer shadow-sm"
            title="Scroll Left"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="p-1 rounded-lg bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] transition-all cursor-pointer shadow-sm"
            title="Scroll Right"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Horizontal Carousel */}
      <div
        ref={scrollRef}
        className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none scroll-smooth"
      >
        {items.map((item) => {
          const isSelected = item.id === selectedMediaId;
          const isVideo = item.kind === 'video';

          return (
            <div
              key={item.id}
              onClick={() => onSelectMedia(item.id)}
              className={`shrink-0 w-28 aspect-[16/10] rounded-xl overflow-hidden relative cursor-pointer border transition-all duration-150 ${
                isSelected
                  ? 'border-[var(--accent)] ring-2 ring-[var(--accent)] shadow-md scale-[1.02]'
                  : 'border-[var(--border)] bg-[var(--surface-1)] hover:border-[var(--text-muted)] opacity-85 hover:opacity-100'
              }`}
            >
              {/* Thumbnail Background */}
              <div className="w-full h-full bg-gradient-to-br from-[var(--surface-2)] to-[var(--surface-3)] flex items-center justify-center">
                {isVideo ? (
                  <Film size={18} className={isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
                ) : (
                  <ImageIcon size={18} className={isSelected ? 'text-sky-500 dark:text-[#38BDF8]' : 'text-[var(--text-muted)]'} />
                )}
              </div>
              <img
                src={
                  isVideo
                    ? `snapsort-media://frame/${item.id}/${item.bestFrameTs ?? 0}`
                    : `snapsort-media://preview/${item.id}`
                }
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />

              {/* Duration or Icon Badge */}
              {isVideo && item.durationS && (
                <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-[var(--surface-1)]/90 text-[9px] font-mono font-medium text-[var(--text)] backdrop-blur-xs border border-[var(--border)] shadow-xs">
                  {formatDuration(item.durationS)}
                </div>
              )}

              {/* Title overlay */}
              <div className="absolute top-1 left-1 max-w-[85%] truncate text-[9px] font-medium text-[var(--text)] drop-shadow-sm px-1 py-0.5 rounded bg-[var(--surface-1)]/80 backdrop-blur-xs border border-[var(--border)] shadow-xs">
                {item.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
