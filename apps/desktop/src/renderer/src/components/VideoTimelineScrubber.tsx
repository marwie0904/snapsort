import React, { useRef, useState, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  User,
  Box,
  Tag,
  Gauge,
} from 'lucide-react';

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
  playbackSpeed: number;
  onChangePlaybackSpeed: (speed: number) => void;
  /** Seconds the current search matched, marked along the bottom of the track. */
  matches?: number[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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
  playbackSpeed,
  onChangePlaybackSpeed,
  matches = [],
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredTs, setHoveredTs] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<number>(0);

  const safeDuration = Math.max(1, durationS);
  const progressPercent = Math.min(100, Math.max(0, (currentTimestamp / safeDuration) * 100));

  // Compute timestamp markers with metadata
  const personMarkers = useMemo(() => {
    const list: Array<{ ts: number; personId: number; name: string }> = [];
    people.forEach((p) => {
      (p.timestamps || []).forEach((ts) => {
        list.push({ ts, personId: p.id, name: p.name || 'Unnamed person' });
      });
    });
    return list;
  }, [people]);

  const objectMarkers = useMemo(() => {
    const list: Array<{ ts: number; labelId: string; name: string }> = [];
    labels.forEach((l) => {
      (l.timestamps || []).forEach((ts) => {
        list.push({ ts, labelId: l.labelId, name: l.name || l.labelId });
      });
    });
    return list;
  }, [labels]);

  const tagMarkers = useMemo(() => {
    const list: Array<{ ts: number; id: string; name: string }> = [];
    tags.forEach((t) => {
      (t.timestamps || []).forEach((ts) => {
        list.push({ ts, id: t.id, name: t.name });
      });
    });
    return list;
  }, [tags]);

  // Resolve entities active at hovered timestamp
  const entitiesAtHoveredTs = useMemo(() => {
    if (hoveredTs === null) return null;
    const activePeople = people
      .filter((p) => p.timestamps?.some((t) => Math.abs(t - hoveredTs) <= 1))
      .map((p) => p.name || 'Unnamed person');
    const activeObjects = labels
      .filter((l) => l.timestamps?.some((t) => Math.abs(t - hoveredTs) <= 1))
      .map((l) => l.name || l.labelId);
    const activeTags = tags
      .filter((t) => t.timestamps?.some((time) => Math.abs(time - hoveredTs) <= 1))
      .map((t) => t.name);

    return {
      people: activePeople,
      objects: activeObjects,
      tags: activeTags,
    };
  }, [hoveredTs, people, labels, tags]);

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
    setTooltipPos(e.clientX - rect.left);

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

          {/* --- COLOR-CODED MARKERS --- */}
          {/* 1. Person Markers (Theme-calibrated Sky/Cyan) */}
          {personMarkers.map((m, idx) => {
            const leftPercent = (m.ts / safeDuration) * 100;
            const isHovered = hoveredEntityId === `person-${m.personId}`;
            return (
              <div
                key={`p-${m.personId}-${m.ts}-${idx}`}
                style={{ left: `${leftPercent}%` }}
                onMouseEnter={() => onHoverEntity(`person-${m.personId}`)}
                onMouseLeave={() => onHoverEntity(null)}
                className={`absolute top-1.5 bottom-6 w-1 rounded-full bg-sky-500 dark:bg-[#38BDF8] z-10 transition-transform ${
                  isHovered ? 'scale-y-125 ring-2 ring-sky-400 dark:ring-[#38BDF8] shadow-[0_0_8px_#38BDF8]' : 'opacity-80 hover:opacity-100 hover:scale-110'
                }`}
                title={`[${formatTime(m.ts)}] Person: ${m.name}`}
              />
            );
          })}

          {/* 2. Object Markers (Theme-calibrated Amber) */}
          {objectMarkers.map((m, idx) => {
            const leftPercent = (m.ts / safeDuration) * 100;
            const isHovered = hoveredEntityId === `object-${m.labelId}`;
            return (
              <div
                key={`o-${m.labelId}-${m.ts}-${idx}`}
                style={{ left: `${leftPercent}%` }}
                onMouseEnter={() => onHoverEntity(`object-${m.labelId}`)}
                onMouseLeave={() => onHoverEntity(null)}
                className={`absolute top-4 bottom-3 w-1 rounded-full bg-amber-500 dark:bg-[#FFC400] z-10 transition-transform ${
                  isHovered ? 'scale-y-125 ring-2 ring-amber-400 dark:ring-[#FFC400] shadow-[0_0_8px_#FFC400]' : 'opacity-80 hover:opacity-100 hover:scale-110'
                }`}
                title={`[${formatTime(m.ts)}] Object: ${m.name}`}
              />
            );
          })}

          {/* 3. Tag Markers (Theme-calibrated Emerald) */}
          {tagMarkers.map((m, idx) => {
            const leftPercent = (m.ts / safeDuration) * 100;
            const isHovered = hoveredEntityId === `tag-${m.id}`;
            return (
              <div
                key={`t-${m.id}-${m.ts}-${idx}`}
                style={{ left: `${leftPercent}%` }}
                onMouseEnter={() => onHoverEntity(`tag-${m.id}`)}
                onMouseLeave={() => onHoverEntity(null)}
                className={`absolute top-6 bottom-1.5 w-1 rounded-full bg-emerald-500 dark:bg-[#34D399] z-10 transition-transform ${
                  isHovered ? 'scale-y-125 ring-2 ring-emerald-400 dark:ring-[#34D399] shadow-[0_0_8px_#34D399]' : 'opacity-80 hover:opacity-100 hover:scale-110'
                }`}
                title={`[${formatTime(m.ts)}] Tag: ${m.name}`}
              />
            );
          })}

          {/* Playhead Pin Handle */}
          <div
            style={{ left: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 -ml-1 w-2 flex flex-col items-center pointer-events-none z-20"
          >
            <div className="w-2.5 h-2.5 bg-[var(--accent)] rounded-full shadow-[0_0_8px_var(--accent)] -mt-0.5" />
            <div className="w-0.5 flex-1 bg-[var(--accent)]" />
          </div>
        </div>

        {/* Scrubber Hover Tooltip (outside the track, whose overflow-hidden would clip it) */}
        {hoveredTs !== null && entitiesAtHoveredTs && (
          <div
            style={{
              left: `${Math.max(60, Math.min(tooltipPos, (trackRef.current?.clientWidth || 300) - 100))}px`,
            }}
            className="absolute -top-14 -translate-x-1/2 z-40 px-2.5 py-1.5 rounded-xl bg-[var(--surface-1)]/95 border border-[var(--border)] shadow-2xl backdrop-blur-md pointer-events-none flex flex-col items-center gap-1 min-w-[120px]"
          >
            <span className="text-[11px] font-mono text-[var(--text)] font-semibold">
              {formatTime(hoveredTs)}
            </span>

            {/* Tag / Person / Object summary in tooltip */}
            <div className="flex items-center gap-1.5 flex-wrap justify-center text-[9px]">
              {entitiesAtHoveredTs.people.map((name, i) => (
                <span
                  key={`p-${i}`}
                  className="text-sky-800 dark:text-[#38BDF8] bg-sky-100 dark:bg-[#0E273C] px-1 py-0.5 rounded border border-sky-300 dark:border-[#38BDF8]/30 font-medium"
                >
                  {name}
                </span>
              ))}
              {entitiesAtHoveredTs.objects.map((name, i) => (
                <span
                  key={`o-${i}`}
                  className="text-amber-900 dark:text-[#FFC400] bg-amber-100 dark:bg-[#2E2405] px-1 py-0.5 rounded border border-amber-300 dark:border-[#FFC400]/30 font-medium"
                >
                  {name}
                </span>
              ))}
              {entitiesAtHoveredTs.tags.map((name, i) => (
                <span
                  key={`t-${i}`}
                  className="text-emerald-900 dark:text-[#34D399] bg-emerald-100 dark:bg-[#0A261B] px-1 py-0.5 rounded border border-emerald-300 dark:border-[#34D399]/30 font-medium"
                >
                  {name}
                </span>
              ))}
              {entitiesAtHoveredTs.people.length === 0 &&
                entitiesAtHoveredTs.objects.length === 0 &&
                entitiesAtHoveredTs.tags.length === 0 && (
                  <span className="text-[var(--text-muted)]">No tags at frame</span>
                )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Color-Coded Legend Footer */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-0.5 px-1">
        <div className="flex items-center gap-4">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-muted)] opacity-80">
            Timeline Tags:
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-500 dark:bg-[#38BDF8]" />
            <span className="text-[var(--text)]">Persons ({personMarkers.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 dark:bg-[#FFC400]" />
            <span className="text-[var(--text)]">Objects ({objectMarkers.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-[#34D399]" />
            <span className="text-[var(--text)]">Tags & Scenes ({tagMarkers.length})</span>
          </div>
        </div>

        <span className="text-[10px] text-[var(--text-muted)] opacity-70">
          Click or scrub timeline to jump to timestamp
        </span>
      </div>
    </div>
  );
};
