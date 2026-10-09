import type { Filter } from '@snapsort/contract';

export interface ParsedAiFilterResult {
  filters: Filter[];
  scope: 'all' | 'images' | 'videos';
  suggestedTitle: string;
  summaryDescriptions: string[];
  suggestions: string[];
}

interface PersonEntity {
  id: number;
  name: string;
  patterns: RegExp[];
}

interface LabelEntity {
  id: string;
  name: string;
  patterns: RegExp[];
}

const KNOWN_PEOPLE: PersonEntity[] = [
  { id: 2, name: 'Bride', patterns: [/\bbride\b/i, /\bthe bride\b/i] },
  { id: 1, name: 'Groom', patterns: [/\bgroom\b/i, /\bthe groom\b/i] },
  { id: 3, name: 'Anna', patterns: [/\banna\b/i] },
  { id: 4, name: 'David', patterns: [/\bdavid\b/i] },
  { id: 5, name: 'Sophia', patterns: [/\bsophia\b/i] },
];

const KNOWN_LABELS: LabelEntity[] = [
  { id: 'flowers', name: 'Bouquet & Flowers', patterns: [/\bflower(s)?\b/i, /\bbouquet(s)?\b/i, /\bfloral\b/i] },
  { id: 'cake', name: 'Wedding Cake', patterns: [/\bcake(s)?\b/i, /\bcake cutting\b/i] },
  { id: 'dress', name: 'Wedding Dress', patterns: [/\bdress(es)?\b/i, /\bgown(s)?\b/i] },
  { id: 'suit', name: 'Suit / Tuxedo', patterns: [/\bsuit(s)?\b/i, /\btuxedo(s)?\b/i, /\btux\b/i] },
  { id: 'rings', name: 'Rings', patterns: [/\bring(s)?\b/i, /\bwedding ring\b/i] },
  { id: 'champagne', name: 'Champagne / Glass', patterns: [/\bchampagne\b/i, /\bwine\b/i, /\btoast\b/i, /\bdrinks?\b/i] },
  { id: 'car', name: 'Vintage Car', patterns: [/\bcar(s)?\b/i, /\bvintage car\b/i, /\bautomobile\b/i] },
];

export function parsePromptToFilters(rawPrompt: string): ParsedAiFilterResult {
  const prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();

  const filters: Filter[] = [];
  const summaryDescriptions: string[] = [];
  const matchedPersonIds: number[] = [];
  const matchedPersonNames: string[] = [];
  const matchedLabels: { id: string; name: string }[] = [];

  // 1. Detect media kind scope
  let scope: 'all' | 'images' | 'videos' = 'all';
  const hasImages = /\b(image|images|photo|photos|picture|pictures|pic|pics)\b/i.test(lower);
  const hasVideos = /\b(video|videos|clip|clips|footage|movie)\b/i.test(lower);

  if (hasImages && !hasVideos) {
    scope = 'images';
    filters.push({ kind: 'mediaKind', value: 'image', source: 'ai' });
    summaryDescriptions.push('Photos only');
  } else if (hasVideos && !hasImages) {
    scope = 'videos';
    filters.push({ kind: 'mediaKind', value: 'video', source: 'ai' });
    summaryDescriptions.push('Videos only');
  }

  // 2. Detect People
  for (const person of KNOWN_PEOPLE) {
    if (person.patterns.some((p) => p.test(lower))) {
      matchedPersonIds.push(person.id);
      matchedPersonNames.push(person.name);
    }
  }

  if (matchedPersonIds.length > 0) {
    filters.push({
      kind: 'person',
      ids: matchedPersonIds,
      match: 'all',
      source: 'ai',
    });
    summaryDescriptions.push(`Includes: ${matchedPersonNames.join(', ')}`);
  }

  // 3. Detect Labels / Objects
  for (const label of KNOWN_LABELS) {
    if (label.patterns.some((p) => p.test(lower))) {
      matchedLabels.push({ id: label.id, name: label.name });
      filters.push({
        kind: 'label',
        module: 'objects',
        labelId: label.id,
        source: 'ai',
      });
      summaryDescriptions.push(`Object: ${label.name}`);
    }
  }

  // 4. Detect Places
  if (/ceremony\s*garden/i.test(lower)) {
    filters.push({ kind: 'place', name: 'Ceremony Garden', source: 'ai' });
    summaryDescriptions.push('Place: Ceremony Garden');
  } else if (/grand\s*ballroom/i.test(lower) || /ballroom/i.test(lower)) {
    filters.push({ kind: 'place', name: 'Grand Ballroom', source: 'ai' });
    summaryDescriptions.push('Place: Grand Ballroom');
  } else if (/sunset\s*pier/i.test(lower) || /pier/i.test(lower)) {
    filters.push({ kind: 'place', name: 'Sunset Pier', source: 'ai' });
    summaryDescriptions.push('Place: Sunset Pier');
  } else if (/vineyard/i.test(lower)) {
    filters.push({ kind: 'place', name: 'Vineyard Hill', source: 'ai' });
    summaryDescriptions.push('Place: Vineyard Hill');
  }

  // Fallback if no specific structured entity found
  if (filters.length === 0) {
    // Generate a label filter or fallback person filter
    summaryDescriptions.push(`Search: "${prompt}"`);
  }

  // 5. Generate smart title
  let suggestedTitle = '';
  if (matchedPersonNames.length > 0 && matchedLabels.length > 0) {
    suggestedTitle = `${matchedPersonNames.join(' & ')} with ${matchedLabels[0].id === 'flowers' ? 'Flowers' : matchedLabels[0].name}`;
  } else if (matchedPersonNames.length > 0) {
    suggestedTitle = matchedPersonNames.join(' & ');
    if (scope === 'images') suggestedTitle += ' Photos';
    if (scope === 'videos') suggestedTitle += ' Clips';
  } else if (matchedLabels.length > 0) {
    suggestedTitle = matchedLabels.map((l) => l.name).join(' & ');
  } else {
    // Capitalize first letters of prompt or short snippet
    const words = prompt.split(/\s+/).slice(0, 3);
    suggestedTitle = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  if (!suggestedTitle) {
    suggestedTitle = 'Custom AI Filter';
  }

  // 6. Generate contextual suggestions
  const suggestions: string[] = [];
  if (scope !== 'videos') {
    suggestions.push('Only video');
  } else {
    suggestions.push('Photos only');
  }

  if (!matchedLabels.some((l) => l.id === 'cake')) {
    suggestions.push('Add cake cutting');
  }
  if (!matchedLabels.some((l) => l.id === 'flowers')) {
    suggestions.push('Add bouquet');
  }
  if (!matchedPersonNames.includes('Groom') && matchedPersonNames.includes('Bride')) {
    suggestions.push('Add Groom');
  }

  return {
    filters,
    scope,
    suggestedTitle,
    summaryDescriptions,
    suggestions: suggestions.slice(0, 2),
  };
}
