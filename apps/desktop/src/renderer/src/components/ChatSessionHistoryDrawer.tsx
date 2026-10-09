import React, { useState, useEffect, useRef } from 'react';
import { History, X, Search, Plus, Trash2, Edit2, Check, MessageSquare, Filter as FilterIcon } from 'lucide-react';
import { useChatSessionStore, ChatSession } from '../stores/useChatSessionStore';

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export const ChatSessionHistoryDrawer: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    setIsHistoryOpen,
    switchSession,
    deleteSession,
    renameSession,
    createSession,
  } = useChatSessionStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingSessionId) {
          setEditingSessionId(null);
        } else {
          setIsHistoryOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingSessionId, setIsHistoryOpen]);

  // Focus rename input when editing starts
  useEffect(() => {
    if (editingSessionId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingSessionId]);

  const handleStartRename = (e: React.MouseEvent, session: ChatSession) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditTitle(session.title);
  };

  const handleSaveRename = (sessionId: string) => {
    if (editTitle.trim()) {
      renameSession(sessionId, editTitle.trim());
    }
    setEditingSessionId(null);
  };

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    deleteSession(sessionId);
  };

  const filteredSessions = sessions.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchesTitle = s.title.toLowerCase().includes(q);
    const matchesContent = s.messages.some((m) => m.content.toLowerCase().includes(q));
    return matchesTitle || matchesContent;
  });

  return (
    <div className="absolute inset-0 z-30 bg-[var(--surface-1)] flex flex-col p-4 select-none animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <History size={16} className="text-[var(--accent)]" />
          <h3 className="text-sm font-bold text-[var(--text)]">Chat History</h3>
          <span className="px-1.5 py-0.5 rounded-full bg-[var(--surface-3)] text-[10px] font-semibold text-[var(--text-muted)]">
            {sessions.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => createSession()}
            title="Start new chat"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] border border-[var(--border)] transition-colors cursor-pointer"
          >
            <Plus size={12} />
            <span>New</span>
          </button>
          <button
            type="button"
            onClick={() => setIsHistoryOpen(false)}
            title="Back to chat (Esc)"
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="pt-3 pb-2 shrink-0">
        <div className="flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-2.5 py-1.5 focus-within:border-[var(--border-focus)] transition-colors">
          <Search size={13} className="text-[var(--text-muted)] shrink-0 mr-1.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search past chats..."
            className="bg-transparent border-none outline-none w-full text-xs text-[var(--text)] placeholder-[var(--text-dim)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto space-y-2 py-2 pr-0.5">
        {filteredSessions.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center px-4 text-xs text-[var(--text-muted)]">
            <MessageSquare size={24} className="stroke-1 text-[var(--text-dim)] mb-2" />
            <p className="font-medium text-[var(--text)]">No chats found</p>
            <p className="text-[11px] text-[var(--text-dim)] mt-0.5">
              {searchQuery ? 'Try a different search term.' : 'Start a conversation to see it here.'}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const messageCount = session.messages.filter((m) => m.role === 'user').length;
            const hasFilters = (session.lastFilters && session.lastFilters.length > 0) || false;

            return (
              <div
                key={session.id}
                onClick={() => switchSession(session.id)}
                className={`group relative p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                  isActive
                    ? 'bg-[var(--surface-2)] border-[var(--accent)] shadow-xs'
                    : 'bg-[var(--surface-2)]/60 border-[var(--border)] hover:bg-[var(--surface-2)] hover:border-[var(--border-focus)]'
                }`}
              >
                {/* Top row: Title / Inline Rename */}
                <div className="flex items-center justify-between gap-2">
                  {editingSessionId === session.id ? (
                    <div
                      className="flex items-center gap-1.5 flex-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(session.id);
                          if (e.key === 'Escape') setEditingSessionId(null);
                        }}
                        onBlur={() => handleSaveRename(session.id)}
                        className="flex-1 bg-[var(--surface-1)] border border-[var(--border-focus)] rounded px-1.5 py-0.5 text-xs text-[var(--text)] font-semibold outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRename(session.id)}
                        className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--accent)] cursor-pointer"
                        title="Save title"
                      >
                        <Check size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-semibold text-xs text-[var(--text)] truncate flex-1">
                        {session.title}
                      </span>
                      {isActive && (
                        <span className="shrink-0 px-1.5 py-0.2 rounded bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-[9px] uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </>
                  )}

                  {/* Actions (Rename, Delete) */}
                  {editingSessionId !== session.id && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(e, session)}
                        title="Rename chat"
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, session.id)}
                        title="Delete chat"
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Bottom row: Metadata */}
                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                  <span>{formatRelativeTime(session.updatedAt || session.createdAt)}</span>
                  <div className="flex items-center gap-1.5">
                    {hasFilters && (
                      <span className="flex items-center gap-0.5 text-[var(--accent-text)] font-medium">
                        <FilterIcon size={10} />
                        <span>Filters</span>
                      </span>
                    )}
                    <span>
                      {messageCount} {messageCount === 1 ? 'query' : 'queries'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="pt-2 border-t border-[var(--border)] shrink-0 flex items-center justify-between text-[11px] text-[var(--text-dim)]">
        <span>Click to switch chat</span>
        <button
          type="button"
          onClick={() => createSession()}
          className="text-[var(--accent)] hover:underline font-semibold cursor-pointer"
        >
          + New Chat
        </button>
      </div>
    </div>
  );
};
