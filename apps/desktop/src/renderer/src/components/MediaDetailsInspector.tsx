import React, { useMemo } from 'react';
import type { MediaDetail } from '@snapsort/contract';
import {
  User,
  Box,
  Tag as TagIcon,
  MapPin,
  Calendar,
  Folder as FolderIcon,
  Clock,
  Layers,
  ListOrdered,
} from 'lucide-react';

interface MediaDetailsInspectorProps {
  media: MediaDetail;
  currentTimestamp: number;
  onSeek: (ts: number) => void;
  hoveredEntityId: string | null;
  onHoverEntity: (id: string | null) => void;
  activeTab: 'categorized' | 'timeline';
  onTabChange: (tab: 'categorized' | 'timeline') => void;
}

function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

/** "2026-10-09 14:03:00" as "Oct 9, 2026, 2:03 PM". Capture times are local; added-at times are UTC. */
function formatWhen(when: string, utc = false): string {
  const d = new Date(when.replace(' ', 'T') + (utc ? 'Z' : ''));
  return Number.isNaN(d.getTime())
    ? when
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MediaDetailsInspector: React.FC<MediaDetailsInspectorProps> = ({
  media,
  currentTimestamp,
  onSeek,
  hoveredEntityId,
  onHoverEntity,
  activeTab,
  onTabChange,
}) => {
  const isVideo = media.kind === 'video';

  // Aggregate all timeline cues sorted chronologically
  const chronologicalCues = useMemo(() => {
    if (!isVideo) return [];
    const cueMap = new Map<
      number,
      {
        ts: number;
        people: Array<{ id: number; name: string }>;
        objects: Array<{ labelId: string; name: string }>;
        tags: Array<{ id: string; name: string }>;
      }
    >();

    const getOrCreate = (ts: number) => {
      if (!cueMap.has(ts)) {
        cueMap.set(ts, { ts, people: [], objects: [], tags: [] });
      }
      return cueMap.get(ts)!;
    };

    (media.people || []).forEach((p) => {
      (p.timestamps || []).forEach((ts) => {
        getOrCreate(ts).people.push({ id: p.id, name: p.name || `Person ${p.id}` });
      });
    });

    (media.labels || []).forEach((l) => {
      (l.timestamps || []).forEach((ts) => {
        getOrCreate(ts).objects.push({ labelId: l.labelId, name: l.name || l.labelId });
      });
    });

    (media.tags || []).forEach((t) => {
      (t.timestamps || []).forEach((ts) => {
        getOrCreate(ts).tags.push({ id: t.id, name: t.name });
      });
    });

    return Array.from(cueMap.values()).sort((a, b) => a.ts - b.ts);
  }, [media, isVideo]);

  return (
    <div className="w-[340px] shrink-0 h-full flex flex-col bg-[var(--surface-1)] border-l border-[var(--border)] overflow-hidden select-none">
      {/* 1. Header & Media Meta */}
      <div className="p-5 border-b border-[var(--border)] flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text)] truncate" title={media.name}>
              {media.name}
            </h3>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              {media.width} × {media.height} · {isVideo ? `${formatTime(media.durationS || 0)}` : 'Image'}
            </span>
          </div>

          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider shrink-0 uppercase ${
              isVideo
                ? 'bg-amber-500/15 text-amber-700 dark:text-[#FFC400] dark:bg-[#FFC400]/15 border border-amber-500/30 dark:border-[#FFC400]/30'
                : 'bg-sky-500/15 text-sky-700 dark:text-[#38BDF8] dark:bg-[#38BDF8]/15 border border-sky-500/30 dark:border-[#38BDF8]/30'
            }`}
          >
            {isVideo ? (media.codec ? media.codec.toUpperCase() : 'Video') : 'Photo'}
          </span>
        </div>

        {/* Quick Meta Items */}
        <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
          {media.place && (
            <div className="flex items-center gap-1.5 truncate col-span-2">
              <MapPin size={12} className="text-emerald-500 shrink-0" />
              <span className="truncate text-[var(--text)]">{media.place.name}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 truncate col-span-2" title={media.folderPath}>
            <FolderIcon size={12} className="text-[var(--text-muted)] shrink-0" />
            <span className="truncate">
              {media.libraryName ? `${media.libraryName} · ` : ''}
              {media.folderPath ?? ''}
            </span>
          </div>

          <div
            className="flex items-center gap-1.5 truncate col-span-2"
            title={media.capturedAt ? 'Captured' : 'Added to snapsort'}
          >
            <Calendar size={12} className="text-[var(--text-muted)] shrink-0" />
            <span className="truncate">
              {media.capturedAt ? formatWhen(media.capturedAt) : `Added ${formatWhen(media.addedAt, true)}`}
            </span>
          </div>

          {(media.camera || media.sizeBytes || media.fps) && (
            <div className="truncate col-span-2 font-mono">
              {[media.camera, media.fps ? `${Math.round(media.fps)} fps` : null, media.sizeBytes ? formatBytes(media.sizeBytes) : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* 2. Dual Tab Selector (Categorized vs Timeline Cue Sheet) */}
      {isVideo && (
        <div className="px-5 pt-3 pb-2 flex gap-1 border-b border-[var(--border)] bg-[var(--surface-2)]">
          <button
            type="button"
            onClick={() => onTabChange('categorized')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'categorized'
                ? 'bg-[var(--surface-1)] text-[var(--text)] font-semibold shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
            }`}
          >
            <Layers size={13} />
            <span>Categorized</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('timeline')}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'timeline'
                ? 'bg-[var(--surface-1)] text-[var(--text)] font-semibold shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]'
            }`}
          >
            <ListOrdered size={13} />
            <span>Cue Sheet ({chronologicalCues.length})</span>
          </button>
        </div>
      )}

      {/* 3. Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {activeTab === 'categorized' || !isVideo ? (
          <>
            {/* --- PERSONS SECTION (Cyan / Sky) --- */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-[#38BDF8]">
                  <User size={13} />
                  <span>Persons ({media.people?.length || 0})</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] opacity-70">Cyan markers</span>
              </div>

              {media.people && media.people.length > 0 ? (
                <div className="space-y-2">
                  {media.people.map((person) => {
                    const entityId = `person-${person.id}`;
                    const isHovered = hoveredEntityId === entityId;

                    return (
                      <div
                        key={person.id}
                        onMouseEnter={() => onHoverEntity(entityId)}
                        onMouseLeave={() => onHoverEntity(null)}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isHovered
                            ? 'bg-sky-50/80 dark:bg-[#0E273C] border-sky-400 dark:border-[#38BDF8]/60 shadow-[0_0_12px_rgba(56,189,248,0.25)]'
                            : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-sky-400/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[var(--text)]">
                            {person.name || 'Unnamed person'}
                          </span>
                        </div>

                        {/* Timestamp Seek Pills for Video */}
                        {isVideo && person.timestamps && person.timestamps.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            <span className="text-[10px] text-[var(--text-muted)] mr-0.5">Appears:</span>
                            {person.timestamps.map((ts) => {
                              const isActive = Math.abs(ts - currentTimestamp) <= 1;
                              return (
                                <button
                                  key={ts}
                                  type="button"
                                  onClick={() => onSeek(ts)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-all cursor-pointer ${
                                    isActive
                                      ? 'bg-sky-500 text-white dark:bg-[#38BDF8] dark:text-[#0A1A28] font-bold shadow-sm scale-105'
                                      : 'bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 dark:bg-[#0A1A28] dark:text-[#38BDF8] dark:border-[#38BDF8]/30 dark:hover:bg-[#38BDF8]/20'
                                  }`}
                                  title={`Seek to ${formatTime(ts)}`}
                                >
                                  {formatTime(ts)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--border)]">
                  No people detected in this footage.
                </div>
              )}
            </div>

            {/* --- OBJECTS SECTION (Amber) --- */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-[#FFC400]">
                  <Box size={13} />
                  <span>Objects ({media.labels?.length || 0})</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] opacity-70">Amber markers</span>
              </div>

              {media.labels && media.labels.length > 0 ? (
                <div className="space-y-2">
                  {media.labels.map((label, idx) => {
                    const entityId = `object-${label.labelId}`;
                    const isHovered = hoveredEntityId === entityId;

                    return (
                      <div
                        key={`${label.labelId}-${idx}`}
                        onMouseEnter={() => onHoverEntity(entityId)}
                        onMouseLeave={() => onHoverEntity(null)}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isHovered
                            ? 'bg-amber-50/80 dark:bg-[#2E2405] border-amber-400 dark:border-[#FFC400]/60 shadow-[0_0_12px_rgba(255,196,0,0.25)]'
                            : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-amber-400/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[var(--text)] capitalize">
                            {label.name || label.labelId}
                          </span>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            {label.module}
                          </span>
                        </div>

                        {/* Timestamp Seek Pills for Video */}
                        {isVideo && label.timestamps && label.timestamps.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            <span className="text-[10px] text-[var(--text-muted)] mr-0.5">Appears:</span>
                            {label.timestamps.map((ts) => {
                              const isActive = Math.abs(ts - currentTimestamp) <= 1;
                              return (
                                <button
                                  key={ts}
                                  type="button"
                                  onClick={() => onSeek(ts)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-all cursor-pointer ${
                                    isActive
                                      ? 'bg-amber-500 text-white dark:bg-[#FFC400] dark:text-[#111111] font-bold shadow-sm scale-105'
                                      : 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 dark:bg-[#2E2405] dark:text-[#FFC400] dark:border-[#FFC400]/30 dark:hover:bg-[#FFC400]/20'
                                  }`}
                                  title={`Seek to ${formatTime(ts)}`}
                                >
                                  {formatTime(ts)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--border)]">
                  No objects detected.
                </div>
              )}
            </div>

            {/* --- TAGS & SCENES SECTION (Emerald) --- */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-[#34D399]">
                  <TagIcon size={13} />
                  <span>Tags & Scenes ({media.tags?.length || 0})</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] opacity-70">Emerald markers</span>
              </div>

              {media.tags && media.tags.length > 0 ? (
                <div className="space-y-2">
                  {media.tags.map((tag) => {
                    const entityId = `tag-${tag.id}`;
                    const isHovered = hoveredEntityId === entityId;

                    return (
                      <div
                        key={tag.id}
                        onMouseEnter={() => onHoverEntity(entityId)}
                        onMouseLeave={() => onHoverEntity(null)}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isHovered
                            ? 'bg-emerald-50/80 dark:bg-[#0A261B] border-emerald-400 dark:border-[#34D399]/60 shadow-[0_0_12px_rgba(52,211,153,0.25)]'
                            : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-emerald-400/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[var(--text)]">{tag.name}</span>
                          <span className="text-[10px] text-emerald-700 dark:text-[#34D399] font-mono">Tag</span>
                        </div>

                        {/* Timestamp Seek Pills for Video */}
                        {isVideo && tag.timestamps && tag.timestamps.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-2">
                            <span className="text-[10px] text-[var(--text-muted)] mr-0.5">Appears:</span>
                            {tag.timestamps.map((ts) => {
                              const isActive = Math.abs(ts - currentTimestamp) <= 1;
                              return (
                                <button
                                  key={ts}
                                  type="button"
                                  onClick={() => onSeek(ts)}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-all cursor-pointer ${
                                    isActive
                                      ? 'bg-emerald-500 text-white dark:bg-[#34D399] dark:text-[#052216] font-bold shadow-sm scale-105'
                                      : 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 dark:bg-[#0A261B] dark:text-[#34D399] dark:border-[#34D399]/30 dark:hover:bg-[#34D399]/20'
                                  }`}
                                  title={`Seek to ${formatTime(ts)}`}
                                >
                                  {formatTime(ts)}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-muted)] italic p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--border)]">
                  No scene tags associated.
                </div>
              )}
            </div>
          </>
        ) : (
          /* --- TIMELINE CUE SHEET (Chronological Stream) --- */
          <div className="space-y-2.5">
            <div className="text-[11px] text-[var(--text-muted)] mb-1">
              Select any moment to jump the player to that timestamp:
            </div>

            {chronologicalCues.map((cue) => {
              const isActive = Math.abs(cue.ts - currentTimestamp) <= 1;

              return (
                <div
                  key={cue.ts}
                  onClick={() => onSeek(cue.ts)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[var(--surface-1)] border-[var(--accent)] ring-1 ring-[var(--accent)]/50 shadow-md'
                      : 'bg-[var(--surface-2)] border-[var(--border)] hover:border-[var(--text-muted)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        isActive
                          ? 'bg-[var(--accent)] text-black'
                          : 'bg-[var(--surface-3)] text-[var(--text)]'
                      }`}
                    >
                      {formatTime(cue.ts)}
                    </span>
                    {isActive && (
                      <span className="text-[10px] text-amber-600 dark:text-[#FFC400] font-semibold tracking-wider uppercase">
                        Current Playhead
                      </span>
                    )}
                  </div>

                  {/* Active detections summary pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {cue.people.map((p) => (
                      <span
                        key={`cue-p-${p.id}`}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300 dark:bg-[#0E273C] dark:text-[#38BDF8] dark:border-[#38BDF8]/30 font-medium flex items-center gap-1"
                      >
                        <User size={9} />
                        {p.name}
                      </span>
                    ))}
                    {cue.objects.map((o) => (
                      <span
                        key={`cue-o-${o.labelId}`}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 dark:bg-[#2E2405] dark:text-[#FFC400] dark:border-[#FFC400]/30 font-medium flex items-center gap-1"
                      >
                        <Box size={9} />
                        {o.name}
                      </span>
                    ))}
                    {cue.tags.map((t) => (
                      <span
                        key={`cue-t-${t.id}`}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-[#0A261B] dark:text-[#34D399] dark:border-[#34D399]/30 font-medium flex items-center gap-1"
                      >
                        <TagIcon size={9} />
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
