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
import { Button } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';
import { mockLocalFolders, mockExternalDrive } from '@snapsort/mock';
import wordmarkImg from '../assets/wordmark.png';

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
      className={`h-full bg-[#141414] border-r border-[#222222] flex flex-col justify-between select-none text-sm transition-all duration-300 ease-in-out overflow-hidden shrink-0 ${
        sidebarOpen
          ? 'w-64 min-w-64 p-5 opacity-100'
          : 'w-0 min-w-0 p-0 border-r-0 opacity-0 pointer-events-none'
      }`}
    >
      {/* Top Section */}
      <div className="space-y-5 overflow-y-auto pr-1">
        {/* Wordmark logo & Collapse button */}
        <div className="pt-1 flex items-center justify-between">
          <img
            src={wordmarkImg}
            alt="snapsort"
            className="h-7 w-auto object-contain select-none"
            draggable={false}
          />
          <button
            type="button"
            onClick={toggleSidebar}
            title="Collapse sidebar"
            className="p-1.5 rounded-lg text-[#888888] hover:text-[#F5F5F5] hover:bg-[#222222] transition-colors"
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Tab Switcher: Library | Folders */}
        <div className="flex p-1 bg-[#1A1A1A] border border-[#262626] rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('library');
              clearSelectedFolder();
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'library'
                ? 'bg-[#2A2A2A] text-[#F5F5F5] shadow-sm'
                : 'text-[#888888] hover:text-[#D5D5D5]'
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
                ? 'bg-[#2A2A2A] text-[#F5F5F5] shadow-sm'
                : 'text-[#888888] hover:text-[#D5D5D5]'
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
              <div className="text-[11px] font-bold tracking-wider text-[#666666] uppercase mb-2">
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
                      ? 'bg-[#222222] text-[#F5F5F5]'
                      : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Film size={14} className="text-[#888888]" />
                    <span>All footage</span>
                  </div>
                  <span className="tabular-nums text-[#888888] font-normal">{counts.all}</span>
                </button>
                <button
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('images');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentView === 'library' && scope === 'images' && !selectedFolderId
                      ? 'bg-[#222222] text-[#F5F5F5]'
                      : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Image size={14} className="text-[#888888]" />
                    <span>Photos</span>
                  </div>
                  <span className="tabular-nums text-[#888888] font-normal">{counts.images}</span>
                </button>
                <button
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToLibrary();
                    setScope('videos');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    currentView === 'library' && scope === 'videos' && !selectedFolderId
                      ? 'bg-[#222222] text-[#F5F5F5]'
                      : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Film size={14} className="text-[#888888]" />
                    <span>Videos</span>
                  </div>
                  <span className="tabular-nums text-[#888888] font-normal">{counts.videos}</span>
                </button>
                <button
                  onClick={() => {
                    clearSelectedFolder();
                    navigateToPeople();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    (currentView === 'people' || currentView === 'person-detail') && !selectedFolderId
                      ? 'bg-[#222222] text-[#F5F5F5]'
                      : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Users
                      size={14}
                      className={
                        (currentView === 'people' || currentView === 'person-detail') && !selectedFolderId
                          ? 'text-[#FFC400]'
                          : 'text-[#888888]'
                      }
                    />
                    <span>People & Faces</span>
                  </div>
                  <span className="tabular-nums text-[#888888] font-normal">{counts.people}</span>
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
              <div className="bg-[#242010] border border-[#443810] text-[#FFC400] text-xs px-3 py-2 rounded-lg">
                {ejectFeedback}
              </div>
            )}

            {/* Section 1: ON THIS DEVICE */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-[#666666] uppercase mb-2">
                <div className="flex items-center gap-1.5">
                  <Laptop size={12} className="text-[#777777]" />
                  <span>On this device</span>
                </div>
                <span className="text-[10px] text-[#555555] font-normal">
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
                          ? 'bg-[#222222] text-[#F5F5F5]'
                          : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isSelected ? (
                          <FolderOpen size={14} className="text-[#FFC400] shrink-0" />
                        ) : (
                          <Folder size={14} className="text-[#777777] shrink-0" />
                        )}
                        <span className="truncate">{folder.name}</span>
                      </div>
                      <span className="tabular-nums text-[#666666] font-normal text-[11px] ml-2 shrink-0">
                        Local
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: CONNECTED DRIVES */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-[#666666] uppercase mb-2">
                <div className="flex items-center gap-1.5">
                  <Usb size={12} className="text-[#FFC400]" />
                  <span>External Drives</span>
                </div>
                {!isDriveEjected ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#26261A] text-[#FFC400] border border-[#3A361A]">
                    1 active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#222222] text-[#777777]">
                    0 active
                  </span>
                )}
              </div>

              {/* Mock Drive Card */}
              {!isDriveEjected ? (
                <div className="bg-[#181818] border border-[#262626] rounded-xl overflow-hidden">
                  {/* Drive Header */}
                  <div
                    onClick={() => setDriveExpanded(!driveExpanded)}
                    className="p-3 cursor-pointer hover:bg-[#202020] transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <HardDrive size={15} className="text-[#FFC400] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#F5F5F5] truncate">
                          {mockExternalDrive.name}
                        </div>
                        <div className="text-[10px] text-[#777777] truncate">
                          {mockExternalDrive.type} · {mockExternalDrive.capacity}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <button
                        type="button"
                        onClick={handleEjectDrive}
                        title="Eject external drive"
                        className="p-1 rounded text-[#777777] hover:text-[#F5F5F5] hover:bg-[#2A2A2A] transition-colors"
                      >
                        <EjectIcon size={12} />
                      </button>
                      <button
                        type="button"
                        className="p-0.5 text-[#777777]"
                        title={driveExpanded ? 'Collapse drive' : 'Expand drive'}
                      >
                        {driveExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Drive Capacity Meter */}
                  <div className="px-3 pb-2.5 pt-0.5">
                    <div className="w-full bg-[#262626] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#FFC400] h-full rounded-full transition-all"
                        style={{ width: `${mockExternalDrive.usedPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-[#666666] mt-1.5">
                      <span>{mockExternalDrive.used} used</span>
                      <span>{mockExternalDrive.free} free</span>
                    </div>
                  </div>

                  {/* Drive Folders List */}
                  {driveExpanded && (
                    <div className="border-t border-[#222222] bg-[#141414] py-1">
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
                                ? 'bg-[#222222] text-[#F5F5F5]'
                                : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {isSelected ? (
                                <FolderOpen size={13} className="text-[#FFC400] shrink-0" />
                              ) : (
                                <Folder size={13} className="text-[#666666] shrink-0" />
                              )}
                              <span className="truncate">{folder.name}</span>
                            </div>
                            <span className="tabular-nums text-[#666666] font-normal text-[10px] ml-2 shrink-0">
                              Ext
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-dashed border-[#282828] text-center space-y-2">
                  <p className="text-xs text-[#666666]">No external drives connected</p>
                  <button
                    onClick={handleRemountDrive}
                    className="text-[11px] text-[#FFC400] hover:underline font-medium"
                  >
                    Simulate re-inserting SanDisk SSD
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Note */}
      <div className="pt-4 border-t border-[#222222] text-[11px] text-[#666666] leading-tight flex items-center justify-between">
        {activeTab === 'library' ? (
          <span>Local library · runs on this device</span>
        ) : (
          <span>
            {!isDriveEjected ? '1 external drive mounted' : '0 external drives mounted'}
          </span>
        )}
      </div>
    </aside>
  );
};
