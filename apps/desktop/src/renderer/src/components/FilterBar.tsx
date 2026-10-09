import React, { useState } from 'react';
import { FilterPill } from '@snapsort/ui';
import { useUiStore, QuickAction } from '../stores/useUiStore';
import { Zap, X, Edit2, Check } from 'lucide-react';

export const FilterBar: React.FC = () => {
  const {
    filters,
    removeFilter,
    clearFilters,
    quickActions,
    activeQuickActionId,
    applyQuickAction,
    removeQuickAction,
    renameQuickAction,
  } = useUiStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

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
      <FilterPill label="People" />
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
          if (f.ids.length === 2 && f.ids.includes(1) && f.ids.includes(2)) {
            label = 'Groom + Bride';
          } else if (f.ids.length === 1 && f.ids.includes(2)) {
            label = 'Person: Bride';
          } else if (f.ids.length === 1 && f.ids.includes(1)) {
            label = 'Person: Groom';
          } else {
            label = `Person (${f.ids.join(',')})`;
          }
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
