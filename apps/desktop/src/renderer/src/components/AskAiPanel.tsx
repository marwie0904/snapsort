import React, { useState } from 'react';
import { ArrowUp, X, Sparkles } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';

export const AskAiPanel: React.FC = () => {
  const [input, setInput] = useState('');
  const { addFilter, toggleAiPanel } = useUiStore();

  const handleSend = () => {
    if (!input.trim()) return;
    setInput('');
  };

  return (
    <aside className="w-80 min-w-80 shrink-0 h-full bg-[#121212] border-l border-[#222222] flex flex-col justify-between p-5 select-none text-xs">
      {/* Top Header & Chat Messages */}
      <div className="space-y-5 overflow-y-auto pr-1">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-[#FFC400]" />
              <h2 className="text-base font-bold text-[#F5F5F5]">Ask AI</h2>
            </div>
            <p className="text-[11px] text-[#777777] mt-0.5">
              Describe what you need. I'll set the filters.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAiPanel}
            title="Close AI panel"
            className="p-1 rounded-lg text-[#888888] hover:text-[#F5F5F5] hover:bg-[#222222] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Chat Thread */}
        <div className="space-y-4">
          {/* User Message Bubble */}
          <div className="bg-[#FFC400] text-[#111111] p-3.5 rounded-2xl font-semibold text-xs leading-relaxed shadow-sm">
            Group all images where the groom and bride are visible, no other audience
          </div>

          {/* Assistant Response Box */}
          <div className="bg-[#181818] border border-[#262626] rounded-2xl p-4 space-y-3">
            <p className="text-xs text-[#E5E5E5] font-medium leading-relaxed">
              Done. I found 36 matches and applied these filters:
            </p>

            {/* Applied Filter Chips */}
            <div className="space-y-1.5 pt-1">
              <div className="inline-flex items-center px-3 py-1.5 bg-[#FFC400] text-[#111111] rounded-full text-xs font-bold">
                Includes: groom, bride
              </div>
              <div className="block">
                <div className="inline-flex items-center px-3 py-1.5 bg-[#FFC400] text-[#111111] rounded-full text-xs font-bold">
                  Max people: 2
                </div>
              </div>
            </div>
          </div>

          {/* Quick Suggestion Pills */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => {
                addFilter({ kind: 'mediaKind', value: 'video', source: 'ai' });
              }}
              className="px-3.5 py-1.5 rounded-full bg-[#181818] border border-[#282828] text-xs font-medium text-[#E5E5E5] hover:border-[#444444] transition-colors"
            >
              Only video
            </button>
            <button
              onClick={() => {
                addFilter({ kind: 'label', module: 'objects', labelId: 'cake', source: 'ai' });
              }}
              className="px-3.5 py-1.5 rounded-full bg-[#181818] border border-[#282828] text-xs font-medium text-[#E5E5E5] hover:border-[#444444] transition-colors"
            >
              Add cake cutting
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Composer */}
      <div className="pt-3 border-t border-[#222222]">
        <div className="flex items-center bg-[#181818] border border-[#282828] rounded-full px-3 py-1.5 focus-within:border-[#444444] transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask for a filter..."
            className="bg-transparent border-none outline-none w-full text-xs text-[#E5E5E5] placeholder-[#666666] px-2"
          />
          <button
            type="button"
            onClick={handleSend}
            className="w-7 h-7 rounded-full bg-[#FFC400] text-[#111111] flex items-center justify-center shrink-0 hover:brightness-105 active:brightness-95 transition-all"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </aside>
  );
};
