import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MediaDetail, Detections } from '@snapsort/contract';
import { User, Box, Play, Pause, ExternalLink } from 'lucide-react';

interface MediaCanvasProps {
  media: MediaDetail;
  detections?: Detections;
  isLoadingDetections?: boolean;
  showDetections: boolean;
  hoveredEntityId: string | null;
  onHoverEntity: (id: string | null) => void;
  /** When non-empty, only these entities' boxes are drawn. */
  selectedEntityIds?: string[];
  currentTimestamp: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** The <video> reports its time here while it plays. */
  onTimeUpdate?: (ts: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** Chromium can't decode this video: show 1 fps frames instead. */
  videoFailed?: boolean;
  onVideoFailed?: () => void;
  onOpenExternally?: () => void;
  playbackRate?: number;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export const MediaCanvas: React.FC<MediaCanvasProps> = ({
  media,
  detections,
  showDetections,
  hoveredEntityId,
  onHoverEntity,
  selectedEntityIds = [],
  currentTimestamp,
  isPlaying,
  onTogglePlay,
  onTimeUpdate,
  onPlayingChange,
  videoFailed = false,
  onVideoFailed,
  onOpenExternally,
  playbackRate = 1,
}) => {
  const isVideo = media.kind === 'video';
  const playable = isVideo && !videoFailed;
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [natural, setNatural] = useState({ w: media.width || 16, h: media.height || 10 });
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(
    () => setNatural({ w: media.width || 16, h: media.height || 10 }),
    [media.id, media.width, media.height],
  );

  // The media is letterboxed in the canvas; size a box to it so detection boxes line up with the picture.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fit = () => {
      const scale = Math.min(el.clientWidth / natural.w, el.clientHeight / natural.h);
      setBox({ w: natural.w * scale, h: natural.h * scale });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);

  // The store drives play/pause and seeks; the video drives the time while it plays.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => onPlayingChange?.(false));
    else v.pause();
  }, [isPlaying, playable, onPlayingChange]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate, playable]);
  useEffect(() => {
    const v = videoRef.current;
    if (v && v.readyState > 0 && Math.abs(v.currentTime - currentTimestamp) > 0.5)
      v.currentTime = currentTimestamp;
  }, [currentTimestamp]);

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[16/10] max-h-[56vh] bg-[var(--surface-0)] rounded-2xl overflow-hidden border border-[var(--border)] select-none flex items-center justify-center group shadow-xl transition-colors"
    >
      {box && (
        <div className="relative z-0" style={{ width: box.w, height: box.h }}>
          {playable ? (
            <video
              key={media.id}
              ref={videoRef}
              src={`snapsort-media://file/${media.id}`}
              className="w-full h-full"
              // A filter keeps Chromium from handing the video to macOS as its own layer, which shows rotated
              // iPhone clips upside down on screen (screenshots look right). Visually a no-op.
              style={{ filter: 'saturate(1.001)' }}
              playsInline
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                // A file with an undecodable video track and a playable audio track plays sound only
                if (v.videoWidth === 0) return onVideoFailed?.();
                setNatural({ w: v.videoWidth, h: v.videoHeight });
                if (currentTimestamp) v.currentTime = currentTimestamp;
              }}
              onTimeUpdate={(e) => onTimeUpdate?.(e.currentTarget.currentTime)}
              onEnded={() => onPlayingChange?.(false)}
              onError={() => onVideoFailed?.()}
            />
          ) : (
            <img
              key={media.id}
              src={
                isVideo
                  ? `snapsort-media://frame/${media.id}/${Math.floor(currentTimestamp)}`
                  : `snapsort-media://display/${media.id}`
              }
              alt={media.name}
              className="w-full h-full object-contain"
              onLoad={(e) => {
                const img = e.currentTarget;
                if (!isVideo) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
          )}
          {/* Interactive Detection Bounding Box Overlays, over the picture itself */}
          {showDetections && detections && !(isPlaying && playable) && (
            <DetectionBoxes
              detections={detections}
              hoveredEntityId={hoveredEntityId}
              onHoverEntity={onHoverEntity}
              selectedEntityIds={selectedEntityIds}
            />
          )}
        </div>
      )}

      {isVideo && videoFailed && (
        <button
          type="button"
          onClick={onOpenExternally}
          className="absolute bottom-3 left-3 z-20 px-2.5 py-1 rounded-full bg-[var(--surface-1)]/90 border border-[var(--border)] text-[11px] font-medium text-[var(--text)] backdrop-blur-md shadow-md flex items-center gap-1.5 hover:border-[var(--accent)]"
          title="This video can't play here. Showing one frame per second."
        >
          <ExternalLink size={11} />
          Can't play here · Open in QuickTime
        </button>
      )}

      {/* Video Play / Pause Center Overlay (Clickable) */}
      {isVideo && (
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
          className={`absolute z-20 w-16 h-16 rounded-full ${isPlaying ? 'opacity-0 group-hover:opacity-100' : ''} bg-[var(--surface-1)]/85 hover:bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--accent)] text-[var(--text)] hover:text-[var(--accent)] flex items-center justify-center transition-all duration-200 shadow-2xl backdrop-blur-md cursor-pointer hover:scale-105 active:scale-95`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
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

const DetectionBoxes: React.FC<{
  detections: Detections;
  hoveredEntityId: string | null;
  onHoverEntity: (id: string | null) => void;
  selectedEntityIds: string[];
}> = ({ detections, hoveredEntityId, onHoverEntity, selectedEntityIds }) => {
  const hidden = (id: string) => selectedEntityIds.length > 0 && !selectedEntityIds.includes(id);
  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      {/* 1. Face Bounding Boxes (Electric Cyan #5AC8FA) */}
      {detections.faces.map((face, index) => {
        const entityId = `person-${face.personId ?? `unknown-${index}`}`;
        if (hidden(entityId)) return null;
        const isHovered = hoveredEntityId === entityId;
        const { x, y, w, h } = face.box;

        return (
          <div
            key={`${entityId}-${index}`}
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
              <span>{face.name || 'Unnamed'}</span>
            </div>
          </div>
        );
      })}

      {/* 2. Object Bounding Boxes (Electric Cyan #5AC8FA) */}
      {detections.objects.map((obj, index) => {
        const entityId = `object-${obj.labelId}`; // same id as the inspector card and timeline bars
        if (hidden(entityId)) return null;
        const isHovered = hoveredEntityId === entityId;
        const { x, y, w, h } = obj.box;

        return (
          <div
            key={`${entityId}-${index}`}
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
  );
};
