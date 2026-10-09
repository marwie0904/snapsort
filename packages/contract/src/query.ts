import { z } from 'zod';

export const SourceSchema = z.enum(['user', 'ai']);
export type Source = z.infer<typeof SourceSchema>;

export const PersonFilterSchema = z.object({
  kind: z.literal('person'),
  ids: z.array(z.number().int()),
  match: z.enum(['all', 'any']),
  source: SourceSchema,
});
export type PersonFilter = z.infer<typeof PersonFilterSchema>;

export const LabelFilterSchema = z.object({
  kind: z.literal('label'),
  module: z.string(),
  labelId: z.string(),
  source: SourceSchema,
});
export type LabelFilter = z.infer<typeof LabelFilterSchema>;

export const PlaceFilterSchema = z.object({
  kind: z.literal('place'),
  name: z.string(),
  source: SourceSchema,
});
export type PlaceFilter = z.infer<typeof PlaceFilterSchema>;

export const MediaKindFilterSchema = z.object({
  kind: z.literal('mediaKind'),
  value: z.enum(['image', 'video']),
  source: SourceSchema,
});
export type MediaKindFilter = z.infer<typeof MediaKindFilterSchema>;

export const FolderFilterSchema = z.object({
  kind: z.literal('folder'),
  id: z.number().int(),
  source: SourceSchema,
});
export type FolderFilter = z.infer<typeof FolderFilterSchema>;

export const FilterSchema = z.discriminatedUnion('kind', [
  PersonFilterSchema,
  LabelFilterSchema,
  PlaceFilterSchema,
  MediaKindFilterSchema,
  FolderFilterSchema,
]);
export type Filter = z.infer<typeof FilterSchema>;

export const SimilarToSchema = z.union([
  z.object({
    mediaId: z.number().int(),
    ts: z.number().optional(),
    source: SourceSchema,
  }),
  z.object({
    imageRef: z.string(),
    source: SourceSchema,
  }),
]);
export type SimilarTo = z.infer<typeof SimilarToSchema>;

export const LibrarySearchSchema = z.object({
  scope: z.enum(['all', 'images', 'videos']).default('all'),
  q: z.string().optional(),
  similarTo: SimilarToSchema.optional(),
  f: z.array(FilterSchema).default([]),
  sort: z.enum(['relevance', 'similarity', 'name', 'newest', 'oldest']).default('newest'),
  view: z.enum(['filter', 'highlight']).default('filter'),
  media: z.number().int().optional(),
  t: z.number().optional(),
});
export type LibrarySearch = z.infer<typeof LibrarySearchSchema>;

export const QueryPatchSchema = z.object({
  q: z.string().nullable().optional(),
  similarTo: SimilarToSchema.nullable().optional(),
  filters: z
    .object({
      add: z.array(FilterSchema).optional(),
      removeIndices: z.array(z.number().int()).optional(),
      clear: z.boolean().optional(),
    })
    .optional(),
});
export type QueryPatch = z.infer<typeof QueryPatchSchema>;
