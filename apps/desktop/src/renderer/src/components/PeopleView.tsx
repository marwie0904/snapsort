import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, User, Edit2, Check, X, Sparkles, Filter } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';
import { MockSnapsortApi } from '@snapsort/mock';
import type { Person } from '@snapsort/contract';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

// Obsidian-calibrated surface styles for face avatars
const avatarGradients = [
  'from-[var(--surface-3)] to-[var(--surface-2)] text-[var(--accent)]',
  'from-[var(--surface-3)] to-[var(--surface-2)] text-[var(--overlay-object,#5AC8FA)]',
  'from-[var(--surface-3)] to-[var(--surface-2)] text-[var(--text)]',
  'from-[var(--surface-3)] to-[var(--surface-2)] text-[var(--accent)]',
  'from-[var(--surface-3)] to-[var(--surface-2)] text-[var(--overlay-object,#5AC8FA)]',
];

export const PeopleView: React.FC = () => {
  const api = useMemo(() => getApi(), []);
  const queryClient = useQueryClient();
  const {
    navigateToPersonDetail,
    filterByPersonAndNavigate,
    customPeopleNames,
    setPersonName,
  } = useUiStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  // Fetch people from API
  const { data: rawPeople = [], isLoading } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.listPeople(),
  });

  // Apply custom local renames over API data for instant reactivity
  const people = useMemo(() => {
    return rawPeople.map((p) => {
      const custom = customPeopleNames[p.id];
      if (custom !== undefined) {
        return { ...p, name: custom || null };
      }
      return p;
    });
  }, [rawPeople, customPeopleNames]);

  // Filter by local search query
  const filteredPeople = useMemo(() => {
    if (!searchQuery.trim()) return people;
    const q = searchQuery.toLowerCase();
    return people.filter((p) => (p.name ? p.name.toLowerCase().includes(q) : 'unnamed'.includes(q)));
  }, [people, searchQuery]);

  // Separate into Named and Unnamed clusters
  const namedPeople = useMemo(
    () => filteredPeople.filter((p) => p.name && p.name.trim().length > 0),
    [filteredPeople]
  );
  const unnamedPeople = useMemo(
    () => filteredPeople.filter((p) => !p.name || p.name.trim().length === 0),
    [filteredPeople]
  );

  const startRename = (person: Person, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(person.id);
    setEditingName(person.name || '');
  };

  const saveRename = async (id: number) => {
    const trimmed = editingName.trim();
    setEditingId(null);
    setPersonName(id, trimmed);
    try {
      await api.renamePerson(id, trimmed);
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['counts'] });
    } catch (err) {
      console.error('Failed to rename person:', err);
    }
  };

  const handleKeyDown = (id: number, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-1 select-none">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] flex items-center gap-2">
            <span>People & Faces</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)] font-medium tabular-nums">
              {people.length} clusters
            </span>
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Local face clustering on Apple Silicon. Name faces to search by person or use with the AI assistant.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find by name..."
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-full pl-9 pr-4 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-dim)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-20 text-xs text-[var(--text-muted)]">
          Loading face clusters...
        </div>
      ) : (
        <div className="py-6 space-y-10">
          {/* SECTION 1: NAMED PEOPLE */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <span>Named People</span>
                <span className="text-[11px] text-[var(--text-dim)] font-normal tabular-nums">
                  ({namedPeople.length})
                </span>
              </h2>
            </div>

            {namedPeople.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
                {searchQuery
                  ? 'No named people matching your search.'
                  : 'No named people yet. Assign names to the unnamed faces below.'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {namedPeople.map((person, idx) => {
                  const gradient = avatarGradients[idx % avatarGradients.length];
                  const isEditing = editingId === person.id;

                  return (
                    <div
                      key={person.id}
                      onClick={() => !isEditing && navigateToPersonDetail(person.id)}
                      className="group relative flex flex-col items-center justify-center aspect-square p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--border-focus)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs"
                    >
                      {/* Top Corner Actions on Hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          filterByPersonAndNavigate(person.id);
                        }}
                        title={`Filter photos of ${person.name}`}
                        className="absolute top-3 left-3 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--surface-3)] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Filter size={12} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => startRename(person, e)}
                        title="Rename person"
                        className="absolute top-3 right-3 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Edit2 size={12} />
                      </button>

                      {/* Avatar */}
                      <div className="relative mb-2.5">
                        <div
                          className={`w-20 h-20 rounded-full bg-gradient-to-br ${gradient} border-2 border-[var(--border)] group-hover:border-[var(--accent)] flex items-center justify-center shadow-md transition-transform duration-200 group-hover:scale-105 overflow-hidden`}
                        >
                          <span className="text-xl font-bold tracking-tight">
                            {person.name?.slice(0, 2).toUpperCase() || <User size={24} />}
                          </span>
                        </div>
                      </div>

                      {/* Name & Count */}
                      {isEditing ? (
                        <div
                          className="w-full flex items-center justify-center gap-1 mt-1 px-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(person.id, e)}
                            onBlur={() => saveRename(person.id)}
                            autoFocus
                            className="w-full max-w-[120px] bg-[var(--surface-2)] border border-[var(--accent)] rounded px-2 py-1 text-xs text-center text-[var(--text)] font-semibold focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => saveRename(person.id)}
                            className="p-1 text-[var(--accent)] hover:text-[var(--text)]"
                          >
                            <Check size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="w-full text-center px-2">
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(person, e);
                            }}
                            title="Click to rename"
                            className="text-sm font-bold text-[var(--text)] truncate mx-auto max-w-[130px] group-hover:text-[var(--accent)] transition-colors cursor-text"
                          >
                            {person.name}
                          </div>
                          <div className="text-xs text-[var(--text-muted)] font-medium tabular-nums mt-0.5">
                            {person.count} items
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* SECTION 2: UNNAMED FACES */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <span className="text-[var(--accent)]">✦</span>
                <span>Unnamed Faces</span>
                <span className="text-[11px] text-[var(--text-dim)] font-normal tabular-nums">
                  ({unnamedPeople.length})
                </span>
              </h2>
            </div>

            {unnamedPeople.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] text-center text-xs text-[var(--text-muted)]">
                All detected faces have been named!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {unnamedPeople.map((person) => {
                  const isEditing = editingId === person.id;

                  return (
                    <div
                      key={person.id}
                      onClick={() => !isEditing && navigateToPersonDetail(person.id)}
                      className="group relative flex flex-col items-center justify-center aspect-square p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-all cursor-pointer shadow-xs"
                    >
                      {/* Avatar */}
                      <div className="w-20 h-20 rounded-full bg-[var(--surface-2)] border-2 border-dashed border-[var(--border)] group-hover:border-[var(--accent)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shadow-sm mb-2.5">
                        <User size={24} strokeWidth={1.5} />
                      </div>

                      {/* Add Name Action */}
                      {isEditing ? (
                        <div
                          className="w-full flex items-center justify-center gap-1 mt-1 px-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(person.id, e)}
                            onBlur={() => saveRename(person.id)}
                            placeholder="Enter name..."
                            autoFocus
                            className="w-full max-w-[120px] bg-[var(--surface-2)] border border-[var(--accent)] rounded px-2 py-1 text-xs text-center text-[var(--text)] font-semibold focus:outline-none placeholder-[var(--text-dim)]"
                          />
                          <button
                            type="button"
                            onClick={() => saveRename(person.id)}
                            className="p-1 text-[var(--accent)] hover:text-[var(--text)]"
                          >
                            <Check size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center w-full px-2">
                          <button
                            type="button"
                            onClick={(e) => startRename(person, e)}
                            className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-all shadow-xs"
                          >
                            <span>+ Add Name</span>
                          </button>
                          <span className="text-xs text-[var(--text-muted)] font-medium tabular-nums mt-1">
                            {person.count} items
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
