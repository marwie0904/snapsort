/** A run of 1 fps samples. It covers `start` to `end + 1` seconds. */
export interface TimeRange {
  start: number;
  end: number;
}

/** Merges 1 fps timestamps (seconds) into ranges: samples at most 1 s apart join one range. */
export function toRanges(timestamps: number[] = []): TimeRange[] {
  const out: TimeRange[] = [];
  for (const ts of [...timestamps].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && ts - last.end <= 1) last.end = ts;
    else out.push({ start: ts, end: ts });
  }
  return out;
}

export function inRange(r: TimeRange, ts: number): boolean {
  return ts >= r.start && ts < r.end + 1;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** "0:00–0:10", or "0:05" for a one-second range. */
export function formatRange(r: TimeRange): string {
  return r.start === r.end ? formatTime(r.start) : `${formatTime(r.start)}–${formatTime(r.end)}`;
}
