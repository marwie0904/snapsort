import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag } from 'lucide-react';
import { MockSnapsortApi } from '@snapsort/mock';
import { FacetCardGrid } from './FacetCardGrid';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

export const TagsView: React.FC = () => {
  const api = useMemo(() => getApi(), []);

  const { data: manifest, isLoading } = useQuery({
    queryKey: ['labelManifest'],
    queryFn: () => api.getLabelManifest(),
  });

  const tags = useMemo(() => {
    const allLabels = manifest?.modules?.flatMap((m) => m.labels) ?? [];
    return allLabels.map((l) => ({
      id: l.id,
      name: l.name,
      count: l.count ?? 0,
    }));
  }, [manifest]);

  return (
    <FacetCardGrid
      kind="label"
      title="Tags & Objects"
      subtitle="Detected visual elements, outfits, and wedding accessories. Click any tag to isolate it in the library."
      icon={Tag}
      items={tags}
      isLoading={isLoading}
      emptyMessage="No tags detected yet. Run ingest to analyze footage."
      defaultMatch="all"
    />
  );
};
