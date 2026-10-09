import { protocol, net } from 'electron';
import { pathToFileURL } from 'url';

export function registerMediaProtocol(): void {
  protocol.handle('snapsort-media', async (request) => {
    const url = new URL(request.url);
    const host = url.host; // 'preview', 'frame', 'file'
    const pathname = decodeURIComponent(url.pathname);

    // If host is 'file' and it's a real local path
    if (host === 'file') {
      const filePath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
      try {
        return await net.fetch(pathToFileURL(filePath).toString());
      } catch (e) {
        // Fallback to placeholder if file doesn't exist
      }
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
