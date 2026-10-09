import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilterPill } from '@snapsort/ui';
import { useUiStore, QuickAction } from '../stores/useUiStore';
import { MockSnapsortApi } from '@snapsort/mock';
import { Zap, X, Edit2, Check, Users, Box, MapPin } from 'lucide-react';
import { getLabelFilterIds } from '@snapsort/contract';
import { FacetPopoverPill } from './FacetPopoverPill';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

export const FilterBar: React.FC = () => {
  const api = useMemo(() => getApi(), []);
  const {
    filters,
    removeFilter,
    clearFilters,
    quickActions,
    activeQuickActionId,
    applyQuickAction,
    removeQuickAction,
    renameQuickAction,
    navigateToPeople,
    customPeopleNames,
    getFacetSelection,
    toggleFacetItem,
    setFacetMatch,
  } = useUiStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // 1. Fetch people list
  const { data: rawPeople = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.listPeople(),
  });

  const people = useMemo(() => {
    return rawPeople.map((p) => {
      const custom = customPeopleNames[p.id];
      return {
        id: p.id,
        name: custom !== undefined ? custom || 'Unnamed Face' : p.name || 'Unnamed Face',
        count: p.count,
      };
    });
  }, [rawPeople, customPeopleNames]);

  // 2. Fetch label manifest (Objects)
  const { data: rawManifest } = useQuery({
    queryKey: ['labelManifest'],
    queryFn: () => api.getLabelManifest(),
  });

  const objectItems = useMemo(() => {
    const allLabels = rawManifest?.modules?.flatMap((m) => m.labels) ?? [];
    return allLabels.map((l) => ({
      id: l.id,
      name: l.name,
      count: l.count ?? 0,
    }));
  }, [rawManifest]);

  // 3. Fetch places list
  const { data: rawPlaces = [] } = useQuery({
    queryKey: ['places'],
    queryFn: () => api.listPlaces(),
  });

  const placeItems = useMemo(() => {
    return rawPlaces.map((p) => ({
      id: p.name,
      name: p.name,
      count: p.count,
    }));
  }, [rawPlaces]);

  // 4. Fetch scenes list
  const { data: rawScenes = [] } = useQuery({
    queryKey: ['scenes'],
    queryFn: () => api.listScenes(),
  });

  const sceneItems = useMemo(() => {
    return rawScenes.map((s) => ({
      id: s.id,
      name: s.name,
      count: s.count,
    }));
  }, [rawScenes]);

  const peopleSelection = getFacetSelection('person');
  const objectSelection = getFacetSelection('label');
  const placeSelection = getFacetSelection('place');

  const startRename = (qa: QuickAction, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(qa.id);
    setEditingName(qa.name);
  };

  const saveRename = (id: string) => {
    if (editingName.trim()) {
      renameQuickAction(id, editingName.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (id: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div
      data-tour="filter-bar"
      className="flex flex-wrap items-center gap-2 py-3 select-none text-xs"
    >
      {/* 1. Standard Facet Pickers: People, Objects, Places */}
      <FacetPopoverPill
        kind="person"
        label="People"
        icon={Users}
        items={people}
        selectedIds={peopleSelection.ids}
        match={peopleSelection.match}
        onToggle={(id) => toggleFacetItem('person', id)}
        onSetMatch={(match) => setFacetMatch('person', match)}
        onBrowseAll={navigateToPeople}
        browseLabel="Manage all faces"
      />

      <FacetPopoverPill
        kind="label"
        label="Objects"
        icon={Box}
        items={objectItems}
        selectedIds={objectSelection.ids}
        match={objectSelection.match}
        onToggle={(id) => toggleFacetItem('label', id)}
        onSetMatch={(match) => setFacetMatch('label', match)}
      />

      <FacetPopoverPill
        kind="place"
        label="Places"
        icon={MapPin}
        items={placeItems}
        selectedIds={placeSelection.ids}
        showMatchToggle={false}
        onToggle={(id) => toggleFacetItem('place', id)}
      />

      {/* Subtle Divider */}
      <div className="h-4 w-px bg-[var(--border)] mx-1 shrink-0" />

      {/* 2. Saved Quick Actions Segment */}
      <div className="flex items-center gap-1.5 shrink-0">
        {quickActions.map((qa) => {
          const isActive = activeQuickActionId === qa.id;
          const isEditing = editingId === qa.id;

          if (isEditing) {
            return (
              <div
                key={qa.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--surface-2)] border border-[var(--accent)] rounded-full text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <Zap size={11} className="text-[var(--accent)]" fill="currentColor" />
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(qa.id, e)}
                  onBlur={() => saveRename(qa.id)}
                  autoFocus
                  className="bg-transparent border-none outline-none text-xs text-[var(--text)] w-28 font-medium"
                />
                <button
                  type="button"
                  onClick={() => saveRename(qa.id)}
                  className="p-0.5 text-[var(--accent)] hover:text-[var(--text)]"
                  title="Confirm rename"
                >
                  <Check size={12} strokeWidth={2.5} />
                </button>
              </div>
            );
          }

          return (
            <div
              key={qa.id}
              onClick={() => applyQuickAction(qa)}
              title={`Apply ${qa.name} filter`}
              className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
                isActive
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)] shadow-xs ring-1 ring-[var(--accent)]'
                  : 'bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-focus)]'
              }`}
            >
              <Zap
                size={12}
                className={isActive ? 'text-[var(--accent-ink)]' : 'text-[var(--accent)]'}
                fill="currentColor"
              />
              <span>{qa.name}</span>

              {/* Hover Actions: Rename & Remove */}
              <div className="hidden group-hover:flex items-center gap-1 ml-0.5">
                <button
                  type="button"
                  onClick={(e) => startRename(qa, e)}
                  title="Rename Quick Action"
                  className={`p-0.5 rounded hover:bg-black/20 ${
                    isActive
                      ? 'text-[var(--accent-ink)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <Edit2 size={10} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeQuickAction(qa.id);
                  }}
                  title="Delete Quick Action"
                  className={`p-0.5 rounded hover:bg-black/20 ${
                    isActive
                      ? 'text-[var(--accent-ink)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtle Divider if active individual filters exist */}
      {filters.length > 0 && <div className="h-4 w-px bg-[var(--border)] mx-1 shrink-0" />}

      {/* 3. Component Active Filter Chips */}
      {filters.map((f, i) => {
        let label = 'Filter';
        let tooltip = '';
        if (f.kind === 'person') {
          const names = f.ids.map((id) => {
            const p = people.find((person) => person.id === id);
            return p?.name || `Person #${id}`;
          });
          const matchJoiner = f.match === 'any' ? ' or ' : ' + ';
          tooltip = `People (${f.match}): ${names.join(matchJoiner)}`;
          if (names.length === 1) {
            label = `Person: ${names[0]}`;
          } else if (names.length > 1) {
            label = `People: ${names[0]} +${names.length - 1}`;
          } else {
            label = 'People';
          }
        } else if (f.kind === 'scene') {
          const names = f.ids.map((id) => {
            const sc = sceneItems.find((s) => s.id === id);
            return sc?.name || id;
          });
          const matchJoiner = f.match === 'all' ? ' + ' : ' or ';
          tooltip = `Scenes (${f.match}): ${names.join(matchJoiner)}`;
          if (names.length === 1) {
            label = `Scene: ${names[0]}`;
          } else if (names.length > 1) {
            label = `Scenes: ${names[0]} +${names.length - 1}`;
          } else {
            label = 'Scene';
          }
        } else if (f.kind === 'label') {
          const ids = getLabelFilterIds(f);
          const names = ids.map((id) => {
            const t = objectItems.find((item) => item.id === id);
            return t?.name || id;
          });
          const match = f.match ?? 'all';
          const matchJoiner = match === 'any' ? ' or ' : ' + ';
          tooltip = `Objects (${match}): ${names.join(matchJoiner)}`;
          if (names.length === 1) {
            label = `Object: ${names[0]}`;
          } else if (names.length > 1) {
            label = `Objects: ${names[0]} +${names.length - 1}`;
          } else {
            label = 'Objects';
          }
        } else if (f.kind === 'place') {
          label = `Place: ${f.name}`;
          tooltip = label;
        } else if (f.kind === 'mediaKind') {
          label = f.value === 'image' ? 'Photos only' : 'Videos only';
          tooltip = label;
        }

        return (
          <FilterPill
            key={`${f.kind}-${i}`}
            label={label}
            title={tooltip}
            active={true}
            onRemove={() => removeFilter(i)}
          />
        );
      })}

      {/* Clear All action when filters are active */}
      {filters.length > 0 && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] px-1 py-1 rounded transition-colors shrink-0"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};
