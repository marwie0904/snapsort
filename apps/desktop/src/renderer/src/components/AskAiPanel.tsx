import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUp,
  X,
  Sparkles,
  Zap,
  Check,
  RotateCcw,
  Edit2,
  Plus,
  Undo2,
  History,
  SlidersHorizontal,
} from 'lucide-react';
import { useUiStore } from '../stores/useUiStore';
import { useChatSessionStore, ChatMessage } from '../stores/useChatSessionStore';
import { ChatSessionHistoryDrawer } from './ChatSessionHistoryDrawer';
import { parsePromptToFilters, ParsedAiFilterResult } from '../utils/aiFilterEngine';
import type { Filter } from '@snapsort/contract';

const DEFAULT_PANEL_WIDTH = 380;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH_PX = 650;
const WIDTH_STORAGE_KEY = 'snapsort-ai-panel-width';

function getStoredWidth(): number {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_PANEL_WIDTH;
  try {
    const saved = window.localStorage.getItem(WIDTH_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_PANEL_WIDTH && parsed <= MAX_PANEL_WIDTH_PX) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return DEFAULT_PANEL_WIDTH;
}

interface AskAiPanelProps {
  currentMatchedCount?: number;
}

export const AskAiPanel: React.FC<AskAiPanelProps> = ({ currentMatchedCount = 36 }) => {
  const [panelWidth, setPanelWidth] = useState<number>(getStoredWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    filters,
    quickActions,
    setFilters,
    addQuickAction,
    setScope,
    toggleAiPanel,
    customPeopleNames,
  } = useUiStore();

  const {
    sessions,
    activeSessionId,
    isHistoryOpen,
    toggleHistoryOpen,
    getActiveSession,
    createSession,
    addMessageToActiveSession,
    updateMessageInActiveSession,
    setSessionFilters,
  } = useChatSessionStore();

  const activeSession = getActiveSession();
  const messages = activeSession.messages;

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(Math.max(scrollH, 36), 110)}px`;
    }
  }, [input]);

  // Resizing logic via left drag handle
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const startWidth = panelWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const delta = startX - moveEvent.clientX; // moving left increases width
        const maxAllowed = Math.min(MAX_PANEL_WIDTH_PX, Math.floor(window.innerWidth * 0.55));
        const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(maxAllowed, startWidth + delta));
        setPanelWidth(newWidth);
      };

      const handlePointerUp = () => {
        setIsResizing(false);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        setPanelWidth((curr) => {
          try {
            window.localStorage.setItem(WIDTH_STORAGE_KEY, curr.toString());
          } catch {
            // ignore
          }
          return curr;
        });
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [panelWidth]
  );

  const handleResetWidth = () => {
    setPanelWidth(DEFAULT_PANEL_WIDTH);
    try {
      window.localStorage.setItem(WIDTH_STORAGE_KEY, DEFAULT_PANEL_WIDTH.toString());
    } catch {
      // ignore
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  // Compare active session's filters with currently applied filters in useUiStore
  const areSessionFiltersDifferent = useCallback(() => {
    const sessionFilters = activeSession.lastFilters;
    if (!sessionFilters || sessionFilters.length === 0) return false;
    if (filters.length !== sessionFilters.length) return true;
    return JSON.stringify(filters) !== JSON.stringify(sessionFilters);
  }, [activeSession.lastFilters, filters]);

  const handleApplySessionFilters = () => {
    if (activeSession.lastFilters && activeSession.lastFilters.length > 0) {
      setFilters(activeSession.lastFilters);
      if (activeSession.lastScope) {
        setScope(activeSession.lastScope);
      }
    }
  };

  const handleSend = () => {
    if (!input.trim() || isThinking) return;

    const userText = input.trim();
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '36px';
    }

    const userMsgId = `user-${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: userText,
      createdAt: new Date().toISOString(),
    };

    const prevFiltersSnapshot = [...filters];
    addMessageToActiveSession(newMsg);
    setIsThinking(true);

    // Parse prompt with client-side NLP
    const parsed: ParsedAiFilterResult = parsePromptToFilters(userText, customPeopleNames);

    // Auto-apply filters immediately
    if (parsed.filters.length > 0) {
      setFilters(parsed.filters);
      if (parsed.scope && parsed.scope !== 'all') {
        setScope(parsed.scope);
      }
      setSessionFilters(activeSession.id, parsed.filters, parsed.scope);
    }

    setTimeout(() => {
      let matches = currentMatchedCount;
      if (parsed.filters.length > 1) {
        matches = Math.max(8, Math.floor(currentMatchedCount * 0.45));
      } else if (parsed.filters.length === 1) {
        matches = Math.max(14, Math.floor(currentMatchedCount * 0.7));
      }

      const steps: Array<{ action: string; description: string }> = [
        { action: 'detect', description: 'Intent parsed' },
        ...(parsed.filters.length > 0
          ? [{ action: 'filter', description: parsed.summaryDescriptions.join(' • ') || 'applied filters' }]
          : []),
      ];

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: `Done. I found ${matches} matches and applied these filters:`,
        steps,
        filters: parsed.filters,
        previousFilters: prevFiltersSnapshot,
        scope: parsed.scope,
        summaryDescriptions: parsed.summaryDescriptions,
        suggestedTitle: parsed.suggestedTitle,
        quickActionTitle: parsed.suggestedTitle,
        isSaved: false,
        matchedCount: matches,
        suggestions: parsed.suggestions,
        createdAt: new Date().toISOString(),
      };

      setIsThinking(false);
      addMessageToActiveSession(assistantMsg);
    }, 250);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUndo = (msg: ChatMessage) => {
    if (msg.previousFilters !== undefined) {
      setFilters(msg.previousFilters);
    }
  };

  const handleSaveAsQuickAction = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || !msg.filters) return;

    const titleToUse = msg.quickActionTitle || msg.suggestedTitle || 'Custom Filter';
    const action = addQuickAction(titleToUse, msg.filters, msg.scope);

    updateMessageInActiveSession(msgId, {
      isSaved: true,
      quickActionId: action.id,
    });
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
    updateMessageInActiveSession(msgId, { quickActionTitle: newTitle });
  };

  const handleSuggestionClick = (suggestionText: string) => {
    setInput(suggestionText);
    textareaRef.current?.focus();
  };

  return (
    <aside
      style={{ width: `${panelWidth}px`, minWidth: `${MIN_PANEL_WIDTH}px` }}
      className={`relative shrink-0 h-full bg-[var(--surface-1)] border-l border-[var(--border)] flex flex-col justify-between p-4.5 select-none text-xs transition-none ${
        isResizing ? 'cursor-col-resize user-select-none' : ''
      }`}
    >
      {/* 1. Left Edge Resize Handle */}
      <div
        onPointerDown={handlePointerDown}
        onDoubleClick={handleResetWidth}
        title="Drag to resize panel (Double-click to reset)"
        className="absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-20 group flex items-center justify-center"
      >
        <div
          className={`w-1 h-8 rounded-full transition-colors ${
            isResizing
              ? 'bg-[var(--accent)] opacity-100 scale-y-125'
              : 'bg-transparent group-hover:bg-[var(--accent)]/60'
          }`}
        />
      </div>

      {/* 2. Slide-over Chat History Drawer */}
      {isHistoryOpen && <ChatSessionHistoryDrawer />}

      {/* 3. Main Chat View (Header + Message Thread) */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
        {/* Header */}
        <div className="flex items-start justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={14} className="text-[var(--accent)] shrink-0" />
              <h2 className="text-sm font-bold text-[var(--text)] truncate">
                {activeSession.title || 'Ask AI'}
              </h2>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
              Describe what you need. I'll set the filters.
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* History Toggle */}
            <button
              type="button"
              onClick={toggleHistoryOpen}
              title={`View chat history (${sessions.length} chats)`}
              aria-label="View chat history"
              className="relative p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border border-[var(--border)] transition-colors cursor-pointer"
            >
              <History size={13} />
              {sessions.length > 1 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-ink)] text-[9px] font-bold">
                  {sessions.length}
                </span>
              )}
            </button>

            {/* New Chat Button */}
            <button
              type="button"
              onClick={() => createSession()}
              title="Start a new chat"
              aria-label="Start a new chat"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border border-[var(--border)] transition-colors cursor-pointer"
            >
              <Plus size={12} />
              <span>New</span>
            </button>

            {/* Close AI Panel */}
            <button
              type="button"
              onClick={toggleAiPanel}
              title="Close AI panel"
              aria-label="Close AI panel"
              className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Sync Banner: Show if session has filters not currently active in gallery */}
        {areSessionFiltersDifferent() && (
          <div className="bg-[var(--surface-2)] border border-[var(--accent)]/40 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0">
              <SlidersHorizontal size={13} className="text-[var(--accent)] shrink-0" />
              <span className="text-[11px] text-[var(--text-muted)] truncate">
                Session filters are not active in gallery
              </span>
            </div>
            <button
              type="button"
              onClick={handleApplySessionFilters}
              className="px-2 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-[10px] hover:brightness-105 active:brightness-95 shrink-0 transition-all cursor-pointer"
            >
              Apply Filters
            </button>
          </div>
        )}

        {/* Chat Thread */}
        <div className="space-y-4 pt-1">
          {messages.map((msg) => {
            if (msg.role === 'user') {
              return (
                <div
                  key={msg.id}
                  className="bg-[var(--accent)] text-[var(--accent-ink)] p-3 rounded-2xl font-semibold text-xs leading-relaxed shadow-xs break-words"
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
                className="bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl p-3.5 space-y-3 shadow-xs"
              >
                {/* Tool Execution Step Chips */}
                {msg.steps && msg.steps.length > 0 && (
                  <div className="flex flex-col gap-1 pb-1">
                    {msg.steps.map((st, sIdx) => (
                      <div
                        key={sIdx}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--surface-1)] border border-[var(--border)] text-[10px] font-mono text-[var(--text-muted)]"
                      >
                        <span className="text-[var(--accent)] font-semibold uppercase">{st.action}:</span>
                        <span className="text-[var(--text)] truncate">{st.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-[var(--text)] font-medium leading-relaxed">
                  {msg.content}
                </p>

                {/* Filter Summary Chips */}
                {msg.summaryDescriptions && msg.summaryDescriptions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {msg.summaryDescriptions.map((desc, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center px-2.5 py-0.8 bg-[var(--accent)] text-[var(--accent-ink)] rounded-full text-xs font-bold"
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
                      <div className="flex items-center gap-1.5 text-[var(--accent-text)] font-semibold text-[11px]">
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
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 active:brightness-95 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
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
                        aria-label="Re-apply filters"
                        className="p-1.5 bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] rounded-lg transition-colors border border-[var(--border)] cursor-pointer"
                      >
                        <RotateCcw size={14} />
                      </button>

                      {msg.previousFilters !== undefined && (
                        <button
                          type="button"
                          onClick={() => handleUndo(msg)}
                          title="Undo filters applied by this prompt"
                          aria-label="Undo filters"
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] rounded-lg text-xs font-semibold transition-colors border border-[var(--border)] cursor-pointer"
                        >
                          <Undo2 size={13} />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Suggestion Pills */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--border)]">
                    {msg.suggestions.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSuggestionClick(sug)}
                        className="px-2.5 py-1 rounded-full bg-[var(--surface-1)] border border-[var(--border)] text-[11px] font-medium text-[var(--text)] hover:border-[var(--border-focus)] transition-colors cursor-pointer"
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

      {/* 4. Bottom Composer */}
      <div className="pt-3 border-t border-[var(--border)] shrink-0">
        <div className="flex items-end bg-[var(--surface-2)] border border-[var(--border)] rounded-2xl px-3 py-1.5 focus-within:border-[var(--border-focus)] transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for a filter, e.g. bride with flowers... (Enter to send)"
            className="bg-transparent border-none outline-none w-full text-xs text-[var(--text)] placeholder-[var(--text-dim)] py-1 resize-none leading-relaxed"
          />

          <div className="flex items-center gap-1 shrink-0 ml-1.5 pb-0.5">
            {input.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setInput('')}
                title="Clear input"
                className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                <X size={13} />
              </button>
            )}

            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              aria-label="Send message"
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                input.trim() && !isThinking
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)] hover:brightness-105 active:brightness-95 cursor-pointer shadow-xs'
                  : 'bg-[var(--surface-3)] text-[var(--text-dim)] cursor-not-allowed'
              }`}
            >
              <ArrowUp size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[var(--text-dim)] mt-1.5 px-1">
          <span>Shift + Enter for new line</span>
          <span>Double-click border to reset width</span>
        </div>
      </div>
    </aside>
  );
};
