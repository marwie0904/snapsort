import React, { useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, RotateCw, Gauge } from 'lucide-react';
import { toRanges, inRange, formatTime, formatRange } from '../utils/timeRanges';

interface VideoTimelineScrubberProps {
  durationS: number;
  currentTimestamp: number;
  onSeek: (ts: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  people: Array<{ id: number; name: string | null; timestamps?: number[] }>;
  labels: Array<{ labelId: string; name?: string; timestamps?: number[] }>;
  tags: Array<{ id: string; name: string; timestamps?: number[] }>;
  hoveredEntityId: string | null;
  onHoverEntity: (id: string | null) => void;
  /** When non-empty, only these entities' bars are drawn. */
  selectedEntityIds?: string[];
  playbackSpeed: number;
  onChangePlaybackSpeed: (speed: number) => void;
  /** Seconds the current search matched, marked along the bottom of the track. */
  matches?: number[];
  /** For the hover preview: snapsort-media://frame/<mediaId>/<second>, one frame per second. */
  mediaId: number;
  frameCount?: number;
  aspectRatio?: number;
}

// One lane per kind: persons top, objects middle, tags bottom (search ticks sit under them)
const LANES = [
  {
    label: 'Persons',
    top: 'top-[5px]',
    bar: 'bg-sky-500 dark:bg-[#38BDF8]',
    glow: 'ring-2 ring-sky-400 dark:ring-[#38BDF8] shadow-[0_0_8px_#38BDF8]',
    pill: 'text-sky-800 dark:text-[#38BDF8] bg-sky-100 dark:bg-[#0E273C] border-sky-300 dark:border-[#38BDF8]/30',
  },
  {
    label: 'Objects',
    top: 'top-4',
    bar: 'bg-amber-500 dark:bg-[#FFC400]',
    glow: 'ring-2 ring-amber-400 dark:ring-[#FFC400] shadow-[0_0_8px_#FFC400]',
    pill: 'text-amber-900 dark:text-[#FFC400] bg-amber-100 dark:bg-[#2E2405] border-amber-300 dark:border-[#FFC400]/30',
  },
  {
    label: 'Tags & Scenes',
    top: 'top-[27px]',
    bar: 'bg-emerald-500 dark:bg-[#34D399]',
    glow: 'ring-2 ring-emerald-400 dark:ring-[#34D399] shadow-[0_0_8px_#34D399]',
    pill: 'text-emerald-900 dark:text-[#34D399] bg-emerald-100 dark:bg-[#0A261B] border-emerald-300 dark:border-[#34D399]/30',
  },
];

const PREVIEW_W = 160;
const TOOLTIP_HALF = 92; // half the tooltip's width (PREVIEW_W + padding), keeps it over the track

export const VideoTimelineScrubber: React.FC<VideoTimelineScrubberProps> = ({
  durationS,
  currentTimestamp,
  onSeek,
  isPlaying,
  onTogglePlay,
  people,
  labels,
  tags,
  hoveredEntityId,
  onHoverEntity,
  selectedEntityIds = [],
  playbackSpeed,
  onChangePlaybackSpeed,
  matches = [],
  mediaId,
  frameCount,
  aspectRatio = 16 / 9,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredTs, setHoveredTs] = useState<number | null>(null);
  // Viewport coordinates: the tooltip is portalled to <body> so no overflow-hidden ancestor clips it
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [failedFrame, setFailedFrame] = useState<string | null>(null);

  const safeDuration = Math.max(1, durationS);
  const progressPercent = Math.min(100, Math.max(0, (currentTimestamp / safeDuration) * 100));

  // Entities per lane, each with its contiguous appearance ranges
  const laneEntities = useMemo(
    () => [
      people.map((p) => ({ id: `person-${p.id}`, name: p.name || 'Unnamed person', ranges: toRanges(p.timestamps) })),
      labels.map((l) => ({ id: `object-${l.labelId}`, name: l.name || l.labelId, ranges: toRanges(l.timestamps) })),
      tags.map((t) => ({ id: `tag-${t.id}`, name: t.name, ranges: toRanges(t.timestamps) })),
    ],
    [people, labels, tags]
  );

  // Entities present at the hovered second, per lane
  const entitiesAtHoveredTs = useMemo(() => {
    if (hoveredTs === null) return null;
    return laneEntities.map((list) => list.filter((e) => e.ranges.some((r) => inRange(r, hoveredTs))));
  }, [hoveredTs, laneEntities]);

  const frameSrc =
    hoveredTs === null
      ? null
      : `snapsort-media://frame/${mediaId}/${frameCount ? Math.min(hoveredTs, frameCount - 1) : hoveredTs}`;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Math.floor(ratio * safeDuration));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ts = Math.floor(ratio * safeDuration);
    setHoveredTs(ts);
    setTooltipPos({
      x: Math.max(rect.left + TOOLTIP_HALF, Math.min(e.clientX, rect.right - TOOLTIP_HALF)),
      y: rect.top,
    });

    if (isDragging) {
      onSeek(ts);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }
  };

  const handlePointerLeave = () => {
    if (!isDragging) {
      setHoveredTs(null);
    }
  };

  const handleSkip = (seconds: number) => {
    const next = Math.max(0, Math.min(safeDuration, currentTimestamp + seconds));
    onSeek(next);
  };

  const speedOptions = [1, 1.5, 2];
  const nextSpeedIndex = (speedOptions.indexOf(playbackSpeed) + 1) % speedOptions.length;

  return (
    <div className="w-full bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-4 flex flex-col gap-3 shadow-[var(--shadow-card)] select-none">
      {/* 1. Playback Controls Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Play / Pause Toggle */}
          <button
            type="button"
            onClick={onTogglePlay}
            className="w-9 h-9 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--accent)] text-[var(--text)] hover:text-black flex items-center justify-center transition-all duration-150 border border-[var(--border)] hover:border-[var(--accent)] cursor-pointer shadow-sm"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
          </button>

          {/* Jump -5s */}
          <button
            type="button"
            onClick={() => handleSkip(-5)}
            className="p-2 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] transition-all cursor-pointer shadow-sm"
            title="Jump back 5s"
          >
            <RotateCcw size={14} />
          </button>

          {/* Jump +5s */}
          <button
            type="button"
            onClick={() => handleSkip(5)}
            className="p-2 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] transition-all cursor-pointer shadow-sm"
            title="Jump forward 5s"
          >
            <RotateCw size={14} />
          </button>

          {/* Formatted Time Label */}
          <div className="ml-2 font-mono text-xs text-[var(--text)] font-medium tracking-wider">
            <span>{formatTime(currentTimestamp)}</span>
            <span className="text-[var(--text-muted)] mx-1.5">/</span>
            <span className="text-[var(--text-muted)]">{formatTime(durationS)}</span>
          </div>
        </div>

        {/* Right side controls: Playback Speed & Timeline legend */}
        <div className="flex items-center gap-3">
          {/* Speed Toggle */}
          <button
            type="button"
            onClick={() => onChangePlaybackSpeed(speedOptions[nextSpeedIndex])}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-all cursor-pointer"
            title="Playback Speed"
          >
            <Gauge size={12} className="text-[var(--text-muted)]" />
            <span>{playbackSpeed}x</span>
          </button>
        </div>
      </div>

      {/* 2. Interactive Scrubber Track Container */}
      <div className="relative pt-1 pb-1">
        <div
          ref={trackRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className="relative h-11 w-full bg-[var(--surface-2)] hover:bg-[var(--surface-3)] border border-[var(--border)] rounded-xl overflow-hidden cursor-pointer transition-colors"
        >
          {/* Filmstrip Frame Lines Background */}
          <div className="absolute inset-0 flex justify-between pointer-events-none opacity-30">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="w-[1px] h-full bg-[var(--border)]" />
            ))}
          </div>

          {/* Elapsed Progress Bar */}
          <div
            style={{ width: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 left-0 bg-[var(--surface-3)]/70 border-r-2 border-[var(--accent)] transition-[width] duration-75 pointer-events-none"
          />

          {/* Search matches: one accent tick per matched second */}
          {matches.map((ts) => (
            <div
              key={`m-${ts}`}
              style={{ left: `${(ts / safeDuration) * 100}%`, width: `${Math.max(0.6, 100 / safeDuration)}%` }}
              className="absolute bottom-0 h-1.5 bg-[var(--accent)] pointer-events-none"
              title={`Search match at ${formatTime(ts)}`}
            />
          ))}

          {/* --- COLOR-CODED RANGE BARS (one per contiguous appearance) --- */}
          {LANES.map((lane, li) =>
            laneEntities[li].map((entity) => {
              if (selectedEntityIds.length > 0 && !selectedEntityIds.includes(entity.id)) return null;
              const isHovered = hoveredEntityId === entity.id || selectedEntityIds.includes(entity.id);
              return entity.ranges.map((r) => (
                <div
                  key={`${entity.id}-${r.start}`}
                  style={{
                    left: `${(r.start / safeDuration) * 100}%`,
                    width: `${(Math.max(0, Math.min(r.end + 1, safeDuration) - r.start) / safeDuration) * 100}%`,
                  }}
                  onMouseEnter={() => onHoverEntity(entity.id)}
                  onMouseLeave={() => onHoverEntity(null)}
                  className={`absolute ${lane.top} h-2 min-w-1 rounded-full ${lane.bar} transition-opacity ${
                    isHovered ? `opacity-100 z-10 ${lane.glow}` : 'opacity-50 hover:opacity-90'
                  }`}
                  title={`${entity.name}: ${formatRange(r)}`}
                />
              ));
            })
          )}

          {/* Playhead Pin Handle */}
          <div
            style={{ left: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 -ml-1 w-2 flex flex-col items-center pointer-events-none z-20"
          >
            <div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full shadow-[0_0_8px_var(--accent)] -mt-0.5" />
            <div className="w-0.5 flex-1 bg-[var(--accent)]" />
          </div>
        </div>

        {/* Scrubber Hover Tooltip: frame preview + who/what is on screen at that second */}
        {hoveredTs !== null &&
          entitiesAtHoveredTs &&
          createPortal(
            <div
              style={{ left: tooltipPos.x, top: tooltipPos.y - 8 }}
              className="fixed -translate-x-1/2 -translate-y-full z-50 w-[184px] p-1.5 rounded-xl bg-[var(--surface-1)]/95 border border-[var(--border)] shadow-2xl backdrop-blur-md pointer-events-none flex flex-col items-center gap-1"
            >
              {frameSrc && failedFrame !== frameSrc && (
                <img
                  src={frameSrc}
                  alt=""
                  onError={() => setFailedFrame(frameSrc)}
                  style={{ width: PREVIEW_W * Math.min(1, aspectRatio), aspectRatio }}
                  className="rounded-lg object-cover bg-[var(--surface-2)]"
                />
              )}

              <span className="text-[11px] font-mono text-[var(--text)] font-semibold">
                {formatTime(hoveredTs)}
              </span>

              {/* Tag / Person / Object summary in tooltip */}
              <div className="flex items-center gap-1.5 flex-wrap justify-center text-[9px]">
                {LANES.map((lane, li) =>
                  entitiesAtHoveredTs[li].map((entity) => (
                    <span key={entity.id} className={`${lane.pill} px-1 py-0.5 rounded border font-medium`}>
                      {entity.name}
                    </span>
                  ))
                )}
                {entitiesAtHoveredTs.every((list) => list.length === 0) && (
                  <span className="text-[var(--text-muted)]">No tags at frame</span>
                )}
              </div>
            </div>,
            document.body
          )}
      </div>

      {/* 3. Color-Coded Legend Footer */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5 px-1">
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-muted)] opacity-80">
            Timeline Tags:
          </span>
          {LANES.map((lane, li) => (
            <div key={lane.label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${lane.bar}`} />
              <span className="text-[var(--text)]">
                {lane.label} ({laneEntities[li].length})
              </span>
            </div>
          ))}
        </div>

        <span className="text-[10px] text-[var(--text-muted)] opacity-70">
          Click or scrub timeline to jump to timestamp
        </span>
      </div>
    </div>
  );
};
