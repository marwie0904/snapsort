import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IngestJob, SnapsortApi } from '@snapsort/contract';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ScopeHeader } from './components/ScopeHeader';
import { FilterBar } from './components/FilterBar';
import { MediaGrid } from './components/MediaGrid';
import { AskAiPanel } from './components/AskAiPanel';
import { PeopleView } from './components/PeopleView';
import { ScenesView } from './components/ScenesView';
import { TagsView } from './components/TagsView';
import { PlacesView } from './components/PlacesView';
import { PersonDetailView } from './components/PersonDetailView';
import { MediaDetailView } from './components/MediaDetailView';
import { WelcomeModal } from './components/WelcomeModal';
import { SpotlightTourOverlay } from './components/SpotlightTourOverlay';
import { TutorialDrawer } from './components/TutorialDrawer';
import { useUiStore } from './stores/useUiStore';
import { useOnboardingStore } from './stores/useOnboardingStore';
import { MockSnapsortApi } from '@snapsort/mock';

// Fallback in-memory mock if not inside Electron contextBridge
const mockApiFallback = new MockSnapsortApi();

function getApi(): SnapsortApi {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

const PAGE = 120;

export const App: React.FC = () => {
  const api = useMemo(() => getApi(), []);
  const queryClient = useQueryClient();
  const {
    getSearchQuery,
    view,
    aiPanelOpen,
    sidebarOpen,
    currentView,
    selectedPersonId,
    selectedMediaId,
    openMediaDetail,
    initThemeListener,
    clearSelectedFolder,
    closeMediaDetail,
  } = useUiStore();
  // Typing runs a text search: wait for a 250 ms pause instead of searching on every key
  const liveQuery = getSearchQuery();
  const [searchQuery, setSearchQuery] = useState(liveQuery);
  const liveKey = JSON.stringify(liveQuery);
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(JSON.parse(liveKey)), 250);
    return () => clearTimeout(t);
  }, [liveKey]);

  // Initialize OS theme change listener
  useEffect(() => {
    const cleanup = initThemeListener();
    return cleanup;
  }, [initThemeListener]);

  // Global hotkey for Help & Tutorial (? or F1)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;
      if (!isInput && (e.key === '?' || e.key === 'F1')) {
        e.preventDefault();
        const store = useOnboardingStore.getState();
        if (store.tutorialDrawerOpen) {
          store.closeTutorialDrawer();
        } else {
          store.openTutorialDrawer('interact');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Backend events: ingest progress goes to the jobs list, and new data or a drive change refreshes everything.
  // While a folder is processing, its files show up every few seconds.
  useEffect(() => {
    let last = 0;
    return api.onBackendEvent?.((e) => {
      if (e.type === 'libraries') {
        queryClient.invalidateQueries();
        return;
      }
      queryClient.setQueryData<IngestJob[]>(['jobs'], (old = []) =>
        old.some((j) => j.id === e.job.id) ? old.map((j) => (j.id === e.job.id ? e.job : j)) : [...old, e.job]
      );
      const finished = e.job.state !== 'running' && e.job.state !== 'queued';
      if (finished || Date.now() - last > 5000) {
        last = Date.now();
        queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'jobs' });
      }
    });
  }, [api, queryClient]);

  // Fetch Sidebar Counts
  const { data: counts } = useQuery({
    queryKey: ['counts'],
    queryFn: () => api.getCounts(),
  });

  // Fetch Media Items based on search & filters, a page at a time
  const {
    data: pages,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['query', searchQuery],
    queryFn: ({ pageParam }) => api.query({ search: searchQuery, cursor: pageParam, limit: PAGE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: (prev) => prev,
  });
  const queryResult = pages?.pages[0];
  const items = useMemo(() => pages?.pages.flatMap((p) => p.items) ?? [], [pages]);
  const total = queryResult?.total ?? 0;
  const clipsCount = queryResult?.facets?.videos ?? 0;
  const photosCount = queryResult?.facets?.images ?? 0;
  const errorCode = (error as { code?: string } | null)?.code;

  // A drive that went away takes its folder selection and open file with it
  useEffect(() => {
    if (errorCode === 'LIBRARY_GONE') {
      clearSelectedFolder();
      closeMediaDetail();
    }
  }, [errorCode, clearSelectedFolder, closeMediaDetail]);

  // Load the next page when the end of the grid scrolls into view
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length]);

  const [notice, setNotice] = useState<string | null>(null);
  const handleAddFolder = async () => {
    try {
      await api.pickAndAddFolder();
    } catch (err) {
      setNotice((err as Error).message);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[var(--surface-0)] text-[var(--text)] overflow-hidden">
      {/* 1. Left Sidebar */}
      <Sidebar counts={counts} onAddFolder={handleAddFolder} />

      {/* 2. Center Content Area */}
      <main className={`flex-1 h-full flex flex-col min-w-0 overflow-hidden px-8 transition-all duration-300 ${sidebarOpen ? '' : 'pl-20'}`}>
        {/* Top Search & Filter Bar, doubles as the window drag area */}
        <div className={`app-drag shrink-0 pb-2 ${sidebarOpen ? 'pt-6' : 'pt-7'}`}>
          <TopBar />
        </div>

        {notice && (
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 mb-2 text-left bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs px-3 py-2 rounded-lg font-medium"
          >
            {notice}
          </button>
        )}

        {/* View Switcher: People View vs Scenes View vs Tags View vs Person Detail vs Media Detail vs Media Library */}
        {currentView === 'people' ? (
          <div className="flex-1 overflow-hidden flex flex-col pt-2">
            <PeopleView />
          </div>
        ) : currentView === 'scenes' ? (
          <div className="flex-1 overflow-hidden flex flex-col pt-2">
            <ScenesView />
          </div>
        ) : currentView === 'tags' ? (
          <div className="flex-1 overflow-hidden flex flex-col pt-2">
            <TagsView />
          </div>
        ) : currentView === 'places' ? (
          <div className="flex-1 overflow-hidden flex flex-col pt-2">
            <PlacesView />
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
              ) : error && items.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3 text-xs text-[var(--text-muted)] text-center">
                  <span className="max-w-md">
                    {errorCode === 'SIDECAR_DOWN' || errorCode === 'SIDECAR_TIMEOUT'
                      ? `Backend unavailable: ${(error as Error).message}`
                      : (error as Error).message}
                  </span>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text)] hover:bg-[var(--surface-2)]"
                  >
                    Try again
                  </button>
                </div>
              ) : items.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
                  {(counts?.all ?? 0) === 0 ? (
                    <>
                      <span>No footage yet. Add a folder from this Mac or an external drive.</span>
                      <button
                        type="button"
                        onClick={handleAddFolder}
                        className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] font-semibold"
                      >
                        + Add folder
                      </button>
                    </>
                  ) : (
                    <span>Nothing matches these filters.</span>
                  )}
                </div>
              ) : (
                <>
                  <MediaGrid
                    items={items}
                    viewMode={view}
                    onItemClick={(id) => {
                      const item = items.find((i) => i.id === id);
                      openMediaDetail(id, item?.matches?.length ? item.bestFrameTs : undefined);
                    }}
                  />
                  <div ref={sentinel} className="h-8" />
                </>
              )}
            </div>
          </>
        )}
      </main>

      {/* 3. Right Ask AI Panel */}
      {aiPanelOpen && (
        <AskAiPanel
          currentMatchedCount={queryResult?.matched ?? queryResult?.total ?? 0}
        />
      )}

      {/* 4. Onboarding & Tutorial Overlays */}
      <WelcomeModal />
      <SpotlightTourOverlay />
      <TutorialDrawer />
    </div>
  );
};
