import React, { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MockSnapsortApi } from '@snapsort/mock';
import { useUiStore } from '../stores/useUiStore';

const mockApiFallback = new MockSnapsortApi();

function getApi() {
  if (typeof window !== 'undefined' && window.snapsort) {
    return window.snapsort;
  }
  return mockApiFallback;
}

export const PlacesView: React.FC = () => {
  const api = useMemo(() => getApi(), []);
  const { data: places = [], isLoading } = useQuery({
    queryKey: ['places'],
    queryFn: () => api.listPlaces(),
  });

  const mapEl = useRef<HTMLDivElement>(null);

  // Replace any existing place filter, keep the rest, then show the library.
  const openPlace = (name: string) => {
    const { filters, setFilters, navigateToLibrary } = useUiStore.getState();
    setFilters([
      ...filters.filter((f) => f.kind !== 'place'),
      { kind: 'place', name, source: 'user' },
    ]);
    navigateToLibrary();
  };

  useEffect(() => {
    if (!mapEl.current || places.length === 0) return;
    const map = L.map(mapEl.current);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#FFC400';
    const maxCount = Math.max(...places.map((p) => p.count), 1);
    places.forEach((p) => {
      L.circleMarker([p.lat, p.lon], {
        radius: 7 + 9 * Math.sqrt(p.count / maxCount),
        color: accent,
        fillColor: accent,
        fillOpacity: 0.55,
        weight: 2,
      })
        .bindTooltip(`${p.name} · ${p.count} ${p.count === 1 ? 'file' : 'files'}`)
        .on('click', () => openPlace(p.name))
        .addTo(map);
    });
    map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lon] as [number, number])), {
      padding: [40, 40],
      maxZoom: 14,
    });

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(mapEl.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, [places]);

  const sorted = useMemo(() => [...places].sort((a, b) => b.count - a.count), [places]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-8 pb-6 gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] flex items-center gap-2.5">
          <MapPin size={22} className="text-[var(--accent)]" />
          Places
        </h1>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          {places.length} {places.length === 1 ? 'place' : 'places'}. Click a marker to filter the library.
        </p>
      </div>

      {isLoading ? null : places.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
          No GPS locations yet. Photos and videos with location data will appear here.
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0">
          <div
            ref={mapEl}
            className="flex-1 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]"
          />
          <ul className="w-64 shrink-0 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-1.5 space-y-0.5">
            {sorted.map((p) => (
              <li key={p.name}>
                <button
                  type="button"
                  onClick={() => openPlace(p.name)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50 transition-colors text-left"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="tabular-nums font-normal shrink-0">{p.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
