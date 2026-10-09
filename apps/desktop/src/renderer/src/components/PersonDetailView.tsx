import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit2, Check, User, Filter, Sparkles, Film, Image } from 'lucide-react';
import { Button } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';
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
          view: 'highlight',
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
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#888888] hover:text-[#F5F5F5] transition-colors py-1 px-2.5 rounded-lg hover:bg-[#1C1C1C]"
        >
          <ArrowLeft size={14} />
          <span>All People</span>
        </button>
      </div>

      {/* Person Header Card */}
      <div className="p-6 rounded-2xl bg-[#141414] border border-[#222222] mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {/* Circular Face Avatar */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-600/30 to-yellow-500/20 border-2 border-[#FFC400] flex items-center justify-center text-[#FFC400] shadow-lg shrink-0 overflow-hidden">
            <span className="text-2xl font-bold tracking-tight">
              {displayName !== 'Unnamed Face' ? (
                displayName.slice(0, 2).toUpperCase()
              ) : (
                <User size={32} />
              )}
            </span>
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
                  className="bg-[#202020] border border-[#FFC400] rounded-lg px-3 py-1 text-lg font-bold text-[#F5F5F5] focus:outline-none w-64"
                />
                <button
                  type="button"
                  onClick={saveRename}
                  className="p-1.5 bg-[#FFC400] text-[#111111] rounded-lg hover:bg-[#E5B000]"
                >
                  <Check size={16} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-[#F5F5F5]">{displayName}</h1>
                <button
                  type="button"
                  onClick={startRename}
                  title="Rename person"
                  className="p-1 rounded text-[#888888] hover:text-[#FFC400] hover:bg-[#202020] transition-colors"
                >
                  <Edit2 size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 text-xs text-[#888888]">
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
        <div className="text-xs font-bold uppercase tracking-wider text-[#888888] mb-4">
          All Media with {displayName}
        </div>

        {isLoadingMedia ? (
          <div className="h-64 flex items-center justify-center text-xs text-[#666666]">
            Loading media...
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-xs text-[#666666] bg-[#141414] rounded-2xl border border-[#222222]">
            No photos or videos matched for this person yet.
          </div>
        ) : (
          <MediaGrid items={items} viewMode="highlight" />
        )}
      </div>
    </div>
  );
};
