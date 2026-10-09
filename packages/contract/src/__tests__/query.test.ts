import { describe, it, expect } from 'vitest';
import { LibrarySearchSchema, FilterSchema } from '../query';

describe('Contract Query Schemas', () => {
  it('validates person filter schema correctly', () => {
    const validPerson = {
      kind: 'person',
      ids: [1, 2],
      match: 'all',
      source: 'user',
    };
    const parsed = FilterSchema.safeParse(validPerson);
    expect(parsed.success).toBe(true);
  });

  it('validates library search defaults and params', () => {
    const search = {
      scope: 'images',
      q: 'wedding dress',
      f: [
        {
          kind: 'label',
          module: 'objects',
          labelId: 'dress',
          source: 'ai',
        },
      ],
      sort: 'relevance',
      view: 'highlight',
    };
    const parsed = LibrarySearchSchema.safeParse(search);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scope).toBe('images');
      expect(parsed.data.view).toBe('highlight');
    }
  });
});
