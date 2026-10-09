import {
  Folder,
  MediaDetail,
  MediaSummary,
  Person,
  PlaceSummary,
  SidebarCounts,
  LabelManifest,
} from '@snapsort/contract';

export const mockPeople: Person[] = [
  { id: 1, name: 'Groom', count: 58 },
  { id: 2, name: 'Bride', count: 64 },
  { id: 3, name: 'Anna', count: 24 },
  { id: 4, name: 'David', count: 18 },
  { id: 5, name: 'Sophia', count: 12 },
  { id: 6, name: null, count: 9 }, // Unnamed cluster
];

export const mockPlaces: PlaceSummary[] = [
  { name: 'Ceremony Garden', lat: 40.785091, lon: -73.968285, count: 110 },
  { name: 'Grand Ballroom', lat: 40.758896, lon: -73.98513, count: 95 },
  { name: 'Sunset Pier', lat: 40.753596, lon: -74.00891, count: 32 },
  { name: 'Vineyard Hill', lat: 40.812345, lon: -73.94567, count: 11 },
];

export const mockLocalFolders: Folder[] = [
  { id: 1, name: 'Ceremony', path: '/Users/mac/Media/Wedding/Ceremony', isExternal: false },
  { id: 2, name: 'Reception', path: '/Users/mac/Media/Wedding/Reception', isExternal: false },
  { id: 3, name: 'Drone', path: '/Users/mac/Media/Wedding/Drone', isExternal: false },
];

export const mockExternalDrive = {
  id: 'sandisk-1tb',
  name: 'SanDisk Extreme SSD',
  type: 'USB 3.2 External',
  capacity: '1 TB',
  used: '482 GB',
  free: '518 GB',
  usedPercent: 48,
  folders: [
    { id: 4, name: 'DCIM/100CANON', path: '/Volumes/SanDisk_1TB/DCIM/100CANON', isExternal: true, driveName: 'SanDisk Extreme SSD' },
    { id: 5, name: 'Wedding_Raw', path: '/Volumes/SanDisk_1TB/Wedding_Raw', isExternal: true, driveName: 'SanDisk Extreme SSD' },
    { id: 6, name: 'Drone_4K', path: '/Volumes/SanDisk_1TB/Drone_4K', isExternal: true, driveName: 'SanDisk Extreme SSD' },
  ],
};

export const mockFolders: Folder[] = [
  ...mockLocalFolders,
  ...mockExternalDrive.folders,
];

export const mockLabelManifest: LabelManifest = {
  modules: [
    {
      id: 'objects',
      name: 'Objects',
      labels: [
        { id: 'cake', name: 'Wedding Cake', count: 18 },
        { id: 'dress', name: 'Wedding Dress', count: 42 },
        { id: 'suit', name: 'Suit / Tuxedo', count: 39 },
        { id: 'flowers', name: 'Bouquet & Flowers', count: 28 },
        { id: 'rings', name: 'Rings', count: 12 },
        { id: 'champagne', name: 'Champagne / Glass', count: 22 },
        { id: 'car', name: 'Vintage Car', count: 8 },
      ],
    },
  ],
};

// Seed exact reference items first
const referenceItems: MediaDetail[] = [
  {
    id: 1,
    kind: 'video',
    name: 'CER_0412',
    folderId: 1,
    addedAt: '2026-10-01T14:30:00Z',
    durationS: 25,
    faceCount: 2,
    path: '/media/CER_0412.mp4',
    width: 3840,
    height: 2160,
    place: { name: 'Ceremony Garden', lat: 40.785091, lon: -73.968285 },
    people: [
      { id: 1, name: 'Groom' },
      { id: 2, name: 'Bride' },
    ],
    labels: [
      { module: 'objects', labelId: 'dress' },
      { module: 'objects', labelId: 'suit' },
    ],
    matches: [{ ts: 5, score: 0.94 }],
    bestFrameTs: 5,
  },
  {
    id: 2,
    kind: 'image',
    name: 'IMG_2031.jpg',
    folderId: 1,
    addedAt: '2026-10-01T14:32:00Z',
    faceCount: 2,
    path: '/media/IMG_2031.jpg',
    width: 4032,
    height: 3024,
    place: { name: 'Ceremony Garden', lat: 40.785091, lon: -73.968285 },
    people: [
      { id: 1, name: 'Groom' },
      { id: 2, name: 'Bride' },
    ],
    labels: [
      { module: 'objects', labelId: 'flowers' },
      { module: 'objects', labelId: 'dress' },
    ],
  },
  {
    id: 3,
    kind: 'image',
    name: 'IMG_2049.jpg',
    folderId: 1,
    addedAt: '2026-10-01T14:35:00Z',
    faceCount: 2,
    path: '/media/IMG_2049.jpg',
    width: 4032,
    height: 3024,
    place: { name: 'Ceremony Garden', lat: 40.785091, lon: -73.968285 },
    people: [
      { id: 1, name: 'Groom' },
      { id: 2, name: 'Bride' },
    ],
    labels: [
      { module: 'objects', labelId: 'rings' },
      { module: 'objects', labelId: 'suit' },
    ],
  },
  {
    id: 4,
    kind: 'video',
    name: 'CER_0419',
    folderId: 1,
    addedAt: '2026-10-01T14:40:00Z',
    durationS: 78,
    faceCount: 2,
    path: '/media/CER_0419.mp4',
    width: 3840,
    height: 2160,
    place: { name: 'Ceremony Garden', lat: 40.785091, lon: -73.968285 },
    people: [
      { id: 1, name: 'Groom' },
      { id: 2, name: 'Bride' },
    ],
    labels: [
      { module: 'objects', labelId: 'dress' },
      { module: 'objects', labelId: 'suit' },
    ],
    matches: [
      { ts: 12, score: 0.91 },
      { ts: 45, score: 0.88 },
    ],
    bestFrameTs: 12,
  },
  {
    id: 5,
    kind: 'image',
    name: 'IMG_2102.jpg',
    folderId: 2,
    addedAt: '2026-10-01T17:15:00Z',
    faceCount: 14,
    path: '/media/IMG_2102.jpg',
    width: 4032,
    height: 3024,
    place: { name: 'Grand Ballroom', lat: 40.758896, lon: -73.98513 },
    people: [
      { id: 1, name: 'Groom' },
      { id: 3, name: 'Anna' },
      { id: 4, name: 'David' },
    ],
    labels: [{ module: 'objects', labelId: 'champagne' }],
  },
  {
    id: 6,
    kind: 'video',
    name: 'REC_0033',
    folderId: 2,
    addedAt: '2026-10-01T18:20:00Z',
    durationS: 225,
    faceCount: 40,
    path: '/media/REC_0033.mp4',
    width: 3840,
    height: 2160,
    place: { name: 'Grand Ballroom', lat: 40.758896, lon: -73.98513 },
    people: [{ id: 3, name: 'Anna' }],
    labels: [{ module: 'objects', labelId: 'cake' }],
    matches: [{ ts: 80, score: 0.72 }],
    bestFrameTs: 80,
  },
  {
    id: 7,
    kind: 'image',
    name: 'IMG_2155.jpg',
    folderId: 1,
    addedAt: '2026-10-01T15:10:00Z',
    faceCount: 2,
    path: '/media/IMG_2155.jpg',
    width: 4032,
    height: 3024,
    place: { name: 'Ceremony Garden', lat: 40.785091, lon: -73.968285 },
    people: [
      { id: 1, name: 'Groom' },
      { id: 2, name: 'Bride' },
    ],
    labels: [{ module: 'objects', labelId: 'dress' }],
  },
  {
    id: 8,
    kind: 'image',
    name: 'IMG_2160.jpg',
    folderId: 2,
    addedAt: '2026-10-01T19:00:00Z',
    faceCount: 5,
    path: '/media/IMG_2160.jpg',
    width: 4032,
    height: 3024,
    place: { name: 'Sunset Pier', lat: 40.753596, lon: -74.00891 },
    people: [
      { id: 2, name: 'Bride' },
      { id: 5, name: 'Sophia' },
    ],
    labels: [{ module: 'objects', labelId: 'champagne' }],
  },
];

// Generate synthetic items to hit exact reference count: 248 items = 182 photos/images + 66 clips/videos
export function generateMockMediaItems(): MediaDetail[] {
  const items: MediaDetail[] = [...referenceItems];

  // Currently 5 images, 3 videos in referenceItems. Need 177 more images and 63 more videos.
  for (let i = 9; i <= 248; i++) {
    const isVideo = i <= 71; // 3 + 63 = 66 videos total
    const kind = isVideo ? 'video' : 'image';
    const folderId = (i % mockFolders.length) + 1;
    const folder = mockFolders[folderId - 1];
    const place = mockPlaces[i % mockPlaces.length];

    // Assign people
    const hasGroomAndBride = i % 7 === 0;
    const hasGroom = hasGroomAndBride || i % 4 === 0;
    const hasBride = hasGroomAndBride || i % 5 === 0;
    const people = [];
    if (hasGroom) people.push({ id: 1, name: 'Groom' });
    if (hasBride) people.push({ id: 2, name: 'Bride' });
    if (i % 6 === 0) people.push({ id: 3, name: 'Anna' });

    const faceCount = people.length === 0 ? (i % 2 === 0 ? 0 : 1) : people.length;

    const durationS = isVideo ? 15 + (i % 180) : undefined;
    const matches = isVideo && hasGroomAndBride ? [{ ts: 10, score: 0.9 }] : undefined;

    items.push({
      id: i,
      kind,
      name: isVideo ? `CLIP_${i.toString().padStart(4, '0')}` : `IMG_${(2000 + i).toString()}.jpg`,
      folderId,
      addedAt: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      durationS,
      faceCount,
      path: `${folder.path}/${isVideo ? `CLIP_${i}.mp4` : `IMG_${2000 + i}.jpg`}`,
      width: isVideo ? 1920 : 4032,
      height: isVideo ? 1080 : 3024,
      place,
      people,
      labels: [
        { module: 'objects', labelId: mockLabelManifest.modules[0].labels[i % 7].id },
      ],
      matches,
      bestFrameTs: matches ? matches[0].ts : isVideo ? 1 : undefined,
    });
  }

  return items;
}

export const mockMediaList = generateMockMediaItems();

export const mockCounts: SidebarCounts = {
  all: 248,
  images: 182,
  videos: 66,
  people: 6,
  places: 4,
  objects: 31,
};
