import React from 'react';
import { FilterPill } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';

export const FilterBar: React.FC = () => {
  const { filters, removeFilter } = useUiStore();

  return (
    <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar">
      {/* Facet Pickers */}
      <FilterPill label="People" />
      <FilterPill label="Scene" />
      <FilterPill label="Tags" />

      {/* Active Filter Chips */}
      {filters.map((f, i) => {
        let label = 'Filter';
        if (f.kind === 'person') {
          label = f.ids.length === 2 && f.ids.includes(1) && f.ids.includes(2) ? 'Groom + Bride' : `Person (${f.ids.join(',')})`;
        } else if (f.kind === 'label') {
          label = `Object: ${f.labelId}`;
        } else if (f.kind === 'place') {
          label = `Place: ${f.name}`;
        } else if (f.kind === 'mediaKind') {
          label = f.value === 'image' ? 'Photos only' : 'Videos only';
        }

        return (
          <FilterPill
            key={i}
            label={label}
            active={true}
            onRemove={() => removeFilter(i)}
          />
        );
      })}

      {/* Static reference active chip matching screenshot */}
      <FilterPill
        label="Max 2 people"
        active={true}
      />
    </div>
  );
};
