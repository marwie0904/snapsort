import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Sparkles,
  Plus,
  Check,
  Layers,
} from 'lucide-react';
import type { MediaSummary } from '@snapsort/contract';
import { MockSnapsortApi } from '@snapsort/mock';
import { useUiStore } from '../stores/useUiStore';
import { useShelfStore } from '../stores/useShelfStore';
import { MediaCanvas } from './MediaCanvas';
import { VideoTimelineScrubber } from './VideoTimelineScrubber';
import { MediaDetailsInspector } from './MediaDetailsInspector';
import { MediaFilmstrip } from './MediaFilmstrip';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

interface MediaDetailViewProps {
  items: MediaSummary[];
}

export const MediaDetailView: React.FC<MediaDetailViewProps> = ({ items }) => {
  const api = useMemo(() => getApi(), []);
  const {
    selectedMediaId,
    closeMediaDetail,
    currentMediaTimestamp,
    seekToTimestamp,
    isPlaying,
    setIsPlaying,
    togglePlayPause,
    showDetections,
    setShowDetections,
    hoveredEntityId,
    setHoveredEntityId,
    inspectorTab,
    setInspectorTab,
    nextMedia,
    prevMedia,
    openMediaDetail,
  } = useUiStore();

  const { items: shelfItems, addItem, removeItem } = useShelfStore();
  const inShelf = selectedMediaId !== null && shelfItems.some((s) => s.id === selectedMediaId);

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // 1. Fetch Media Details
  const { data: media, isLoading: isLoadingMedia } = useQuery({
    queryKey: ['mediaDetail', selectedMediaId],
    queryFn: () => (selectedMediaId ? api.getMedia(selectedMediaId) : Promise.reject('No ID')),
    enabled: selectedMediaId !== null,
  });

  // 2. Fetch Detections at current timestamp
  const { data: detections, isLoading: isLoadingDetections } = useQuery({
    queryKey: ['mediaDetections', selectedMediaId, currentMediaTimestamp],
    queryFn: () =>
      selectedMediaId
        ? api.getDetections(selectedMediaId, currentMediaTimestamp)
        : Promise.reject('No ID'),
    enabled: selectedMediaId !== null && showDetections,
  });

  // 3. Simulated Video Playback Engine
  useEffect(() => {
    if (!isPlaying || !media || media.kind !== 'video') return;

    const duration = media.durationS || 10;
    const intervalMs = 1000 / playbackSpeed;

    const interval = setInterval(() => {
      seekToTimestamp(
        currentMediaTimestamp >= duration ? 0 : currentMediaTimestamp + 1
      );
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, media, currentMediaTimestamp, playbackSpeed, seekToTimestamp]);

  // 4. Keyboard Shortcuts: Esc to exit, Arrows to navigate, Space to toggle playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMediaDetail();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextMedia(items);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevMedia(items);
      } else if (e.key === ' ' || e.code === 'Space') {
        if (media?.kind === 'video') {
          e.preventDefault();
          togglePlayPause();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeMediaDetail, nextMedia, prevMedia, items, togglePlayPause, media]);

  if (!selectedMediaId || isLoadingMedia || !media) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-[var(--text-muted)]">
        Loading media preview...
      </div>
    );
  }

  const currentIndex = items.findIndex((i) => i.id === selectedMediaId);
  const isVideo = media.kind === 'video';

  return (
    <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden select-none">
      {/* 1. Top Detail Navigation Bar */}
      <div className="shrink-0 mb-3 flex items-center justify-between pb-3 border-b border-[var(--border)]">
        {/* Left: Back Button & Title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={closeMediaDetail}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-medium text-[var(--text)] border border-[var(--border)] transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft size={14} />
            <span>All footage</span>
          </button>

          <div className="h-4 w-[1px] bg-[var(--border)]" />

          <h2 className="text-base font-semibold text-[var(--text)] tracking-tight">
            {media.name}
          </h2>
        </div>

        {/* Right: Actions & Prev/Next */}
        <div className="flex items-center gap-2.5">
          {/* Toggle Bounding Box Detections */}
          <button
            type="button"
            onClick={() => setShowDetections(!showDetections)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              showDetections
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-[#FFC400] dark:bg-[#FFC400]/15 dark:border-[#FFC400]/40 hover:bg-amber-500/25'
                : 'bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
            }`}
            title="Toggle Face & Object Detections Overlay"
          >
            {showDetections ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>{showDetections ? 'Detections On' : 'Detections Off'}</span>
          </button>

          {/* Add to Shelf Button */}
          <button
            type="button"
            onClick={() => {
              if (!media) return;
              if (inShelf) {
                removeItem(media.id);
              } else {
                addItem(media);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              inShelf
                ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)] shadow-xs'
                : 'bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
            }`}
            title={inShelf ? 'Remove from Shelf' : 'Add to Staging Shelf'}
          >
            {inShelf ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} />}
            <span>{inShelf ? 'In Shelf' : 'Add to Shelf'}</span>
          </button>

          {/* Prev / Next Chevrons */}
          <div className="flex items-center bg-[var(--surface-1)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => prevMedia(items)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-all cursor-pointer"
              title="Previous item (←)"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="text-[11px] font-mono text-[var(--text-muted)] px-2">
              {currentIndex >= 0 ? currentIndex + 1 : 1} / {items.length}
            </span>

            <button
              type="button"
              onClick={() => nextMedia(items)}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-all cursor-pointer"
              title="Next item (→)"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Media Viewer Body */}
      <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
        {/* Left Column: Canvas + Scrubber + Filmstrip */}
        <div className="flex-1 min-w-0 flex flex-col justify-between overflow-y-auto pr-1 pb-4 gap-4">
          {/* Main Visual Display (Canvas) */}
          <div className="w-full shrink-0">
            <MediaCanvas
              media={media}
              detections={detections}
              isLoadingDetections={isLoadingDetections}
              showDetections={showDetections}
              hoveredEntityId={hoveredEntityId}
              onHoverEntity={setHoveredEntityId}
              currentTimestamp={currentMediaTimestamp}
              isPlaying={isPlaying}
              onTogglePlay={togglePlayPause}
            />
          </div>

          {/* Scrubber Bar (Only for Videos) */}
          {isVideo && (
            <div className="w-full shrink-0">
              <VideoTimelineScrubber
                durationS={media.durationS || 1}
                currentTimestamp={currentMediaTimestamp}
                onSeek={seekToTimestamp}
                isPlaying={isPlaying}
                onTogglePlay={togglePlayPause}
                people={media.people || []}
                labels={media.labels || []}
                tags={media.tags || []}
                hoveredEntityId={hoveredEntityId}
                onHoverEntity={setHoveredEntityId}
                playbackSpeed={playbackSpeed}
                onChangePlaybackSpeed={setPlaybackSpeed}
              />
            </div>
          )}

          {/* Bottom Filmstrip Carousel */}
          <div className="w-full shrink-0 pt-2 border-t border-[var(--border)]">
            <MediaFilmstrip
              items={items}
              selectedMediaId={selectedMediaId}
              onSelectMedia={openMediaDetail}
            />
          </div>
        </div>

        {/* Right Column: Details Inspector */}
        <MediaDetailsInspector
          media={media}
          currentTimestamp={currentMediaTimestamp}
          onSeek={seekToTimestamp}
          hoveredEntityId={hoveredEntityId}
          onHoverEntity={setHoveredEntityId}
          activeTab={inspectorTab}
          onTabChange={setInspectorTab}
        />
      </div>
    </div>
  );
};
