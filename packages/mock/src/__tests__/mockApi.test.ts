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
});

