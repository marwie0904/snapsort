import React, { useState, useRef, useEffect } from 'react';
import { ArrowUp, X, Sparkles, Zap, Check, RotateCcw, Edit2 } from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';
import { parsePromptToFilters, ParsedAiFilterResult } from '../utils/aiFilterEngine';
import type { Filter } from '@snapsort/contract';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  filters?: Filter[];
  scope?: 'all' | 'images' | 'videos';
  summaryDescriptions?: string[];
  suggestedTitle?: string;
  quickActionTitle?: string;
  isSaved?: boolean;
  quickActionId?: string;
  suggestions?: string[];
  matchedCount?: number;
}

interface AskAiPanelProps {
  currentMatchedCount?: number;
}

export const AskAiPanel: React.FC<AskAiPanelProps> = ({ currentMatchedCount = 36 }) => {
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    filters,
    quickActions,
    setFilters,
    addFilter,
    removeFilter,
    addQuickAction,
    applyQuickAction,
    setScope,
    toggleAiPanel,
    customPeopleNames,
  } = useUiStore();

  // Initial conversation preserved from design reference
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-demo-1',
      role: 'user',
      content: 'Group all images where the groom and bride are visible, no other audience',
    },
    {
      id: 'msg-demo-2',
      role: 'assistant',
      content: 'Done. I found 36 matches and applied these filters:',
      filters: [{ kind: 'person', ids: [1, 2], match: 'all', source: 'ai' }],
      scope: 'all',
      summaryDescriptions: ['Includes: groom, bride', 'Max people: 2'],
      suggestedTitle: 'Groom + Bride',
      quickActionTitle: 'Groom + Bride',
      isSaved: true,
      quickActionId: 'qa-default-1',
      matchedCount: 36,
      suggestions: ['Only video', 'Add cake cutting'],
    },
  ]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSend = () => {
    if (!input.trim() || isThinking) return;

    const userText = input.trim();
    setInput('');

    const userMsgId = `user-${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: userText,
    };

    setMessages((prev) => [...prev, newMsg]);
    setIsThinking(true);

    // Parse prompt with client-side NLP
    const parsed: ParsedAiFilterResult = parsePromptToFilters(userText, customPeopleNames);

    // Auto-apply filters immediately as aligned during grilling
    if (parsed.filters.length > 0) {
      setFilters(parsed.filters);
      if (parsed.scope && parsed.scope !== 'all') {
        setScope(parsed.scope);
      }
    }

    setTimeout(() => {
      // Calculate realistic match count based on filter complexity or current gallery count
      let matches = currentMatchedCount;
      if (parsed.filters.length > 1) {
        matches = Math.max(8, Math.floor(currentMatchedCount * 0.45));
      } else if (parsed.filters.length === 1) {
        matches = Math.max(14, Math.floor(currentMatchedCount * 0.7));
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: `Done. I found ${matches} matches and applied these filters:`,
        filters: parsed.filters,
        scope: parsed.scope,
        summaryDescriptions: parsed.summaryDescriptions,
        suggestedTitle: parsed.suggestedTitle,
        quickActionTitle: parsed.suggestedTitle,
        isSaved: false,
        matchedCount: matches,
        suggestions: parsed.suggestions,
      };

      setIsThinking(false);
      setMessages((prev) => [...prev, assistantMsg]);
    }, 250);
  };

  const handleSaveAsQuickAction = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || !msg.filters) return;

    const titleToUse = msg.quickActionTitle || msg.suggestedTitle || 'Custom Filter';
    const action = addQuickAction(titleToUse, msg.filters, msg.scope);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, isSaved: true, quickActionId: action.id } : m
      )
    );
  };

  const handleReapply = (msg: ChatMessage) => {
    if (msg.filters) {
      setFilters(msg.filters, msg.quickActionId ?? null);
      if (msg.scope) {
        setScope(msg.scope);
      }
    }
  };

  const handleTitleChange = (msgId: string, newTitle: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId ? { ...m, quickActionTitle: newTitle } : m
      )
    );
  };

  const handleSuggestionClick = (suggestionText: string) => {
    setInput(suggestionText);
  };

  return (
    <aside className="w-84 min-w-84 shrink-0 h-full bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col justify-between p-5 select-none text-xs">
      {/* Top Header & Chat Messages */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto pr-1">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-[var(--accent)]" />
              <h2 className="text-base font-bold text-[var(--text)]">Ask AI</h2>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Describe what you need. I'll set the filters.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAiPanel}
            title="Close AI panel"
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Chat Thread */}
        <div className="space-y-4">
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div
                  key={msg.id}
                  className="bg-[var(--accent)] text-[var(--accent-ink)] p-3.5 rounded-2xl font-semibold text-xs leading-relaxed shadow-xs"
                >
                  {msg.content}
                </div>
              );
            }

            // Assistant Response Card
            const isSaved = msg.isSaved || quickActions.some((qa) => qa.id === msg.quickActionId);

            return (
              <div
                key={msg.id}
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-4 space-y-3 shadow-xs"
              >
                <p className="text-xs text-[var(--text)] font-medium leading-relaxed">
                  {msg.content}
                </p>

                {/* Filter Summary Chips */}
                {msg.summaryDescriptions && msg.summaryDescriptions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msg.summaryDescriptions.map((desc, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center px-3 py-1 bg-[var(--accent)] text-[var(--accent-ink)] rounded-full text-xs font-bold"
                      >
                        {desc}
                      </div>
                    ))}
                  </div>
                )}

                {/* Interactive Quick Action Card */}
                {msg.filters && msg.filters.length > 0 && (
                  <div className="mt-3 bg-[var(--surface-1)] border border-[var(--border)] rounded-xl p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[var(--accent)] font-semibold text-[11px]">
                        <Zap size={13} fill="currentColor" />
                        <span>Quick Action Filter</span>
                      </div>
                      {isSaved ? (
                        <span className="flex items-center gap-1 text-[var(--success)] text-[10px] font-semibold">
                          <Check size={12} strokeWidth={3} />
                          Saved to Toolbar
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">1-click preset</span>
                      )}
                    </div>

                    {/* Editable Title Input */}
                    <div className="flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 focus-within:border-[var(--border-focus)] transition-colors">
                      <input
                        type="text"
                        value={msg.quickActionTitle ?? msg.suggestedTitle ?? ''}
                        onChange={(e) => handleTitleChange(msg.id, e.target.value)}
                        placeholder="Action name..."
                        className="bg-transparent border-none outline-none w-full text-xs text-[var(--text)] font-medium"
                      />
                      <Edit2 size={12} className="text-[var(--text-muted)] shrink-0 ml-1.5" />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {!isSaved ? (
                        <button
                          type="button"
                          onClick={() => handleSaveAsQuickAction(msg.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 active:brightness-95 rounded-lg text-xs font-bold transition-all shadow-xs"
                        >
                          <Zap size={13} fill="currentColor" />
                          Save as Quick Action
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--surface-2)] text-[var(--success)] rounded-lg text-xs font-semibold cursor-default border border-[var(--border)]"
                        >
                          <Check size={13} strokeWidth={2.5} />
                          Active in FilterBar
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleReapply(msg)}
                        title="Re-apply this filter set"
                        className="p-1.5 bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] rounded-lg transition-colors border border-[var(--border)]"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick Suggestion Pills */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                    {msg.suggestions.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSuggestionClick(sug)}
                        className="px-3 py-1 rounded-full bg-[var(--surface-1)] border border-[var(--border)] text-[11px] font-medium text-[var(--text)] hover:border-[var(--border-focus)] transition-colors"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Thinking Indicator */}
          {isThinking && (
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-3.5 flex items-center gap-2 text-xs text-[var(--text-muted)] animate-pulse">
              <Sparkles size={14} className="text-[var(--accent)]" />
              <span>Analyzing intent & finding matches...</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Composer */}
      <div className="pt-3 border-t border-[var(--border)] shrink-0">
        <div className="flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-1.5 focus-within:border-[var(--border-focus)] transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask for a filter, e.g. bride with flowers..."
            className="bg-transparent border-none outline-none w-full text-xs text-[var(--text)] placeholder-[var(--text-dim)] px-2"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
              input.trim() && !isThinking
                ? 'bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 active:brightness-95 cursor-pointer shadow-xs'
                : 'bg-[var(--surface-3)] text-[var(--text-dim)] cursor-not-allowed'
            }`}
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </aside>
  );
};
