import { app } from 'electron';
import { spawn, type ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { resolve } from 'path';

/** The Python backend command (dev mode: run from the repo with uv). Override with SNAPSORT_CMD. */
export function snapsortCommand(): string[] {
  return (process.env.SNAPSORT_CMD || 'uv run snapsort').split(' ').filter(Boolean);
}

/** The repo root, where `uv run` finds the Python project. app.getAppPath() is apps/desktop in dev. */
export function repoRoot(): string {
  return resolve(app.getAppPath(), '../..');
}

export class BackendError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/** `snapsort serve` over stdio JSON lines. Starts on first call and restarts after a crash. */
export class Sidecar {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private crashes: number[] = [];
  private stopping = false;

  private start(): ChildProcess {
    const [cmd, ...args] = snapsortCommand();
    console.log(`[sidecar] starting: ${cmd} ${args.join(' ')} serve (cwd ${repoRoot()})`);
    const proc = spawn(cmd, [...args, 'serve'], {
      cwd: repoRoot(),
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    this.proc = proc;
    proc.stdin!.on('error', () => {}); // a dead process reports through 'exit'
    createInterface({ input: proc.stdout! }).on('line', (line) => {
      let msg: { id?: number; result?: unknown; error?: { code: string; message: string } };
      try {
        msg = JSON.parse(line);
      } catch {
        console.log('[sidecar]', line);
        return;
      }
      const p = this.pending.get(msg.id ?? -1);
      if (!p) return;
      this.pending.delete(msg.id!);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new BackendError(msg.error.code, msg.error.message));
      else p.resolve(msg.result);
    });
    const down = (why: string) => {
      if (this.proc !== proc) return;
      this.proc = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new BackendError('SIDECAR_DOWN', why));
      }
      this.pending.clear();
      const now = Date.now();
      this.crashes = [...this.crashes.filter((t) => now - t < 60_000), now];
      // ponytail: fixed 1 s restart, at most 5 a minute; after that the next call restarts it
      if (!this.stopping && this.crashes.length <= 5) setTimeout(() => this.proc || this.start(), 1000);
    };
    proc.on('error', (err) => down(`can't start the backend (${cmd}): ${err.message}`));
    proc.on('exit', (code, signal) => down(`the backend stopped (${signal ?? code}). see the terminal`));
    return proc;
  }

  call<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<T> {
    const proc = this.proc ?? this.start();
    const id = this.nextId++;
    return new Promise<T>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BackendError('SIDECAR_TIMEOUT', `${method} took too long`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise as (v: unknown) => void, reject, timer });
      proc.stdin!.write(JSON.stringify({ id, method, params }) + '\n');
    });
  }

  stop(): void {
    this.stopping = true;
    this.proc?.kill();
  }
}
