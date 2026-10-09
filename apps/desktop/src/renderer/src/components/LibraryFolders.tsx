import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  FolderOpen,
  HardDrive,
  Usb,
  ChevronRight,
  ChevronDown,
  Laptop,
  RefreshCw,
  ExternalLink,
  X,
} from 'lucide-react';
import type { FolderNode, IngestJob, Library, SnapsortApi } from '@snapsort/contract';
import { MockSnapsortApi } from '@snapsort/mock';
import { Button } from '@snapsort/ui';
import { useUiStore } from '../stores/useUiStore';

const api: SnapsortApi = (typeof window !== 'undefined' && window.snapsort) || new MockSnapsortApi();

const EjectIcon: React.FC<{ size?: number; className?: string }> = ({ size = 12, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="12 3 4 15 20 15 12 3" />
    <rect x="4" y="19" width="16" height="2" rx="1" />
  </svg>
);

function formatBytes(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(0)} GB`;
  return `${(n / 1e6).toFixed(0)} MB`;
}

function jobText(job: IngestJob): string {
  if (job.state === 'queued') return 'Queued';
  if (job.state === 'cancelled') return 'Cancelled';
  if (job.state === 'failed') return job.error?.message ?? 'Failed';
  if (job.state === 'done') return job.error ? `Done · ${job.error.message}` : `Done · ${job.total.toLocaleString()} files`;
  if (job.phase === 'grouping') return 'Grouping faces…';
  if (job.phase === 'starting') return job.total ? `Loading models… · ${job.total.toLocaleString()} files` : 'Starting…';
  return `${job.done.toLocaleString()} / ${job.total.toLocaleString()} files`;
}

const FolderRow: React.FC<{ node: FolderNode; library: Library; depth: number }> = ({ node, library, depth }) => {
  const { selectedFolderId, selectFolder } = useUiStore();
  const [open, setOpen] = useState(depth === 0);
  const isSelected = selectedFolderId === node.id;
  const hasChildren = node.children.length > 0;
  const run = (fn: () => Promise<unknown>) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn().catch((err) => console.error(err));
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => selectFolder(node.id, node.name, library.name)}
        onKeyDown={(e) => e.key === 'Enter' && selectFolder(node.id, node.name, library.name)}
        title={node.path}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={`group w-full flex items-center justify-between pr-2 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
          isSelected
            ? 'bg-[var(--surface-2)] text-[var(--text)] font-bold'
            : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)]/50'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
            className={`p-0.5 shrink-0 ${hasChildren ? '' : 'invisible'}`}
            aria-label={open ? 'Collapse folder' : 'Expand folder'}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {isSelected ? (
            <FolderOpen size={13} className="text-[var(--accent)] shrink-0" />
          ) : (
            <Folder size={13} className="text-[var(--text-muted)] shrink-0" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {depth === 0 && (
            <button
              type="button"
              title="Rescan: add new files, forget deleted ones"
              onClick={run(() => api.rescanFolder(node.id))}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-[var(--text)]"
            >
              <RefreshCw size={11} />
            </button>
          )}
          <button
            type="button"
            title="Show in Finder"
            onClick={run(() => api.revealInFinder(node.id))}
            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:text-[var(--text)]"
          >
            <ExternalLink size={11} />
          </button>
          <span className="tabular-nums font-normal text-[10px]">{node.count}</span>
        </div>
      </div>
      {open && node.children.map((c) => <FolderRow key={c.id} node={c} library={library} depth={depth + 1} />)}
    </div>
  );
};

const DriveCard: React.FC<{ library: Library; onEjected: (msg: string) => void }> = ({ library, onEjected }) => {
  const [expanded, setExpanded] = useState(true);
  const { selectedFolderId, clearSelectedFolder, closeMediaDetail } = useUiStore();
  const queryClient = useQueryClient();
  const used = library.totalBytes - library.freeBytes;
  const usedPercent = library.totalBytes ? Math.round((used / library.totalBytes) * 100) : 0;

  const eject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // Let go of anything playing from the drive first, or macOS refuses the eject
    closeMediaDetail();
    if (selectedFolderId !== null) clearSelectedFolder();
    try {
      await api.ejectDrive(library.id);
      onEjected(`Ejected ${library.name}`);
    } catch (err) {
      onEjected((err as Error).message);
    }
    queryClient.invalidateQueries();
  };

  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="p-3 cursor-pointer hover:bg-[var(--surface-3)]/50 transition-colors flex items-center justify-between"
      >
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive size={15} className="text-[var(--accent)] shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-bold text-[var(--text)] truncate">{library.name}</div>
            <div className="text-[10px] text-[var(--text-muted)] truncate">
              External · {formatBytes(library.totalBytes)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          <button
            type="button"
            onClick={eject}
            title="Eject drive"
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-3)] transition-colors"
          >
            <EjectIcon size={12} />
          </button>
          <span className="p-0.5 text-[var(--text-muted)]">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>
      </div>
      <div className="px-3 pb-2.5 pt-0.5">
        <div className="w-full bg-[var(--surface-3)] h-1.5 rounded-full overflow-hidden">
          <div className="bg-[var(--accent)] h-full rounded-full transition-all" style={{ width: `${usedPercent}%` }} />
        </div>
        <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)] mt-1.5">
          <span>{formatBytes(used)} used</span>
          <span>{formatBytes(library.freeBytes)} free</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-[var(--border)] bg-[var(--surface-1)] py-1">
          {library.folders.map((n) => (
            <FolderRow key={n.id} node={n} library={library} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
};

/** The Folders tab: processing jobs, folders on this Mac, and connected drives. */
export const LibraryFolders: React.FC<{ onAddFolder?: () => void }> = ({ onAddFolder }) => {
  const [feedback, setFeedback] = useState<string | null>(null);
  const { data: libraries = [], error } = useQuery({ queryKey: ['libraries'], queryFn: () => api.listLibraries() });
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: () => api.getIngestJobs() });
  const local = libraries.filter((l) => !l.isExternal);
  const drives = libraries.filter((l) => l.isExternal);
  const shownJobs = jobs.filter((j) => j.state === 'queued' || j.state === 'running').concat(
    jobs.filter((j) => j.state !== 'queued' && j.state !== 'running').slice(-3)
  );

  const notify = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="space-y-5 pt-1">
      <Button variant="accent" size="lg" fullWidth onClick={onAddFolder} className="font-bold text-sm h-10 shadow-sm">
        + Add folder
      </Button>

      {feedback && (
        <div className="bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--accent)] text-xs px-3 py-2 rounded-lg font-medium">
          {feedback}
        </div>
      )}
      {error && (
        <div className="text-xs text-[var(--text-muted)] px-1">Backend unavailable: {(error as Error).message}</div>
      )}

      {shownJobs.length > 0 && (
        <div className="space-y-1.5">
          {shownJobs.map((job) => {
            const active = job.state === 'queued' || job.state === 'running';
            const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
            return (
              <div key={job.id} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text)] truncate" title={job.folderPath}>
                    {job.folderPath.split('/').pop() || job.folderPath}
                  </span>
                  {active && (
                    <button
                      type="button"
                      title="Cancel"
                      onClick={() => api.cancelIngest(job.id)}
                      className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div
                  className={`text-[10px] mt-0.5 truncate ${job.state === 'failed' ? 'text-red-500' : 'text-[var(--text-muted)]'}`}
                  title={jobText(job)}
                >
                  {job.libraryName} · {jobText(job)}
                </div>
                {job.state === 'running' && job.phase === 'files' && (
                  <div className="w-full bg-[var(--surface-3)] h-1 rounded-full overflow-hidden mt-1.5">
                    <div className="bg-[var(--accent)] h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
          <div className="flex items-center gap-1.5">
            <Laptop size={12} className="text-[var(--text-muted)]" />
            <span>On this device</span>
          </div>
          <span className="text-[10px] text-[var(--text-dim)] font-normal">
            {local.reduce((n, l) => n + l.folders.length, 0)} folders
          </span>
        </div>
        <div className="space-y-0.5">
          {local.flatMap((l) => l.folders.map((n) => <FolderRow key={n.id} node={n} library={l} depth={0} />))}
          {local.length === 0 && (
            <p className="text-[11px] text-[var(--text-dim)] px-1">No folders added from this Mac yet.</p>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-[var(--text-muted)] uppercase mb-2">
          <div className="flex items-center gap-1.5">
            <Usb size={12} className="text-[var(--accent)]" />
            <span>External Drives</span>
          </div>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${
              drives.length
                ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30'
                : 'bg-[var(--surface-2)] text-[var(--text-dim)]'
            }`}
          >
            {drives.length} active
          </span>
        </div>
        <div className="space-y-2">
          {drives.map((l) => (
            <DriveCard key={l.id} library={l} onEjected={notify} />
          ))}
          {drives.length === 0 && (
            <div className="p-3 rounded-xl border border-dashed border-[var(--border)] text-center">
              <p className="text-xs text-[var(--text-muted)]">
                No drives with snapsort folders. Add a folder from a drive to start one.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
