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
      <div className="absolute inset-0 bg-gradient-to-br from-[#F8F9FA] via-[#F1F3F5] to-[#E9ECEF] dark:from-[#1A1A1A] dark:via-[#141414] dark:to-[#0D0D0D] flex flex-col items-center justify-center p-6 text-center">
        {/* Subtle grid pattern background */}
        <div
          className="absolute inset-0 opacity-[0.12] dark:opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(var(--text-muted) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />

        {/* Central Graphic Placeholder */}
        <div className="relative z-0 flex flex-col items-center">
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
            {media.width} × {media.height} · {isVideo ? `${formatDuration(media.durationS)} (4K UHD)` : 'Full Resolution Photo'}
          </span>
        </div>
      </div>

      {/* Video Play / Pause Center Overlay (Clickable) */}
      {isVideo && (
        <button
          type="button"
          onClick={onTogglePlay}
          className="absolute z-20 w-16 h-16 rounded-full bg-[var(--surface-1)]/85 hover:bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center transition-all duration-200 shadow-2xl backdrop-blur-md cursor-pointer hover:scale-105 active:scale-95"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
      )}

      {/* Interactive Detection Bounding Box Overlays */}
      {showDetections && detections && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* 1. Face Bounding Boxes (Theme-calibrated Sky/Cyan) */}
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
                className={`absolute pointer-events-auto rounded-lg border-2 transition-all duration-150 cursor-pointer ${
                  isHovered
                    ? 'border-sky-600 dark:border-[#38BDF8] bg-sky-500/25 dark:bg-[#38BDF8]/20 ring-4 ring-sky-500/40 dark:ring-[#38BDF8]/40 shadow-[0_0_20px_rgba(2,132,199,0.4)] dark:shadow-[0_0_20px_rgba(56,189,248,0.5)] z-30 scale-[1.02]'
                    : 'border-sky-600/90 dark:border-[#38BDF8]/80 bg-sky-500/15 dark:bg-[#38BDF8]/10 hover:border-sky-600 dark:hover:border-[#38BDF8] hover:bg-sky-500/25 dark:hover:bg-[#38BDF8]/15'
                }`}
              >
                {/* Person Tag Chip */}
                <div className="absolute -top-6 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/95 dark:bg-[#0A1A28]/95 border border-sky-300 dark:border-[#38BDF8]/50 text-sky-800 dark:text-[#38BDF8] text-[10px] font-semibold whitespace-nowrap shadow-md backdrop-blur-md">
                  <User size={10} className="shrink-0" />
                  <span>{face.name || `Person ${face.personId || index + 1}`}</span>
                </div>
              </div>
            );
          })}

          {/* 2. Object Bounding Boxes (Theme-calibrated Amber) */}
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
                className={`absolute pointer-events-auto rounded-lg border-2 transition-all duration-150 cursor-pointer ${
                  isHovered
                    ? 'border-amber-600 dark:border-[#FFC400] bg-amber-500/25 dark:bg-[#FFC400]/20 ring-4 ring-amber-500/40 dark:ring-[#FFC400]/40 shadow-[0_0_20px_rgba(217,119,6,0.4)] dark:shadow-[0_0_20px_rgba(255,196,0,0.5)] z-30 scale-[1.02]'
                    : 'border-amber-600/90 dark:border-[#FFC400]/80 bg-amber-500/15 dark:bg-[#FFC400]/10 hover:border-amber-600 dark:hover:border-[#FFC400] hover:bg-amber-500/25 dark:hover:bg-[#FFC400]/15'
                }`}
              >
                {/* Object Tag Chip */}
                <div className="absolute -top-6 left-0 flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/95 dark:bg-[#2A2004]/95 border border-amber-300 dark:border-[#FFC400]/50 text-amber-900 dark:text-[#FFC400] text-[10px] font-semibold whitespace-nowrap shadow-md backdrop-blur-md">
                  <Box size={10} className="shrink-0" />
                  <span>{obj.name || obj.labelId}</span>
                  <span className="text-[9px] opacity-75 font-mono">
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
