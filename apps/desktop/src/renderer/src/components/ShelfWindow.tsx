import React, { useEffect, useState } from 'react';
import {
  Pin,
  PinOff,
  Trash2,
  X,
  Layers,
  GripVertical,
  CheckSquare,
  Square,
  Film,
  Image as ImageIcon,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@snapsort/ui';
import { useShelfStore } from '../stores/useShelfStore';
import type { ShelfItem } from '@snapsort/contract';

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const ShelfWindow: React.FC = () => {
  const {
    items,
    selectedIds,
    isPinned,
    togglePin,
    closeShelf,
    removeItem,
    clearShelf,
    toggleSelect,
    selectAll,
    clearSelection,
    startDrag,
    addItem,
    initShelfSync,
  } = useShelfStore();

  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    const cleanup = initShelfSync();
    return cleanup;
  }, [initShelfSync]);

  const handleWindowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      if (dataStr) {
        const parsed = JSON.parse(dataStr);
        if (parsed && (parsed.id || parsed.name)) {
          addItem(parsed);
        }
      }
    } catch (err) {
      console.error('Failed to parse dropped media item:', err);
    }
  };

  const handleWindowDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleWindowDragLeave = (e: React.DragEvent) => {
    // Only deactivate if leaving the container
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleCardDragStart = (e: React.DragEvent, item: ShelfItem) => {
    const isSelected = selectedIds.includes(item.id);
    const idsToDrag = isSelected && selectedIds.length > 1 ? selectedIds : [item.id];

    // Set standard data for external compatibility
    e.dataTransfer.setData('text/plain', item.path);
    e.dataTransfer.effectAllowed = 'copyMove';

    // Trigger Electron native file drag
    startDrag(idsToDrag);
  };

  const handleBatchDragStart = (e: React.DragEvent) => {
    const idsToDrag = selectedIds.length > 0 ? selectedIds : items.map((i) => i.id);
    if (idsToDrag.length === 0) return;

    e.dataTransfer.setData('text/plain', 'Snapsort Staging Batch');
    e.dataTransfer.effectAllowed = 'copyMove';
    startDrag(idsToDrag);
  };

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const videoCount = items.filter((i) => i.kind === 'video').length;
  const imageCount = items.filter((i) => i.kind === 'image').length;

  return (
    <div
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
      className={`h-screen w-screen flex flex-col bg-[var(--surface-0)] text-[var(--text)] select-none overflow-hidden border transition-colors ${
        isDragOver
          ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]/30'
          : 'border-[var(--border)]'
      }`}
    >
      {/* 1. Header with Window Controls */}
      <header
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="shrink-0 h-11 px-3 bg-[var(--surface-1)] border-b border-[var(--border)] flex items-center justify-between"
      >
        {/* Left: Branding & Count */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[var(--accent)] flex items-center justify-center text-[var(--accent-ink)] shadow-xs">
            <Layers size={13} strokeWidth={2.5} />
          </div>
          <span className="text-xs font-bold tracking-tight text-[var(--text)]">
            Shelf
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)] tabular-nums">
            {items.length}
          </span>
        </div>

        {/* Right: Window Controls (no-drag) */}
        <div
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center gap-1.5"
        >
          {/* Toggle Always-On-Top Pin */}
          <button
            type="button"
            onClick={togglePin}
            title={
              isPinned
                ? 'Always on top: ACTIVE (Click to unpin)'
                : 'Always on top: INACTIVE (Click to pin on top of CapCut/Adobe)'
            }
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isPinned
                ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)] shadow-xs'
                : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            {isPinned ? <Pin size={13} strokeWidth={2.2} /> : <PinOff size={13} />}
          </button>

          {/* Close Shelf Window */}
          <button
            type="button"
            onClick={closeShelf}
            title="Close Shelf"
            className="p-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-all cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      {/* 2. Sub-Toolbar (Batch Drag & Selection Actions) */}
      {items.length > 0 && (
        <div className="shrink-0 px-3 py-2 bg-[var(--surface-1)]/70 border-b border-[var(--border)] flex items-center justify-between text-[11px]">
          {/* Left: Select All / Clear Selection */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={allSelected ? clearSelection : selectAll}
              className="flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              {allSelected ? <CheckSquare size={13} className="text-[var(--accent)]" /> : <Square size={13} />}
              <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
            </button>

            {selectedIds.length > 0 && (
              <span className="text-[10px] text-[var(--accent)] font-medium tabular-nums">
                ({selectedIds.length} selected)
              </span>
            )}
          </div>

          {/* Right: Drag All & Clear Shelf */}
          <div className="flex items-center gap-1.5">
            {/* Draggable Batch Handle */}
            <div
              draggable="true"
              onDragStart={handleBatchDragStart}
              title="Drag this batch directly into CapCut, Premiere Pro, or folders"
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-[11px] hover:brightness-105 active:scale-95 transition-all cursor-grab active:cursor-grabbing shadow-xs"
            >
              <GripVertical size={12} />
              <span>
                {selectedIds.length > 0
                  ? `Drag (${selectedIds.length})`
                  : `Drag All (${items.length})`}
              </span>
            </div>

            {/* Clear All */}
            <button
              type="button"
              onClick={clearShelf}
              title="Empty shelf"
              className="p-1 rounded-md text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {/* 3. Drag Drop Overlay Indicator */}
      {isDragOver && (
        <div className="absolute inset-x-3 top-14 bottom-10 z-50 rounded-xl bg-[var(--accent)]/10 border-2 border-dashed border-[var(--accent)] flex flex-col items-center justify-center pointer-events-none backdrop-blur-xs">
          <Sparkles size={28} className="text-[var(--accent)] mb-2 animate-bounce" />
          <span className="text-xs font-bold text-[var(--accent)]">
            Drop footage to add to Shelf
          </span>
        </div>
      )}

      {/* 4. Media Items Grid */}
      <main className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-[var(--border)] rounded-xl bg-[var(--surface-1)]/40">
            <div className="w-12 h-12 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] mb-3">
              <Layers size={22} className="text-[var(--accent)]" />
            </div>
            <h3 className="text-xs font-semibold text-[var(--text)] mb-1">
              Your Shelf is empty
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed max-w-[240px] mb-3">
              Drag images or videos here from SnapSort, or click the <span className="text-[var(--accent)] font-semibold">+</span> button on any thumbnail.
            </p>
            <div className="px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-dim)] flex items-center gap-1.5">
              <ExternalLink size={11} className="text-[var(--accent)]" />
              <span>Ready for CapCut, Adobe Premiere & Folders</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {items.map((item) => {
              const isSelected = selectedIds.includes(item.id);

              return (
                <div
                  key={item.id}
                  draggable="true"
                  onDragStart={(e) => handleCardDragStart(e, item)}
                  className={`group relative flex flex-col rounded-xl bg-[var(--surface-1)] border transition-all cursor-grab active:cursor-grabbing overflow-hidden ${
                    isSelected
                      ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                      : 'border-[var(--border)] hover:border-[var(--border-focus)]'
                  }`}
                >
                  {/* Media Thumbnail Container (16:10) */}
                  <div className="relative aspect-[16/10] bg-[var(--surface-2)] overflow-hidden">
                    <img
                      src={item.thumbUrl}
                      alt={item.name}
                      onError={(e) => {
                        // Fallback placeholder
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                      className="w-full h-full object-cover"
                    />

                    {/* Checkbox (Select) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(item.id);
                      }}
                      className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition-colors cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare size={12} className="text-[var(--accent)]" />
                      ) : (
                        <Square size={12} className="text-white/70" />
                      )}
                    </button>

                    {/* Remove Item Button (×) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(item.id);
                      }}
                      title="Remove from Shelf"
                      className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 hover:bg-red-500/80 text-white opacity-0 group-hover:opacity-100 backdrop-blur-xs transition-all cursor-pointer"
                    >
                      <X size={11} />
                    </button>

                    {/* Video Duration Badge */}
                    {item.kind === 'video' && item.durationS && (
                      <div className="absolute bottom-1.5 right-1.5">
                        <Badge variant="duration">{formatDuration(item.durationS)}</Badge>
                      </div>
                    )}
                  </div>

                  {/* Caption & Metadata */}
                  <div className="p-2 flex items-center justify-between gap-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-[var(--text)] truncate leading-tight">
                        {item.name}
                      </p>
                      <span className="text-[9px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        {item.kind === 'video' ? (
                          <>
                            <Film size={9} className="text-[var(--accent)]" />
                            <span>Video</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon size={9} className="text-sky-400" />
                            <span>Photo</span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Drag Grip Indicator */}
                    <div className="shrink-0 text-[var(--text-dim)] group-hover:text-[var(--text-muted)]">
                      <GripVertical size={13} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 5. Footer Summary & Tip */}
      <footer className="shrink-0 px-3 py-2 bg-[var(--surface-1)] border-t border-[var(--border)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="tabular-nums">
          {videoCount} {videoCount === 1 ? 'clip' : 'clips'} · {imageCount} {imageCount === 1 ? 'photo' : 'photos'}
        </span>
        <span className="text-[9px] text-[var(--text-dim)]">
          Drag to CapCut / Adobe / Folders
        </span>
      </footer>
    </div>
  );
};
