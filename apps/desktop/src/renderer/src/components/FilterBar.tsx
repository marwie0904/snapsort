import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilterPill } from '@snapsort/ui';
import { useUiStore, QuickAction } from '../stores/useUiStore';
import { MockSnapsortApi } from '@snapsort/mock';
import { Zap, X, Edit2, Check, Users, ChevronDown, CheckSquare, Square, ArrowUpRight } from 'lucide-react';
import type { Filter } from '@snapsort/contract';

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
    togglePersonFilter,
    navigateToPeople,
    customPeopleNames,
  } = useUiStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [peoplePopoverOpen, setPeoplePopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Fetch people list for picker
  const { data: rawPeople = [] } = useQuery({
    queryKey: ['people'],
    queryFn: () => api.listPeople(),
  });

  const people = useMemo(() => {
    return rawPeople.map((p) => {
      const custom = customPeopleNames[p.id];
      return {
        ...p,
        name: custom !== undefined ? custom || 'Unnamed Face' : p.name || 'Unnamed Face',
      };
    });
  }, [rawPeople, customPeopleNames]);

  // Click outside listener for people popover
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setPeoplePopoverOpen(false);
      }
    }
    if (peoplePopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [peoplePopoverOpen]);

  // Find currently active person IDs
  const activePersonIds = useMemo(() => {
    const personFilter = filters.find((f) => f.kind === 'person') as
      | Extract<Filter, { kind: 'person' }>
      | undefined;
    return personFilter?.ids || [];
  }, [filters]);

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
    <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar select-none text-xs">
      {/* 1. Standard Facet Pickers */}
      {/* Interactive People Popover */}
      <div className="relative shrink-0" ref={popoverRef}>
        <div
          onClick={() => setPeoplePopoverOpen(!peoplePopoverOpen)}
          role="button"
          tabIndex={0}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
            activePersonIds.length > 0 || peoplePopoverOpen
              ? 'bg-[#FFC400] text-[#111111] font-semibold shadow-sm'
              : 'bg-[#1C1C1C] text-[#F5F5F5] border border-[#2A2A2A] hover:border-[#8A8A8A]'
          }`}
        >
          <Users size={12} className={activePersonIds.length > 0 ? 'text-[#111111]' : 'text-[#888888]'} />
          <span>People</span>
          {activePersonIds.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 text-black tabular-nums">
              {activePersonIds.length}
            </span>
          )}
          <ChevronDown size={11} className={`transition-transform duration-150 ${peoplePopoverOpen ? 'rotate-180' : ''}`} />
        </div>

        {/* Dropdown Popover */}
        {peoplePopoverOpen && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-[#181818] border border-[#2E2E2E] rounded-2xl shadow-2xl p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#242424] text-[11px] font-bold text-[#888888] uppercase tracking-wider">
              <span>Select People</span>
              <span className="text-[#666666] font-normal tabular-nums">{people.length} total</span>
            </div>

            <div className="max-h-56 overflow-y-auto py-1 space-y-0.5">
              {people.map((p) => {
                const isSelected = activePersonIds.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => togglePersonFilter(p.id)}
                    className="flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-[#222222] cursor-pointer text-[#D5D5D5] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isSelected ? (
                        <CheckSquare size={13} className="text-[#FFC400] shrink-0" />
                      ) : (
                        <Square size={13} className="text-[#666666] shrink-0" />
                      )}
                      <span className={`truncate text-xs ${isSelected ? 'text-[#F5F5F5] font-semibold' : ''}`}>
                        {p.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#777777] font-medium tabular-nums shrink-0 ml-2">
                      {p.count}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Link to full People & Faces view */}
            <div className="pt-1.5 mt-1 border-t border-[#242424]">
              <button
                type="button"
                onClick={() => {
                  setPeoplePopoverOpen(false);
                  navigateToPeople();
                }}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-semibold text-[#FFC400] hover:bg-[#222222] transition-colors"
              >
                <span>Manage all faces</span>
                <ArrowUpRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>

      <FilterPill label="Scene" />
      <FilterPill label="Tags" />

      {/* Subtle Divider */}
      <div className="h-4 w-px bg-[#282828] mx-1 shrink-0" />

      {/* 2. Saved Quick Actions Segment */}
      <div className="flex items-center gap-1.5 shrink-0">
        {quickActions.map((qa) => {
          const isActive = activeQuickActionId === qa.id;
          const isEditing = editingId === qa.id;

          if (isEditing) {
            return (
              <div
                key={qa.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#1E1E1E] border border-[#FFC400] rounded-full text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <Zap size={11} className="text-[#FFC400]" fill="currentColor" />
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(qa.id, e)}
                  onBlur={() => saveRename(qa.id)}
                  autoFocus
                  className="bg-transparent border-none outline-none text-xs text-[#F5F5F5] w-28 font-medium"
                />
                <button
                  type="button"
                  onClick={() => saveRename(qa.id)}
                  className="p-0.5 text-[#FFC400] hover:text-[#FFFFFF]"
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
                  ? 'bg-[#FFC400] text-[#111111] shadow-sm ring-1 ring-[#FFC400]'
                  : 'bg-[#181818] text-[#E0E0E0] border border-[#2B2B2B] hover:border-[#4B4B4B] hover:text-[#FFFFFF]'
              }`}
            >
              <Zap
                size={12}
                className={isActive ? 'text-[#111111]' : 'text-[#FFC400]'}
                fill="currentColor"
              />
              <span>{qa.name}</span>

              {/* Hover Actions: Rename & Remove */}
              <div className="hidden group-hover:flex items-center gap-1 ml-0.5">
                <button
                  type="button"
                  onClick={(e) => startRename(qa, e)}
                  title="Rename Quick Action"
                  className={`p-0.5 rounded hover:bg-black/20 ${isActive ? 'text-[#111111]' : 'text-[#888888] hover:text-[#FFFFFF]'}`}
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
                  className={`p-0.5 rounded hover:bg-black/20 ${isActive ? 'text-[#111111]' : 'text-[#888888] hover:text-[#FFFFFF]'}`}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtle Divider if active individual filters exist */}
      {filters.length > 0 && <div className="h-4 w-px bg-[#282828] mx-1 shrink-0" />}

      {/* 3. Component Active Filter Chips */}
      {filters.map((f, i) => {
        let label = 'Filter';
        if (f.kind === 'person') {
          const names = f.ids.map((id) => {
            const p = people.find((person) => person.id === id);
            return p?.name || `Person #${id}`;
          });
          label = names.length > 0 ? names.join(' + ') : 'Person';
        } else if (f.kind === 'label') {
          if (f.labelId === 'flowers') label = 'Object: Flowers';
          else if (f.labelId === 'cake') label = 'Object: Cake';
          else if (f.labelId === 'dress') label = 'Object: Dress';
          else if (f.labelId === 'rings') label = 'Object: Rings';
          else label = `Object: ${f.labelId}`;
        } else if (f.kind === 'place') {
          label = `Place: ${f.name}`;
        } else if (f.kind === 'mediaKind') {
          label = f.value === 'image' ? 'Photos only' : 'Videos only';
        }

        return (
          <FilterPill
            key={`${f.kind}-${i}`}
            label={label}
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
          className="text-[11px] text-[#777777] hover:text-[#E0E0E0] px-1 py-1 rounded transition-colors shrink-0"
        >
          Clear filters
        </button>
      )}
    </div>
  );
};
