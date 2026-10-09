import React, { useState } from 'react';
import {
  Film,
  Image,
  Folder,
  FolderOpen,
  HardDrive,
  Usb,
  ChevronRight,
  ChevronDown,
  Layers,
  Laptop,
  PanelLeftClose,
  Users,
} from 'lucide-react';
import { Button, Wordmark, ThemeSegmentedControl } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';
import { mockLocalFolders, mockExternalDrive } from '@snapsort/mock';

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

interface SidebarProps {
  counts?: {
    all: number;
    images: number;
    videos: number;
    people: number;
    places: number;
    objects: number;
  };
  onAddFolder?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  counts = { all: 248, images: 182, videos: 66, people: 6, places: 4, objects: 31 },
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
    navigateToLibrary,
    themePreference,
    setThemePreference,
  } = useUiStore();

  const [driveExpanded, setDriveExpanded] = useState(true);
  const [isDriveEjected, setIsDriveEjected] = useState(false);
  const [ejectFeedback, setEjectFeedback] = useState<string | null>(null);

  const handleEjectDrive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDriveEjected) return;
    setEjectFeedback('Safely ejected SanDisk Extreme SSD');
    setIsDriveEjected(true);
    // If a folder on the external drive was selected, clear it
    if (
      selectedFolderId &&
      mockExternalDrive.folders.some((f) => f.id === selectedFolderId)
    ) {
      clearSelectedFolder();
    }
    setTimeout(() => {
      setEjectFeedback(null);
    }, 3000);
  };

  const handleRemountDrive = () => {
    setIsDriveEjected(false);
    setEjectFeedback('Drive reconnected');
    setTimeout(() => {
      setEjectFeedback(null);
    }, 2000);
  };

  return (
    <aside
      className={`h-full bg-[var(--surface-1)] border-r border-[var(--border)] flex flex-col justify-between select-none text-sm transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
        sidebarOpen
          ? 'w-64 min-w-64 p-5 opacity-100'
          : 'w-0 min-w-0 p-0 border-r-0 opacity-0 pointer-events-none'
      }`}
    >
      {/* Top Section */}
      <div className="space-y-5 overflow-y-auto pr-1">
        {/* Wordmark logo & Collapse button */}
        <div className="pt-1 flex items-center justify-between">
          <Wordmark size="md" />
          <button
            type="button"
            onClick={toggleSidebar}
            title="Collapse sidebar"
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors"
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
          <nav className="space-y-6 pt-1">
            <div>
              <div className="text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
                Library
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('all');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentView === 'library' && scope === 'all' && !selectedFolderId
                      ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Film size={14} className="text-[var(--text-muted)]" />
                    <span>All footage</span>
                  </div>
                  <span className="tabular-nums text-[var(--text-muted)] font-normal">{counts.all}</span>
                </button>
                <button
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('images');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentView === 'library' && scope === 'images' && !selectedFolderId
                      ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Image size={14} className="text-[var(--text-muted)]" />
                    <span>Photos</span>
                  </div>
                  <span className="tabular-nums text-[var(--text-muted)] font-normal">{counts.images}</span>
                </button>
                <button
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('videos');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentView === 'library' && scope === 'videos' && !selectedFolderId
                      ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Film size={14} className="text-[var(--text-muted)]" />
                    <span>Videos</span>
                  </div>
                  <span className="tabular-nums text-[var(--text-muted)] font-normal">{counts.videos}</span>
                </button>
                <button
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToPeople();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    (currentView === 'people' || currentView === 'person-detail') && !selectedFolderId
                      ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users
                      size={14}
                      className={
                        (currentView === 'people' || currentView === 'person-detail') && !selectedFolderId
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-muted)]'
                      }
                    />
                    <span>People & Faces</span>
                  </div>
                  <span className="tabular-nums text-[var(--text-muted)] font-normal">{counts.people}</span>
                </button>
              </div>
            </div>
          </nav>
        )}

        {/* TAB 2: FOLDERS VIEW */}
        {activeTab === 'folders' && (
          <div className="space-y-5 pt-1">
            {/* Add folder button */}
            <Button
              variant="accent"
              size="lg"
              fullWidth
              onClick={onAddFolder}
              className="font-bold text-sm h-10 shadow-sm"
            >
              + Add folder
            </Button>

            {/* Notification toast if ejected */}
            {ejectFeedback && (
              <div className="bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs px-3 py-2 rounded-lg font-medium">
                {ejectFeedback}
              </div>
            )}

            {/* Section 1: ON THIS DEVICE */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
                <div className="flex items-center gap-1.5">
                  <Laptop size={12} className="text-[var(--text-muted)]" />
                  <span>On this device</span>
                </div>
                <span className="text-[10px] text-[var(--text-dim)] font-normal">
                  {mockLocalFolders.length} folders
                </span>
              </div>
              <div className="space-y-0.5">
                {mockLocalFolders.map((folder) => {
                  const isSelected = selectedFolderId === folder.id;
                  return (
                    <button
                      key={folder.id}
                      onClick={() => selectFolder(folder.id, folder.name, 'On this device')}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                        isSelected
                          ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
                          : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isSelected ? (
                          <FolderOpen size={14} className="text-[var(--accent)] shrink-0" />
                        ) : (
                          <Folder size={14} className="text-[var(--text-muted)] shrink-0" />
                        )}
                        <span className="truncate">{folder.name}</span>
                      </div>
                      <span className="tabular-nums text-[var(--text-muted)] font-normal text-[11px] ml-2 shrink-0">
                        Local
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: CONNECTED DRIVES */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
                <div className="flex items-center gap-1.5">
                  <Usb size={12} className="text-[var(--accent)]" />
                  <span>External Drives</span>
                </div>
                {!isDriveEjected ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
                    1 active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[var(--surface-2)] text-[var(--text-dim)]">
                    0 active
                  </span>
                )}
              </div>

              {/* Mock Drive Card */}
              {!isDriveEjected ? (
                <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xs">
                  {/* Drive Header */}
                  <div
                    onClick={() => setDriveExpanded(!driveExpanded)}
                    className="p-3 cursor-pointer hover:bg-[var(--surface-3)]/50 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <HardDrive size={15} className="text-[var(--accent)] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[var(--text)] truncate">
                          {mockExternalDrive.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          {mockExternalDrive.type} · {mockExternalDrive.capacity}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <button
                        type="button"
                        onClick={handleEjectDrive}
                        title="Eject external drive"
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors"
                      >
                        <EjectIcon size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-0.5 text-[var(--text-muted)]"
                        title={driveExpanded ? 'Collapse drive' : 'Expand drive'}
                      >
                        {driveExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Drive Capacity Meter */}
                  <div className="px-3 pb-2.5 pt-0.5">
                    <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[var(--accent)] h-full rounded-full transition-all"
                        style={{ width: `${mockExternalDrive.usedPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-1.5">
                      <span>{mockExternalDrive.used} used</span>
                      <span>{mockExternalDrive.free} free</span>
                    </div>
                  </div>

                  {/* Drive Folders List */}
                  {driveExpanded && (
                    <div className="border-t border-[var(--border)] bg-[var(--surface-1)] py-1">
                      {mockExternalDrive.folders.map((folder) => {
                        const isSelected = selectedFolderId === folder.id;
                        return (
                          <button
                            key={folder.id}
                            onClick={() =>
                              selectFolder(folder.id, folder.name, mockExternalDrive.name)
                            }
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold transition-colors ${
                              isSelected
                                ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
                                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {isSelected ? (
                                <FolderOpen size={13} className="text-[var(--accent)] shrink-0" />
                              ) : (
                                <Folder size={13} className="text-[var(--text-muted)] shrink-0" />
                              )}
                              <span className="truncate">{folder.name}</span>
                            </div>
                            <span className="tabular-nums text-[var(--text-muted)] font-normal text-[10px] ml-2 shrink-0">
                              Ext
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-dashed border-[var(--border)] text-center space-y-2">
                  <p className="text-xs text-[var(--text-muted)]">No external drives connected</p>
                  <button
                    onClick={handleRemountDrive}
                    className="text-[11px] text-[var(--accent)] hover:underline font-medium"
                  >
                    Simulate re-inserting SanDisk SSD
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
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
          {activeTab === 'library' ? (
            <span>Local library · runs on this device</span>
          ) : (
            <span>
              {!isDriveEjected ? '1 external drive mounted' : '0 external drives mounted'}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
};
