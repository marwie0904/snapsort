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

  it('returns video media details with timestamps and tags', async () => {
    const video = await api.getMedia(1); // CER_0412
    expect(video.kind).toBe('video');
    expect(video.durationS).toBe(25);
    expect(video.people[0].timestamps).toBeDefined();
    expect(video.people[0].timestamps?.length).toBeGreaterThan(0);
    expect(video.labels[0].timestamps).toBeDefined();
    expect(video.tags).toBeDefined();
    expect(video.tags?.[0].name).toBe('Ceremony Walk');
  });

  it('retrieves timestamp-sensitive detections for video frames', async () => {
    // At ts = 5s in CER_0412
    const detections5s = await api.getDetections(1, 5);
    expect(detections5s.faces.length).toBeGreaterThan(0);
    expect(detections5s.faces[0].name).toBeDefined();
    expect(detections5s.faces[0].box).toBeDefined();
    expect(detections5s.objects.length).toBeGreaterThan(0);
    expect(detections5s.objects[0].name).toBeDefined();
  });

  const matchedFor = async (f: import('@snapsort/contract').Filter[]) =>
    (
      await api.query({
        search: { scope: 'all', f, sort: 'newest', view: 'filter' },
        limit: 1,
      })
    ).matched;

  it('lists scenes aggregated from media tags, sorted by count', async () => {
    const scenes = await api.listScenes();
    expect(scenes.length).toBeGreaterThan(0);
    expect(scenes.some((s) => s.id === 'vows' && s.name === 'Vow Exchange')).toBe(true);
    for (let i = 1; i < scenes.length; i++) {
      expect(scenes[i - 1].count).toBeGreaterThanOrEqual(scenes[i].count);
    }
    const counts = await api.getCounts();
    expect(counts.scenes).toBe(scenes.length);
  });

  it('filters by scene with any/all semantics', async () => {
    const scenes = await api.listScenes();
    const a = scenes[0];
    const b = scenes[1];
    const onlyA = await matchedFor([{ kind: 'scene', ids: [a.id], match: 'any', source: 'user' }]);
    expect(onlyA).toBe(a.count);
    const anyAB = await matchedFor([{ kind: 'scene', ids: [a.id, b.id], match: 'any', source: 'user' }]);
    const allAB = await matchedFor([{ kind: 'scene', ids: [a.id, b.id], match: 'all', source: 'user' }]);
    expect(anyAB).toBeGreaterThanOrEqual(onlyA);
    expect(allAB).toBeLessThanOrEqual(onlyA);
  });

  it('filters by multiple tags (labelIds) with any/all, and keeps legacy labelId working', async () => {
    const legacy = await matchedFor([{ kind: 'label', module: 'objects', labelId: 'dress', source: 'user' }]);
    const single = await matchedFor([
      { kind: 'label', module: 'objects', labelIds: ['dress'], match: 'all', source: 'user' },
    ]);
    expect(single).toBe(legacy);
    expect(single).toBeGreaterThan(0);

    const any = await matchedFor([
      { kind: 'label', module: 'objects', labelIds: ['dress', 'cake'], match: 'any', source: 'user' },
    ]);
    const all = await matchedFor([
      { kind: 'label', module: 'objects', labelIds: ['dress', 'suit'], match: 'all', source: 'user' },
    ]);
    expect(any).toBeGreaterThan(single);
    expect(all).toBeLessThanOrEqual(single);
    expect(all).toBeGreaterThan(0); // reference video CER_0412 has both dress + suit
  });
});

