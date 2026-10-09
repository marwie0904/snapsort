import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clapperboard } from 'lucide-react';
import { MockSnapsortApi } from '@snapsort/mock';
import { FacetCardGrid } from './FacetCardGrid';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

export const ScenesView: React.FC = () => {
  const api = useMemo(() => getApi(), []);

  const { data: scenes = [], isLoading } = useQuery({
    queryKey: ['scenes'],
    queryFn: () => api.listScenes(),
  });

  return (
    <FacetCardGrid
      kind="scene"
      title="Scenes & Moments"
      subtitle="Detected wedding events and memorable chapters across your footage. Click any scene to isolate it in the library."
      icon={Clapperboard}
      items={scenes}
      isLoading={isLoading}
      emptyMessage="No scenes detected yet. Run ingest to analyze footage."
      defaultMatch="any"
    />
  );
};
