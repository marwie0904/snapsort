import { describe, it, expect } from 'vitest';
import { MockSnapsortApi } from '../mockApi';

describe('MockSnapsortApi', () => {
  const api = new MockSnapsortApi();

  it('returns initial sidebar counts matching 248 items', async () => {
    const counts = await api.getCounts();
    expect(counts.all).toBe(248);
    expect(counts.images).toBe(182);
    expect(counts.videos).toBe(66);
    expect(counts.people).toBe(6);
  });

  it('queries items with groom + bride filter in highlight mode', async () => {
    const res = await api.query({
      search: {
        scope: 'all',
        f: [{ kind: 'person', ids: [1, 2], match: 'all', source: 'ai' }],
        sort: 'newest',
        view: 'highlight',
      },
      limit: 10,
    });

    expect(res.total).toBe(248);
    expect(res.items.length).toBe(10);
    // In highlight mode, matches sort first
    expect(res.items[0].score).toBe(1);
  });

  it('streams chat events for wedding inquiry', async () => {
    const events: string[] = [];

    await new Promise<void>((resolve) => {
      api.chat(
        {
          threadId: 1,
          text: 'Group all images where the groom and bride are visible, no other audience',
          current: { scope: 'all', f: [], sort: 'newest', view: 'filter' },
        },
        (event) => {
          events.push(event.type);
          if (event.type === 'done') {
            resolve();
          }
        }
      );
    });

    expect(events).toContain('step');
    expect(events).toContain('patch');
    expect(events).toContain('token');
    expect(events).toContain('suggestions');
    expect(events).toContain('done');
  });
});
