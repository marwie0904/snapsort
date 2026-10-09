import React from 'react';
import {
  Film,
  Image,
  Folder,
  Layers,
  PanelLeftClose,
  Users,
  Clapperboard,
  Box,
  MapPin,
  HelpCircle,
} from 'lucide-react';
import { Wordmark, ThemeSegmentedControl } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';
import { useOnboardingStore } from '../stores/useOnboardingStore';
import { LibraryFolders } from './LibraryFolders';

const EjectIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="12 3 4 15 20 15 12 3" />
    <rect x="4" y="19" width="16" height="2" rx="1" />
  </svg>
);

interface SidebarNavItemProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  count: number;
  active: boolean;
  activeFilterCount?: number;
  onClick: () => void;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  icon: Icon,
  label,
  count,
  active,
  activeFilterCount = 0,
  onClick,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
        active
          ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
          : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
      }`}
    >
      <div className="flex items-center gap-2 truncate">
        <Icon
          size={14}
          className={active ? 'text-[var(--accent)] shrink-0' : 'text-[var(--text-muted)] shrink-0'}
        />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {activeFilterCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" />
            <span className="tabular-nums">{activeFilterCount}</span>
          </span>
        )}
        <span className="tabular-nums text-[var(--text-muted)] font-normal">{count}</span>
      </div>
    </button>
  );
};

interface SidebarProps {
  counts?: {
    all: number;
    images: number;
    videos: number;
    people: number;
    places: number;
    objects: number;
    scenes?: number;
  };
  onAddFolder?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  counts = { all: 0, images: 0, videos: 0, people: 0, places: 0, objects: 0, scenes: 0 },
  onAddFolder,
}) => {
  const {
    sidebarOpen,
    toggleSidebar,
    activeTab,
    setActiveTab,
    scope,
    setScope,
    selectedFolderId,
    selectFolder,
    clearSelectedFolder,
    currentView,
    navigateToPeople,
    navigateToScenes,
    navigateToTags,
    navigateToPlaces,
    navigateToLibrary,
    themePreference,
    effectiveTheme,
    setThemePreference,
    getFacetSelection,
  } = useUiStore();

  const { openTutorialDrawer } = useOnboardingStore();

  return (
    <aside
      data-tour="sidebar"
      className={`h-full bg-[var(--surface-1)] border-r border-[var(--border)] flex flex-col justify-between select-none text-sm transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
        sidebarOpen
          ? 'w-64 min-w-64 px-5 pb-5 opacity-100'
          : 'w-0 min-w-0 p-0 border-r-0 opacity-0 pointer-events-none'
      }`}
    >
      {/* Top Section */}
      <div className="space-y-5 overflow-y-auto pr-1">
        {/* Wordmark logo & Collapse button (traffic-light safe & draggable) */}
        <div
          className="flex items-center justify-between pt-14"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <Wordmark size="md" theme={effectiveTheme} />
          <button
            type="button"
            onClick={toggleSidebar}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Tab Switcher: Library | Folders */}
        <div className="flex p-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('library');
              clearSelectedFolder();
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'library'
                ? 'bg-[var(--surface-1)] text-[var(--text)] shadow-xs font-semibold border border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Layers size={13} />
            <span>Library</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('folders')}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'folders'
                ? 'bg-[var(--surface-1)] text-[var(--text)] shadow-xs font-semibold border border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            <Folder size={13} />
            <span>Folders</span>
          </button>
        </div>

        {/* TAB 1: LIBRARY VIEW */}
        {activeTab === 'library' && (
          <nav className="space-y-5 pt-1">
            {/* Section A: LIBRARY */}
            <div>
              <div className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
                Library
              </div>
              <div className="space-y-0.5">
                <SidebarNavItem
                  icon={Film}
                  label="All footage"
                  count={counts.all}
                  active={currentView === 'library' && scope === 'all' && !selectedFolderId}
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('all');
                  }}
                />
                <SidebarNavItem
                  icon={Image}
                  label="Photos"
                  count={counts.images}
                  active={currentView === 'library' && scope === 'images' && !selectedFolderId}
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('images');
                  }}
                />
                <SidebarNavItem
                  icon={Film}
                  label="Videos"
                  count={counts.videos}
                  active={currentView === 'library' && scope === 'videos' && !selectedFolderId}
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('videos');
                  }}
                />
              </div>
            </div>

            {/* Section B: EXPLORE */}
            <div>
              <div className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
                Explore
              </div>
              <div className="space-y-0.5">
                <SidebarNavItem
                  icon={Users}
                  label="People"
                  count={counts.people}
                  active={(currentView === 'people' || currentView === 'person-detail') && !selectedFolderId}
                  activeFilterCount={getFacetSelection('person').ids.length}
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToPeople();
                  }}
                />
                <SidebarNavItem
                  icon={Clapperboard}
                  label="Scenes"
                  count={counts.scenes ?? 0}
                  active={currentView === 'scenes' && !selectedFolderId}
                  activeFilterCount={getFacetSelection('scene').ids.length}
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToScenes();
                  }}
                />
                <SidebarNavItem
                  icon={Box}
                  label="Objects"
                  count={counts.objects}
                  active={currentView === 'tags' && !selectedFolderId}
                  activeFilterCount={getFacetSelection('label').ids.length}
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToTags();
                  }}
                />
                <SidebarNavItem
                  icon={MapPin}
                  label="Places"
                  count={counts.places}
                  active={currentView === 'places' && !selectedFolderId}
                  activeFilterCount={getFacetSelection('place').ids.length}
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToPlaces();
                  }}
                />
              </div>
            </div>
          </nav>
        )}

        {/* TAB 2: FOLDERS VIEW */}
        {activeTab === 'folders' && <LibraryFolders onAddFolder={onAddFolder} />}
      </div>

      {/* Footer Area: Appearance Switcher & Note */}
      <div className="pt-4 border-t border-[var(--border)] space-y-3">
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-bold tracking-wider text-[var(--text-muted)] uppercase">
            Appearance
          </div>
          <ThemeSegmentedControl
            value={themePreference}
            onChange={setThemePreference}
            className="w-full"
          />
        </div>
        <div className="text-[11px] text-[var(--text-muted)] leading-tight flex items-center justify-between pt-1">
          <span>Local library · runs on this device</span>
          <button
            type="button"
            onClick={() => openTutorialDrawer('interact')}
            className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="Help, Tutorial & Shortcuts"
          >
            <HelpCircle size={12} />
            <span>Help</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
