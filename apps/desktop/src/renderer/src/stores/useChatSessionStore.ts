import { create } from 'zustand';
import type { Filter } from '@snapsort/contract';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: Array<{ action: string; description: string }>;
  filters?: Filter[];
  previousFilters?: Filter[];
  scope?: 'all' | 'images' | 'videos';
  summaryDescriptions?: string[];
  suggestedTitle?: string;
  quickActionTitle?: string;
  isSaved?: boolean;
  quickActionId?: string;
  suggestions?: string[];
  matchedCount?: number;
  createdAt?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  lastFilters?: Filter[];
  lastScope?: 'all' | 'images' | 'videos';
}

const STORAGE_KEY = 'snapsort-chat-sessions';
const ACTIVE_SESSION_KEY = 'snapsort-active-chat-id';

const WELCOME = 'What would you like to find? Describe people, objects, places, dates or what is in the shot.';

export const INITIAL_SESSION: ChatSession = {
  id: 'session-initial',
  title: 'New Chat',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [{ id: 'welcome-initial', role: 'assistant', content: WELCOME, createdAt: new Date().toISOString() }],
};

function loadStoredSessions(): { sessions: ChatSession[]; activeId: string } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { sessions: [INITIAL_SESSION], activeId: INITIAL_SESSION.id };
  }

  try {
    const rawSessions = window.localStorage.getItem(STORAGE_KEY);
    const storedActiveId = window.localStorage.getItem(ACTIVE_SESSION_KEY);

    if (!rawSessions) {
      return { sessions: [INITIAL_SESSION], activeId: INITIAL_SESSION.id };
    }

    // The old mock wedding chat may still be stored from earlier builds
    const parsed: ChatSession[] = JSON.parse(rawSessions).filter?.(
      (s: ChatSession) => s.id !== 'session-demo-wedding'
    );
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { sessions: [INITIAL_SESSION], activeId: INITIAL_SESSION.id };
    }

    const validActiveId = parsed.some((s) => s.id === storedActiveId)
      ? storedActiveId!
      : parsed[0].id;

    return { sessions: parsed, activeId: validActiveId };
  } catch {
    return { sessions: [INITIAL_SESSION], activeId: INITIAL_SESSION.id };
  }
}

function persistSessions(sessions: ChatSession[], activeId: string) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    window.localStorage.setItem(ACTIVE_SESSION_KEY, activeId);
  } catch (err) {
    console.warn('Failed to persist chat sessions to localStorage:', err);
  }
}

export function generateSessionTitle(prompt: string): string {
  const cleaned = prompt.trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return 'New Chat';
  if (cleaned.length <= 32) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned.slice(0, 30).trim() + '…';
}

export interface ChatSessionState {
  sessions: ChatSession[];
  activeSessionId: string;
  isHistoryOpen: boolean;

  // Actions
  setIsHistoryOpen: (open: boolean) => void;
  toggleHistoryOpen: () => void;
  getActiveSession: () => ChatSession;
  createSession: (initialPrompt?: string) => ChatSession;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  renameSession: (sessionId: string, newTitle: string) => void;
  addMessageToActiveSession: (message: ChatMessage) => void;
  updateMessageInActiveSession: (messageId: string, patch: Partial<ChatMessage>) => void;
  setSessionFilters: (sessionId: string, filters: Filter[], scope?: 'all' | 'images' | 'videos') => void;
  resetAllSessions: () => void;
}

const initial = loadStoredSessions();

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
  sessions: initial.sessions,
  activeSessionId: initial.activeId,
  isHistoryOpen: false,

  setIsHistoryOpen: (open) => set({ isHistoryOpen: open }),
  toggleHistoryOpen: () => set((state) => ({ isHistoryOpen: !state.isHistoryOpen })),

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    const found = sessions.find((s) => s.id === activeSessionId);
    return found || sessions[0] || INITIAL_SESSION;
  },

  createSession: (initialPrompt?: string) => {
    const id = `session-${Date.now()}`;
    const title = initialPrompt ? generateSessionTitle(initialPrompt) : 'New Chat';
    const now = Date.now();

    const welcomeMsg: ChatMessage = {
      id: `welcome-${now}`,
      role: 'assistant',
      content: WELCOME,
      createdAt: new Date(now).toISOString(),
    };

    const newSession: ChatSession = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messages: [welcomeMsg],
    };

    set((state) => {
      const nextSessions = [newSession, ...state.sessions];
      persistSessions(nextSessions, id);
      return {
        sessions: nextSessions,
        activeSessionId: id,
        isHistoryOpen: false,
      };
    });

    return newSession;
  },

  switchSession: (sessionId: string) => {
    const { sessions } = get();
    if (!sessions.some((s) => s.id === sessionId)) return;
    set({ activeSessionId: sessionId, isHistoryOpen: false });
    persistSessions(sessions, sessionId);
  },

  deleteSession: (sessionId: string) => {
    set((state) => {
      const remaining = state.sessions.filter((s) => s.id !== sessionId);
      if (remaining.length === 0) {
        // Always maintain at least one session
        const fallback: ChatSession = {
          id: `session-${Date.now()}`,
          title: 'New Chat',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [
            {
              id: `welcome-${Date.now()}`,
              role: 'assistant',
              content: WELCOME,
              createdAt: new Date().toISOString(),
            },
          ],
        };
        persistSessions([fallback], fallback.id);
        return {
          sessions: [fallback],
          activeSessionId: fallback.id,
        };
      }

      const nextActiveId =
        state.activeSessionId === sessionId ? remaining[0].id : state.activeSessionId;

      persistSessions(remaining, nextActiveId);
      return {
        sessions: remaining,
        activeSessionId: nextActiveId,
      };
    });
  },

  renameSession: (sessionId: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    set((state) => {
      const updated = state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title: trimmed, updatedAt: Date.now() } : s
      );
      persistSessions(updated, state.activeSessionId);
      return { sessions: updated };
    });
  },

  addMessageToActiveSession: (message: ChatMessage) => {
    set((state) => {
      const { sessions, activeSessionId } = state;
      const updated = sessions.map((s) => {
        if (s.id !== activeSessionId) return s;

        // Auto-title from the first user message if still default 'New Chat'
        let title = s.title;
        if (
          s.title === 'New Chat' &&
          message.role === 'user' &&
          s.messages.filter((m) => m.role === 'user').length === 0
        ) {
          title = generateSessionTitle(message.content);
        }

        const nextMessages = [...s.messages, message];
        const lastFilters = message.filters && message.filters.length > 0 ? message.filters : s.lastFilters;
        const lastScope = message.scope ? message.scope : s.lastScope;

        return {
          ...s,
          title,
          updatedAt: Date.now(),
          messages: nextMessages,
          lastFilters,
          lastScope,
        };
      });

      persistSessions(updated, activeSessionId);
      return { sessions: updated };
    });
  },

  updateMessageInActiveSession: (messageId: string, patch: Partial<ChatMessage>) => {
    set((state) => {
      const { sessions, activeSessionId } = state;
      const updated = sessions.map((s) => {
        if (s.id !== activeSessionId) return s;
        const nextMessages = s.messages.map((m) =>
          m.id === messageId ? { ...m, ...patch } : m
        );
        return {
          ...s,
          updatedAt: Date.now(),
          messages: nextMessages,
        };
      });

      persistSessions(updated, activeSessionId);
      return { sessions: updated };
    });
  },

  setSessionFilters: (sessionId: string, filters: Filter[], scope?: 'all' | 'images' | 'videos') => {
    set((state) => {
      const updated = state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, lastFilters: filters, lastScope: scope ?? s.lastScope, updatedAt: Date.now() }
          : s
      );
      persistSessions(updated, state.activeSessionId);
      return { sessions: updated };
    });
  },

  resetAllSessions: () => {
    const demo = { ...INITIAL_SESSION, id: `session-${Date.now()}` };
    persistSessions([demo], demo.id);
    set({
      sessions: [demo],
      activeSessionId: demo.id,
      isHistoryOpen: false,
    });
  },
}));
