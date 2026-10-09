import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit2, Check, User, Filter, Sparkles, Film, Image } from 'lucide-react';
import { Button } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';
import { FaceImage } from './FaceImage';
import { MockSnapsortApi } from '@snapsort/mock';
import { MediaGrid } from './MediaGrid';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

interface PersonDetailViewProps {
  personId: number;
}

export const PersonDetailView: React.FC<PersonDetailViewProps> = ({ personId }) => {
  const api = useMemo(() => getApi(), []);
  const queryClient = useQueryClient();
  const {
    navigateToPeople,
    filterByPersonAndNavigate,
    customPeopleNames,
    setPersonName,
    setAiPanelOpen,
    openMediaDetail,
  } = useUiStore();

  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState('');

  // 1. Fetch people to find target person
  const { data: people = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.listPeople(),
  });

  const rawPerson = people.find((p) => p.id === personId);
  const displayName =
    customPeopleNames[personId] !== undefined
      ? customPeopleNames[personId] || 'Unnamed Face'
      : rawPerson?.name || 'Unnamed Face';

  // 2. Fetch scoped media for this person
  const { data: mediaResult, isLoading: isLoadingMedia } = useQuery({
    queryKey: ['personMedia', personId],
    queryFn: () =>
      api.query({
        search: {
          scope: 'all',
          sort: 'newest',
          view: 'filter',
          f: [{ kind: 'person', ids: [personId], match: 'all', source: 'user' }],
        },
        limit: 100,
      }),
  });

  const items = mediaResult?.items || [];
  const photosCount = mediaResult?.facets?.images ?? items.filter((m) => m.kind === 'image').length;
  const videosCount = mediaResult?.facets?.videos ?? items.filter((m) => m.kind === 'video').length;

  const startRename = () => {
    setEditingName(rawPerson?.name || '');
    setIsEditing(true);
  };

  const saveRename = async () => {
    const trimmed = editingName.trim();
    setIsEditing(false);
    setPersonName(personId, trimmed);
    try {
      await api.renamePerson(personId, trimmed);
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
    } catch (err) {
      console.error('Failed to rename person:', err);
      setPersonName(personId, rawPerson?.name ?? ''); // roll back the optimistic name
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveRename();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-1 select-none">
      {/* Back button */}
      <div className="pb-4">
        <button
          type="button"
          onClick={navigateToPeople}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors py-1 px-2.5 rounded-lg hover:bg-[var(--surface-2)]"
        >
          <ArrowLeft size={14} />
          <span>All People</span>
        </button>
      </div>

      {/* Person Header Card */}
      <div className="p-6 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-5">
          {/* Circular Face Avatar */}
          <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[var(--surface-3)] to-[var(--surface-2)] border-2 border-[var(--accent)] flex items-center justify-center text-[var(--accent)] shadow-md shrink-0 overflow-hidden">
            <span className="text-2xl font-bold tracking-tight">
              {displayName !== 'Unnamed Face' ? (
                displayName.slice(0, 2).toUpperCase()
              ) : (
                <User size={32} />
              )}
            </span>
            <FaceImage src={rawPerson?.faceRef} />
          </div>

          {/* Editable Name & Counts */}
          <div className="space-y-1.5">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={saveRename}
                  placeholder="Enter person name..."
                  autoFocus
                  className="bg-[var(--surface-2)] border border-[var(--accent)] rounded-lg px-3 py-1 text-lg font-bold text-[var(--text)] focus:outline-none w-64"
                />
                <button
                  type="button"
                  onClick={saveRename}
                  className="p-1.5 bg-[var(--accent)] text-[var(--accent-ink)] rounded-lg hover:brightness-105"
                >
                  <Check size={16} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">{displayName}</h1>
                <button
                  type="button"
                  onClick={startRename}
                  title="Rename person"
                  className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
                >
                  <Edit2 size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
              <span className="tabular-nums font-medium">
                {items.length || rawPerson?.count || 0} media items
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Image size={12} />
                <span className="tabular-nums">{photosCount} photos</span>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Film size={12} />
                <span className="tabular-nums">{videosCount} videos</span>
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="secondary"
            size="md"
            onClick={() => filterByPersonAndNavigate(personId)}
            className="text-xs gap-1.5"
          >
            <Filter size={13} />
            <span>Open in Library</span>
          </Button>

          <Button
            variant="accent"
            size="md"
            onClick={() => setAiPanelOpen(true)}
            className="text-xs gap-1.5 font-bold"
          >
            <Sparkles size={13} />
            <span>Ask AI</span>
          </Button>
        </div>
      </div>

      {/* Media Grid Section */}
      <div className="flex-1">
        <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4">
          All Media with {displayName}
        </div>

        {isLoadingMedia ? (
          <div className="h-64 flex items-center justify-center text-xs text-[var(--text-muted)]">
            Loading media...
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-xs text-[var(--text-muted)] bg-[var(--surface-1)] rounded-2xl border border-[var(--border)]">
            No photos or videos matched for this person yet.
          </div>
        ) : (
          <MediaGrid items={items} viewMode="highlight" onItemClick={openMediaDetail} />
        )}
      </div>
    </div>
  );
};
