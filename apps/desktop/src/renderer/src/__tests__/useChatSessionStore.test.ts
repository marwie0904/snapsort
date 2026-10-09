import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useChatSessionStore,
  generateSessionTitle,
  INITIAL_SESSION,
} from '../stores/useChatSessionStore';

describe('useChatSessionStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useChatSessionStore.setState({
      sessions: [INITIAL_SESSION],
      activeSessionId: INITIAL_SESSION.id,
      isHistoryOpen: false,
    });
    vi.restoreAllMocks();
  });

  it('initializes with a blank session', () => {
    const store = useChatSessionStore.getState();
    expect(store.sessions.length).toBeGreaterThanOrEqual(1);
    expect(store.activeSessionId).toBe(INITIAL_SESSION.id);
    expect(store.getActiveSession().title).toBe('New Chat');
  });

  it('correctly generates concise session titles', () => {
    expect(generateSessionTitle('Find bride and groom')).toBe('Find bride and groom');
    expect(
      generateSessionTitle(
        'Group all high resolution photos where people are laughing near sunset with drinks'
      )
    ).toBe('Group all high resolution phot…');
    expect(generateSessionTitle('   ')).toBe('New Chat');
  });

  it('creates a new session and sets it active', () => {
    const store = useChatSessionStore.getState();
    const newSession = store.createSession('Tokyo street photos');

    const state = useChatSessionStore.getState();
    expect(state.sessions.length).toBe(2);
    expect(state.activeSessionId).toBe(newSession.id);
    expect(state.getActiveSession().title).toBe('Tokyo street photos');
    expect(state.getActiveSession().messages.length).toBe(1);
    expect(state.getActiveSession().messages[0].role).toBe('assistant');
  });

  it('switches between sessions and closes history drawer', () => {
    const store = useChatSessionStore.getState();
    const s2 = store.createSession('Second Session');

    useChatSessionStore.getState().setIsHistoryOpen(true);
    expect(useChatSessionStore.getState().isHistoryOpen).toBe(true);

    // Switch back to the initial session
    useChatSessionStore.getState().switchSession(INITIAL_SESSION.id);

    const state = useChatSessionStore.getState();
    expect(state.activeSessionId).toBe(INITIAL_SESSION.id);
    expect(state.getActiveSession().id).toBe(INITIAL_SESSION.id);
    expect(state.isHistoryOpen).toBe(false);
  });

  it('auto-titles new session upon receiving first user message', () => {
    const store = useChatSessionStore.getState();
    const newSession = store.createSession(); // defaults to 'New Chat'
    expect(newSession.title).toBe('New Chat');

    store.addMessageToActiveSession({
      id: 'msg-u1',
      role: 'user',
      content: 'Show all wedding cakes with candles',
      createdAt: new Date().toISOString(),
    });

    const active = useChatSessionStore.getState().getActiveSession();
    expect(active.title).toBe('Show all wedding cakes with ca…');
    expect(active.messages.length).toBe(2);
  });

  it('renames an existing session', () => {
    const store = useChatSessionStore.getState();
    store.renameSession(INITIAL_SESSION.id, 'Wedding Highlights 2026');

    const active = store.getActiveSession();
    expect(active.title).toBe('Wedding Highlights 2026');
  });

  it('deletes a session and updates active session if needed', () => {
    const store = useChatSessionStore.getState();
    const second = store.createSession('Second Session');

    expect(useChatSessionStore.getState().activeSessionId).toBe(second.id);

    // Delete active session
    store.deleteSession(second.id);

    const state = useChatSessionStore.getState();
    expect(state.sessions.length).toBe(1);
    expect(state.activeSessionId).toBe(INITIAL_SESSION.id);
  });

  it('creates fallback session when all sessions are deleted', () => {
    const store = useChatSessionStore.getState();
    store.deleteSession(INITIAL_SESSION.id);

    const state = useChatSessionStore.getState();
    expect(state.sessions.length).toBe(1);
    expect(state.sessions[0].title).toBe('New Chat');
    expect(state.activeSessionId).toBe(state.sessions[0].id);
  });

  it('updates messages in active session', () => {
    const store = useChatSessionStore.getState();
    store.updateMessageInActiveSession('welcome-initial', {
      quickActionTitle: 'Bride Only Action',
      isSaved: true,
    });

    const active = store.getActiveSession();
    const msg = active.messages.find((m) => m.id === 'welcome-initial');
    expect(msg?.quickActionTitle).toBe('Bride Only Action');
    expect(msg?.isSaved).toBe(true);
  });
});
