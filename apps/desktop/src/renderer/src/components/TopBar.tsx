import React from 'react';
import { Search, Image, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';

export const TopBar: React.FC = () => {
  const { q, setQ, aiPanelOpen, toggleAiPanel } = useUiStore();

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Search Input Container */}
      <div className="flex-1 min-w-0 flex items-center bg-[#181818] border border-[#282828] rounded-full px-4 py-2 text-sm text-[#F5F5F5] focus-within:border-[#444444] transition-all">
        <Search size={16} className="text-[#888888] mr-3 shrink-0" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search what's said, what's on screen, who's in it"
          className="bg-transparent border-none outline-none w-full min-w-0 text-xs text-[#E5E5E5] placeholder-[#777777]"
        />
        <button
          type="button"
          title="Reverse image search"
          className="p-1 rounded-full text-[#888888] hover:text-[#FFC400] transition-colors ml-2 shrink-0"
        >
          <Image size={16} />
        </button>
      </div>

      {/* Filter Button */}
      <button
        type="button"
        className="flex items-center gap-1.5 px-4 py-2 bg-[#181818] border border-[#282828] hover:border-[#444444] rounded-full text-xs font-semibold text-[#E5E5E5] transition-colors select-none shrink-0"
      >
        <SlidersHorizontal size={13} className="text-[#888888]" />
        <span>Filter</span>
      </button>

      {/* Ask AI Toggle Button */}
      <button
        type="button"
        onClick={toggleAiPanel}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors select-none shrink-0 ${
          aiPanelOpen
            ? 'bg-[#FFC400] text-[#111111]'
            : 'bg-[#181818] border border-[#282828] hover:border-[#444444] text-[#E5E5E5]'
        }`}
        title="Toggle Ask AI Assistant"
      >
        <Sparkles size={13} className={aiPanelOpen ? 'text-[#111111]' : 'text-[#FFC400]'} />
        <span>Ask AI</span>
      </button>
    </div>
  );
};
