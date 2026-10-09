import React from 'react';
import { Wordmark, Button } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';

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
  const { scope, setScope } = useUiStore();

  return (
    <aside className="w-64 min-w-64 h-full bg-[#141414] border-r border-[#222222] flex flex-col justify-between p-5 select-none text-sm">
      {/* Top Section */}
      <div className="space-y-6">
        {/* Wordmark logo */}
        <div className="pt-1">
          <Wordmark variant="dot" size="md" />
        </div>

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

        {/* Navigation Sections */}
        <nav className="space-y-6">
          {/* LIBRARY */}
          <div>
            <div className="text-[11px] font-bold tracking-wider text-[#666666] uppercase mb-2">
              Library
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => setScope('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  scope === 'all'
                    ? 'bg-[#222222] text-[#F5F5F5]'
                    : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                }`}
              >
                <span>All footage</span>
                <span className="tabular-nums text-[#888888] font-normal">{counts.all}</span>
              </button>
              <button
                onClick={() => setScope('images')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  scope === 'images'
                    ? 'bg-[#222222] text-[#F5F5F5]'
                    : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                }`}
              >
                <span>Photos</span>
                <span className="tabular-nums text-[#888888] font-normal">{counts.images}</span>
              </button>
              <button
                onClick={() => setScope('videos')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  scope === 'videos'
                    ? 'bg-[#222222] text-[#F5F5F5]'
                    : 'text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A]'
                }`}
              >
                <span>Videos</span>
                <span className="tabular-nums text-[#888888] font-normal">{counts.videos}</span>
              </button>
            </div>
          </div>

          {/* EXPLORE */}
          <div>
            <div className="text-[11px] font-bold tracking-wider text-[#666666] uppercase mb-2">
              Explore
            </div>
            <div className="space-y-0.5">
              <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors">
                <span>People</span>
                <span className="tabular-nums text-[#888888] font-normal">{counts.people}</span>
              </button>
              <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors">
                <span>Places</span>
                <span className="tabular-nums text-[#888888] font-normal">{counts.places}</span>
              </button>
              <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-[#AAAAAA] hover:text-[#F5F5F5] hover:bg-[#1A1A1A] transition-colors">
                <span>Tags</span>
                <span className="tabular-nums text-[#888888] font-normal">{counts.objects}</span>
              </button>
            </div>
          </div>

          {/* FOLDERS */}
          <div>
            <div className="text-[11px] font-bold tracking-wider text-[#666666] uppercase mb-2">
              Folders
            </div>
            <div className="space-y-0.5 text-xs text-[#AAAAAA]">
              <div className="px-3 py-2 rounded-lg hover:text-[#F5F5F5] hover:bg-[#1A1A1A] cursor-pointer">
                Ceremony
              </div>
              <div className="px-3 py-2 rounded-lg hover:text-[#F5F5F5] hover:bg-[#1A1A1A] cursor-pointer">
                Reception
              </div>
              <div className="px-3 py-2 rounded-lg hover:text-[#F5F5F5] hover:bg-[#1A1A1A] cursor-pointer">
                Drone
              </div>
            </div>
          </div>
        </nav>
      </div>

      {/* Footer Note */}
      <div className="pt-4 border-t border-[#222222] text-[11px] text-[#666666] leading-tight">
        Local library · runs on this device
      </div>
    </aside>
  );
};
