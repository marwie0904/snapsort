import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import type { BackendEvent, IngestJob } from '@snapsort/contract';
import { repoRoot, snapsortCommand } from './sidecar';

interface Queued {
  job: IngestJob;
  dataDir: string;
  prune: boolean;
}

/** One `snapsort ingest --json` child at a time. Each runs in its own process group, so cancel
 * and quit also stop its ffmpeg. */
export class IngestQueue {
  jobs: IngestJob[] = [];
  private queue: Queued[] = [];
  private running: { job: IngestJob; proc: ChildProcess; cancelled: boolean } | null = null;
  private nextId = 1;

  constructor(private emit: (e: BackendEvent) => void) {}

  add(folderPath: string, dataDir: string, libraryName: string, prune = false): IngestJob {
    const job: IngestJob = { id: this.nextId++, folderPath, libraryName, state: 'queued', done: 0, total: 0 };
    this.jobs.push(job);
    this.queue.push({ job, dataDir, prune });
    this.update(job);
    this.next();
    return job;
  }

  /** Whether a queued or running job reads a folder on this drive. */
  busy(root: string): boolean {
    return this.jobs.some(
      (j) =>
        (j.state === 'queued' || j.state === 'running') &&
        (j.folderPath === root || j.folderPath.startsWith(root + '/'))
    );
  }

  cancel(jobId: number): void {
    const queued = this.queue.findIndex((q) => q.job.id === jobId);
    if (queued >= 0) {
      const [{ job }] = this.queue.splice(queued, 1);
      job.state = 'cancelled';
      this.update(job);
    } else if (this.running?.job.id === jobId) {
      this.running.cancelled = true;
      this.kill(this.running.proc);
    }
  }

  stopAll(): void {
    this.queue = [];
    if (this.running) this.kill(this.running.proc);
  }

  private kill(proc: ChildProcess): void {
    const group = -proc.pid!;
    try {
      process.kill(group, 'SIGTERM');
    } catch {
      return;
    }
    setTimeout(() => {
      try {
        process.kill(group, 'SIGKILL');
      } catch {
        /* already gone */
      }
    }, 3000).unref();
  }

  private update(job: IngestJob): void {
    this.emit({ type: 'ingest', job: { ...job } });
  }

  private next(): void {
    if (this.running || this.queue.length === 0) return;
    const { job, dataDir, prune } = this.queue.shift()!;
    const [cmd, ...args] = snapsortCommand();
    const argv = [...args, 'ingest', job.folderPath, '--data-dir', dataDir, '--json', ...(prune ? ['--prune'] : [])];
    console.log(`[ingest] ${cmd} ${argv.join(' ')}`);
    const proc = spawn(cmd, argv, {
      cwd: repoRoot(),
      detached: true,
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    const run = { job, proc, cancelled: false };
    this.running = run;
    job.state = 'running';
    job.phase = 'starting';
    this.update(job);

    let ended = false;
    createInterface({ input: proc.stdout! }).on('line', (line) => {
      let e: { event: string; total?: number; done?: number; ok?: boolean; code?: string; message?: string };
      try {
        e = JSON.parse(line);
      } catch {
        return;
      }
      if (e.event === 'start') {
        job.total = e.total ?? 0;
      } else if (e.event === 'file') {
        job.phase = 'files';
        job.done = e.done ?? job.done;
        job.total = e.total ?? job.total;
      } else if (e.event === 'grouping') {
        job.phase = 'grouping';
      } else if (e.event === 'end') {
        ended = true;
        if (e.code) {
          job.state = 'failed';
          job.error = { code: e.code, message: e.message ?? e.code };
        } else {
          job.state = 'done';
          if (!e.ok) job.error = { code: 'SOME_FILES_FAILED', message: 'some files could not be processed' };
        }
      }
      this.update(job);
    });
    const finish = (why?: string) => {
      if (this.running !== run) return;
      this.running = null;
      if (run.cancelled) {
        job.state = 'cancelled';
      } else if (!ended) {
        job.state = 'failed';
        job.error = { code: 'CRASHED', message: why ?? 'processing stopped unexpectedly. see the terminal' };
      }
      this.update(job);
      this.emit({ type: 'libraries' });
      this.next();
    };
    proc.on('error', (err) => finish(`can't start ${cmd}: ${err.message}`));
    proc.on('exit', () => finish());
  }
}
