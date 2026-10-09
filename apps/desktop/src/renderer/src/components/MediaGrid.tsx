import React from 'react';
import type { MediaSummary } from '@snapsort/contract';
import { Badge } from '@snapsort/ui';
import { Plus, Check } from 'lucide-react';
import { useShelfStore } from '../stores/useShelfStore';

interface MediaGridProps {
  items: MediaSummary[];
  viewMode: 'filter' | 'highlight';
  onItemClick?: (id: number) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MediaGrid: React.FC<MediaGridProps> = ({
  items,
  viewMode,
  onItemClick,
}) => {
  const { items: shelfItems, addItem, removeItem } = useShelfStore();

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4 pb-12">
      {items.map((item) => {
        // In highlight mode, outline the items that pass the filters
        const isMatch = item.matched ?? (item.score !== undefined && item.score > 0);
        const showYellowRing = viewMode === 'highlight' && isMatch;
        const inShelf = shelfItems.some((s) => s.id === item.id);

        return (
          <div
            key={item.id}
            draggable="true"
            onDragStart={(e) => {
              e.dataTransfer.setData('application/json', JSON.stringify(item));
              e.dataTransfer.effectAllowed = 'copyMove';
            }}
            onClick={() => onItemClick?.(item.id)}
            className="group flex flex-col cursor-pointer select-none"
          >
            {/* Card Thumbnail Container */}
            <div
              className={`relative aspect-[16/10] rounded-xl bg-[var(--card-bg)] overflow-hidden transition-all duration-150 ${
                showYellowRing
                  ? 'border-2 border-[var(--accent)] shadow-[0_0_16px_-2px_rgba(255,196,0,0.25)]'
                  : 'border border-[var(--card-border)] hover:border-[var(--border-focus)]'
              }`}
            >
              {/* Media Preview Image with SVG fallback */}
              <div className="w-full h-full bg-[var(--surface-2)] relative flex items-center justify-center">
                <img
                  src={
                    item.kind === 'video'
                      ? `snapsort-media://frame/${item.id}/${item.bestFrameTs ?? 0}`
                      : `snapsort-media://preview/${item.id}`
                  }
                  alt={item.name}
                  loading="lazy"
                  onError={(e) => {
                    // Graceful fallback if protocol or file is unreached
                    const img = e.currentTarget;
                    img.style.display = 'none';
                    if (img.nextElementSibling) {
                      (img.nextElementSibling as HTMLElement).style.display = 'flex';
                    }
                  }}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
                {/* Fallback pattern when image cannot load */}
                <div className="hidden absolute inset-0 bg-[var(--surface-2)] flex-col items-center justify-center gap-1.5 p-2 text-center">
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-3)]/70 flex items-center justify-center text-[var(--text-muted)] text-[10px]">
                    {item.kind === 'video' ? '▶' : 'IMG'}
                  </div>
                  <span className="text-[10px] text-[var(--text-muted)] truncate max-w-full">
                    {item.name}
                  </span>
                </div>
              </div>

              {/* Add to Shelf Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (inShelf) {
                    removeItem(item.id);
                  } else {
                    addItem(item);
                  }
                }}
                aria-label={inShelf ? `Remove ${item.name} from Shelf` : `Add ${item.name} to Shelf`}
                title={inShelf ? 'Remove from Shelf' : 'Add to Shelf'}
                className={`absolute top-2 right-2 p-1 rounded-md backdrop-blur-xs transition-all cursor-pointer z-10 ${
                  inShelf
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)] opacity-100 shadow-xs'
                    : 'bg-black/60 hover:bg-black/90 text-white opacity-0 group-hover:opacity-100'
                }`}
              >
                {inShelf ? <Check size={12} strokeWidth={2.5} /> : <Plus size={12} strokeWidth={2.5} />}
              </button>

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
