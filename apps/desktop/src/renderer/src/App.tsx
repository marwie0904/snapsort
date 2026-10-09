import React, { useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ScopeHeader } from './components/ScopeHeader';
import { FilterBar } from './components/FilterBar';
import { MediaGrid } from './components/MediaGrid';
import { AskAiPanel } from './components/AskAiPanel';
import { PeopleView } from './components/PeopleView';
import { PersonDetailView } from './components/PersonDetailView';
import { MediaDetailView } from './components/MediaDetailView';
import { useUiStore } from './stores/useUiStore';
import { MockSnapsortApi } from '@snapsort/mock';

// Fallback in-memory mock if not inside Electron contextBridge
const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

export const App: React.FC = () => {
  const api = useMemo(() => getApi(), []);
  const {
    getSearchQuery,
    view,
    aiPanelOpen,
    currentView,
    selectedPersonId,
    selectedMediaId,
    openMediaDetail,
    initThemeListener,
  } = useUiStore();
  const searchQuery = getSearchQuery();

  // Initialize OS theme change listener
  useEffect(() => {
    const cleanup = initThemeListener();
    return cleanup;
  }, [initThemeListener]);

  // Fetch Sidebar Counts
  const { data: counts } = useQuery({
    queryKey: ['counts'],
    queryFn: () => api.getCounts(),
  });

  // Fetch Media Items based on search & filters
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ['query', searchQuery],
    queryFn: () => api.query({ search: searchQuery, limit: 60 }),
  });

  const items = queryResult?.items || [];
  const total = queryResult?.total ?? (counts?.all ?? 248);
  const clipsCount = queryResult?.facets?.videos ?? (counts?.videos ?? 66);
  const photosCount = queryResult?.facets?.images ?? (counts?.images ?? 182);

  const handleAddFolder = async () => {
    await api.pickAndAddFolder();
  };

  return (
    <div className="flex h-screen w-screen bg-[var(--surface-0)] text-[var(--text)] overflow-hidden">
      {/* 1. Left Sidebar */}
      <Sidebar counts={counts} onAddFolder={handleAddFolder} />

      {/* 2. Center Content Area */}
      <main className="flex-1 h-full flex flex-col min-w-0 overflow-hidden px-8 pt-6">
        {/* Top Search & Filter Bar */}
        <div className="shrink-0 mb-2">
          <TopBar />
        </div>

        {/* View Switcher: People View vs Person Detail vs Media Detail vs Media Library */}
        {currentView === 'people' ? (
          <div className="flex-1 overflow-hidden flex flex-col pt-2">
            <PeopleView />
          </div>
        ) : currentView === 'person-detail' && selectedPersonId !== null ? (
          <div className="flex-1 overflow-hidden flex flex-col pt-2">
            <PersonDetailView personId={selectedPersonId} />
          </div>
        ) : currentView === 'media-detail' && selectedMediaId !== null ? (
          <div className="flex-1 overflow-hidden flex flex-col pt-2">
            <MediaDetailView items={items} />
          </div>
        ) : (
          <>
            {/* Scope Header */}
            <div className="shrink-0">
              <ScopeHeader
                total={total}
                clipsCount={clipsCount}
                photosCount={photosCount}
              />
            </div>

            {/* Filter Pills Bar */}
            <div className="shrink-0">
              <FilterBar />
            </div>

            {/* Scrollable Media Grid Area */}
            <div className="flex-1 overflow-y-auto pt-2 px-2 -mx-2">
              {isLoading ? (
                <div className="h-64 flex items-center justify-center text-xs text-[var(--text-muted)]">
                  Loading footage...
                </div>
              ) : (
                <MediaGrid
                  items={items}
                  viewMode={view}
                  onItemClick={openMediaDetail}
                />
              )}
            </div>
          </>
        )}
      </main>

      {/* 3. Right Ask AI Panel */}
      {aiPanelOpen && (
        <AskAiPanel
          currentMatchedCount={queryResult?.matched ?? queryResult?.total ?? 36}
        />
      )}
    </div>
  );
};
