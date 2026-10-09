import { describe, it, expect } from 'vitest';
import { parsePromptToFilters } from '../utils/aiFilterEngine';

describe('aiFilterEngine', () => {
  it('parses flowers and the bride query accurately', () => {
    const result = parsePromptToFilters('sort all images with flowers and the bride being showed');

    // Should detect bride
    const personFilter = result.filters.find((f) => f.kind === 'person');
    expect(personFilter).toBeDefined();
    if (personFilter && personFilter.kind === 'person') {
      expect(personFilter.ids).toContain(2); // Bride ID
    }

    // Should detect flowers
    const labelFilter = result.filters.find((f) => f.kind === 'label');
    expect(labelFilter).toBeDefined();
    if (labelFilter && labelFilter.kind === 'label') {
      expect(labelFilter.labelId).toBe('flowers');
    }

    // Should detect images media kind
    const mediaFilter = result.filters.find((f) => f.kind === 'mediaKind');
    expect(mediaFilter).toBeDefined();
    if (mediaFilter && mediaFilter.kind === 'mediaKind') {
      expect(mediaFilter.value).toBe('image');
    }

    // Suggested title should reflect Bride with Flowers
    expect(result.suggestedTitle).toBe('Bride with Flowers');
    expect(result.summaryDescriptions).toContain('Includes: Bride');
    expect(result.summaryDescriptions).toContain('Object: Bouquet & Flowers');
    expect(result.summaryDescriptions).toContain('Photos only');
  });

  it('parses groom and bride with cake cutting video query', () => {
    const result = parsePromptToFilters('show all clips of groom and bride cutting the cake');

    const personFilter = result.filters.find((f) => f.kind === 'person');
    expect(personFilter).toBeDefined();
    if (personFilter && personFilter.kind === 'person') {
      expect(personFilter.ids).toEqual([2, 1]); // Bride and Groom
    }

    const labelFilter = result.filters.find((f) => f.kind === 'label');
    expect(labelFilter).toBeDefined();
    if (labelFilter && labelFilter.kind === 'label') {
      expect(labelFilter.labelId).toBe('cake');
    }

    const mediaFilter = result.filters.find((f) => f.kind === 'mediaKind');
    expect(mediaFilter).toBeDefined();
    if (mediaFilter && mediaFilter.kind === 'mediaKind') {
      expect(mediaFilter.value).toBe('video');
    }

    expect(result.suggestedTitle).toBe('Bride & Groom with Wedding Cake');
  });

  it('gracefully handles arbitrary query with fallback', () => {
    const result = parsePromptToFilters('sunset on the beach');
    expect(result.suggestedTitle).toBeTruthy();
    expect(result.summaryDescriptions.length).toBeGreaterThan(0);
  });
});
