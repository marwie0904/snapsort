import React from 'react';
import type { MediaDetail, Detections } from '@snapsort/contract';
import { User, Box, Play, Pause, Film, Image as ImageIcon } from 'lucide-react';

interface MediaCanvasProps {
  media: MediaDetail;
  detections?: Detections;
  isLoadingDetections?: boolean;
  showDetections: boolean;
  hoveredEntityId: string | null;
  onHoverEntity: (id: string | null) => void;
  currentTimestamp: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MediaCanvas: React.FC<MediaCanvasProps> = ({
  media,
  detections,
  showDetections,
  hoveredEntityId,
  onHoverEntity,
  currentTimestamp,
  isPlaying,
  onTogglePlay,
}) => {
  const isVideo = media.kind === 'video';

  return (
    <div className="relative w-full aspect-[16/10] max-h-[56vh] bg-[var(--surface-2)] rounded-2xl overflow-hidden border border-[var(--border)] select-none flex items-center justify-center group shadow-xl transition-colors">
      {/* Background Graphic / Simulated Viewport */}
      <div className="absolute inset-0 bg-[var(--surface-0)] flex flex-col items-center justify-center p-6 text-center">
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(var(--text-muted) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Real media preview render with fallback */}
        <img
          src={
            isVideo
              ? `snapsort-media://frame/${media.id}/${currentTimestamp}`
              : `snapsort-media://preview/${media.id}`
          }
          alt={media.name}
          className="absolute inset-0 w-full h-full object-contain z-[1]"
          onError={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />

        {/* Central Graphic Placeholder (Behind image or if image load fails) */}
        <div className="relative z-0 flex flex-col items-center opacity-60">
          <div className="w-20 h-20 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] flex items-center justify-center shadow-md mb-3">
            {isVideo ? (
              <Film size={32} className="text-[var(--text-muted)]" />
            ) : (
              <ImageIcon size={32} className="text-[var(--text-muted)]" />
            )}
          </div>
          <span className="text-sm font-semibold text-[var(--text)] tracking-wide">
            {media.name}
          </span>
          <span className="text-xs text-[var(--text-muted)] mt-1 font-mono">
            {media.width} × {media.height} · {isVideo ? `${formatDuration(media.durationS)}${media.height >= 2160 ? ' (4K UHD)' : ''}` : 'Full Resolution Photo'}
          </span>
        </div>
      </div>

      {/* Video Play / Pause Center Overlay (Clickable) */}
      {isVideo && (
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
          className="absolute z-20 w-16 h-16 rounded-full bg-[var(--surface-1)]/85 hover:bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center transition-all duration-200 shadow-2xl backdrop-blur-md cursor-pointer hover:scale-105 active:scale-95"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
      )}

      {/* Interactive Detection Bounding Box Overlays (Electric Cyan #5AC8FA) */}
      {showDetections && detections && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* 1. Face Bounding Boxes (Electric Cyan #5AC8FA) */}
          {detections.faces.map((face, index) => {
            const entityId = `person-${face.personId ?? index}`;
            const isHovered = hoveredEntityId === entityId;
            const { x, y, w, h } = face.box;

            return (
              <div
                key={entityId}
                onMouseEnter={() => onHoverEntity(entityId)}
                onMouseLeave={() => onHoverEntity(null)}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                }}
                className={`absolute pointer-events-auto rounded-sm border-[1.5px] border-[#5AC8FA] transition-all duration-150 cursor-pointer ${
                  isHovered
                    ? 'bg-[#5AC8FA]/25 ring-2 ring-[#5AC8FA]/50 shadow-[0_0_16px_rgba(90,200,250,0.4)] z-30 scale-[1.01]'
                    : 'bg-[#5AC8FA]/10 hover:bg-[#5AC8FA]/20'
                }`}
              >
                {/* Person Tag Chip */}
                <div className="absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[#5AC8FA] text-[#0F0F0F] text-[10px] font-bold whitespace-nowrap shadow-sm">
                  <User size={10} className="shrink-0 stroke-[2.5]" />
                  <span>{face.name || `Person ${face.personId || index + 1}`}</span>
                </div>
              </div>
            );
          })}

          {/* 2. Object Bounding Boxes (Electric Cyan #5AC8FA) */}
          {detections.objects.map((obj, index) => {
            const entityId = `object-${obj.labelId}-${index}`;
            const isHovered = hoveredEntityId === entityId;
            const { x, y, w, h } = obj.box;

            return (
              <div
                key={entityId}
                onMouseEnter={() => onHoverEntity(entityId)}
                onMouseLeave={() => onHoverEntity(null)}
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                }}
                className={`absolute pointer-events-auto rounded-sm border-[1.5px] border-[#5AC8FA] transition-all duration-150 cursor-pointer ${
                  isHovered
                    ? 'bg-[#5AC8FA]/25 ring-2 ring-[#5AC8FA]/50 shadow-[0_0_16px_rgba(90,200,250,0.4)] z-30 scale-[1.01]'
                    : 'bg-[#5AC8FA]/10 hover:bg-[#5AC8FA]/20'
                }`}
              >
                {/* Object Tag Chip */}
                <div className="absolute -top-5 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[#5AC8FA] text-[#0F0F0F] text-[10px] font-bold whitespace-nowrap shadow-sm">
                  <Box size={10} className="shrink-0 stroke-[2.5]" />
                  <span>{obj.name || obj.labelId}</span>
                  <span className="text-[9px] opacity-85 font-mono">
                    {Math.round(obj.score * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Left Floating Media Info Pill */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
        <span className="px-2.5 py-1 rounded-full bg-[var(--surface-1)]/90 border border-[var(--border)] text-[11px] font-medium text-[var(--text)] backdrop-blur-md shadow-md flex items-center gap-1.5">
          {isVideo ? (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-[#FFC400] animate-pulse" />
              Video Clip
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-sky-500 dark:bg-[#38BDF8]" />
              Still Image
            </>
          )}
        </span>

        {isVideo && (
          <span className="px-2 py-1 rounded-full bg-[var(--surface-1)]/90 border border-[var(--border)] text-[11px] font-mono text-[var(--text-muted)] backdrop-blur-md shadow-sm">
            {formatDuration(currentTimestamp)} / {formatDuration(media.durationS)}
          </span>
        )}
      </div>

      {/* Bottom Right Floating Resolution Pill */}
      <div className="absolute bottom-3 right-3 z-20">
        <span className="px-2.5 py-1 rounded-full bg-[var(--surface-1)]/90 border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)] backdrop-blur-md shadow-sm">
          {media.width}×{media.height}
        </span>
      </div>
    </div>
  );
};
