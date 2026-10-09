import { protocol } from 'electron';
import { createReadStream, promises as fs } from 'fs';
import { extname } from 'path';
import { Readable } from 'stream';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

// Streams from disk instead of net.fetch, which breaks seeking in Electron 34 (electron#38749)
export async function serveFile(filePath: string, range: string | null): Promise<Response> {
  let size: number;
  try {
    const st = await fs.stat(filePath);
    if (!st.isFile()) return new Response(null, { status: 404 });
    size = st.size;
  } catch {
    return new Response(null, { status: 404 });
  }

  const headers: Record<string, string> = {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
  };
  const body = (start: number, end: number) =>
    Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream;

  // Single ranges only. Anything else gets the whole file, which RFC 9110 allows.
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    headers['Content-Length'] = String(size);
    return new Response(size ? body(0, size - 1) : null, { status: 200, headers });
  }

  let start: number;
  let end: number;
  if (m[1] === '') {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }

  headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  headers['Content-Length'] = String(end - start + 1);
  return new Response(body(start, end), { status: 206, headers });
}

export function registerMediaProtocol(): void {
  protocol.handle('snapsort-media', async (request) => {
    const url = new URL(request.url);
    const host = url.host; // 'preview', 'frame', 'file'
    const pathname = decodeURIComponent(url.pathname);

    // ponytail: raw absolute paths until Phase 4 switches to library IDs
    if (host === 'file') {
      return serveFile(pathname, request.headers.get('Range'));
    }

    // Generate sleek, high-aesthetic SVG placeholders for previews & frames
    const parts = pathname.split('/').filter(Boolean);
    const id = parts[0] || '1';
    const ts = parts[1] ? ` ${parts[1]}s` : '';

    const svg = `
      <svg width="400" height="250" viewBox="0 0 400 250" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="400" height="250" fill="#202020"/>
        <circle cx="200" cy="115" r="32" fill="#2A2A2A"/>
        <path d="M190 100 L215 115 L190 130 Z" fill="#444444"/>
        <text x="200" y="175" fill="#666666" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle" font-weight="500">
          Media #${id}${ts}
        </text>
      </svg>
    `.trim();

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  });
}
