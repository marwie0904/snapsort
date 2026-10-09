import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile } from 'child_process';
import { readdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { MockSnapsortApi } from '@snapsort/mock';
import type { BackendEvent, FolderNode, Library } from '@snapsort/contract';
import { BackendError, Sidecar } from './sidecar';
import { IngestQueue } from './ingest';
import type { MediaResolver } from './mediaProtocol';

const SHIFT = 2 ** 32; // global id = library key * 2**32 + local id (see snapsort/serve.py)
type Lib = Library & { key: number; dataDir: string };

function broadcast(e: BackendEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('backend:event', e);
  }
}

/** ipcMain.handle drops an error's code, so errors come back as {__error} and the preload rethrows them. */
function handle(channel: string, fn: (...args: any[]) => unknown): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      const e = err as BackendError;
      console.error(`[${channel}]`, e.message);
      return { __error: { code: e.code ?? 'INTERNAL', message: e.message } };
    }
  });
}

function findFolder(nodes: FolderNode[], id: number): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findFolder(n.children, id);
    if (hit) return hit;
  }
  return null;
}

/** Registers every api:* IPC handler. Returns the media resolver for the real backend, none for the mock. */
export function registerBackend(getWindow: () => BrowserWindow | null): MediaResolver | undefined {
  if (process.env.SNAPSORT_BACKEND === 'mock') {
    registerMock(getWindow);
    return undefined;
  }

  const sidecar = new Sidecar();
  const call = <T = unknown>(method: string, params?: Record<string, unknown>) => sidecar.call<T>(method, params);
  let libs: Lib[] = [];
  const refresh = async () => (libs = await call<Lib[]>('listLibraries'));
  const emit = (e: BackendEvent) => {
    if (e.type === 'libraries') refresh().catch(() => {});
    broadcast(e);
  };
  const ingest = new IngestQueue(emit);

  // Drives come and go: watch /Volumes. A poll also catches a mount that isn't readable yet on the first event.
  let volumes: string | null = null;
  setInterval(() => {
    let now = '';
    try {
      now = readdirSync('/Volumes').join('|');
    } catch {
      /* no /Volumes */
    }
    if (volumes !== null && now !== volumes) emit({ type: 'libraries' });
    volumes = now;
  }, 2000).unref();
  app.on('before-quit', () => {
    ingest.stopAll();
    sidecar.stop();
  });

  const folderPath = async (id: number): Promise<string> => {
    for (const lib of libs.length ? libs : await refresh()) {
      const node = findFolder(lib.folders, id);
      if (node) return node.path;
    }
    throw new BackendError('NOT_FOUND', 'folder not found. is its drive connected?');
  };
  const enqueue = async (path: string, prune: boolean) => {
    const lib = await call<{ dataDir: string; root: string }>('libraryFor', { path });
    const name = lib.root === '/' ? 'This Mac' : basename(lib.root);
    return { jobId: ingest.add(path, lib.dataDir, name, prune).id };
  };

  handle('api:query', (req) => call('query', req));
  handle('api:getMedia', (id) => call('getMedia', { id }));
  handle('api:getDetections', (id, ts) => call('getDetections', { id, ts }));
  handle('api:getCounts', () => call('getCounts'));
  handle('api:getLabelManifest', () => call('getLabelManifest'));
  handle('api:listPlaces', () => call('listPlaces'));
  handle('api:listScenes', () => []); // no scenes module in the backend
  handle('api:listPeople', () => call('listPeople'));
  handle('api:renamePerson', (id, name) => call('renamePerson', { id, name }));
  handle('api:listLibraries', refresh);
  handle('api:listFolders', async () =>
    (await refresh()).flatMap((l) =>
      l.folders.map((f) => ({ id: f.id, name: f.name, path: f.path, isExternal: l.isExternal, driveName: l.name }))
    )
  );
  handle('api:pickAndAddFolder', async () => {
    const win = getWindow();
    const options = { properties: ['openDirectory' as const], title: 'Add a folder to snapsort' };
    const r = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (r.canceled || r.filePaths.length === 0) return null;
    return enqueue(r.filePaths[0], false);
  });
  handle('api:rescanFolder', async (id) => enqueue(await folderPath(id), true));
  handle('api:getIngestJobs', () => ingest.jobs);
  handle('api:cancelIngest', (jobId) => ingest.cancel(jobId));
  handle('api:ejectDrive', async (libraryId) => {
    const lib = libs.find((l) => l.id === libraryId);
    if (!lib?.isExternal) throw new BackendError('NOT_FOUND', 'drive not found');
    if (ingest.busy(lib.root)) {
      throw new BackendError('BUSY', 'this drive is being processed. cancel that first');
    }
    await new Promise<void>((resolve, reject) =>
      execFile('diskutil', ['eject', lib.root], (err, _out, stderr) =>
        err ? reject(new BackendError('EJECT_FAILED', (stderr || err.message).trim())) : resolve()
      )
    );
    emit({ type: 'libraries' });
  });
  handle('api:revealInFinder', async (id) => {
    const err = await shell.openPath(await folderPath(id));
    if (err) throw new BackendError('NOT_FOUND', err);
  });
  handle('api:openMedia', async (id) => {
    const err = await shell.openPath(await call<string>('resolveMedia', { id, kind: 'file' }));
    if (err) throw new BackendError('NOT_FOUND', err);
  });
  handle('api:stageQueryImage', (input: { path: string } | { bytes: ArrayBuffer; mime: string }) => {
    if ('path' in input) return { imageRef: input.path };
    const ext = (input.mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = join(app.getPath('temp'), `snapsort-query-${Date.now()}.${ext}`);
    writeFileSync(path, Buffer.from(input.bytes));
    return { imageRef: path };
  });
  ipcMain.handle('api:chat:start', (event) => {
    const channel = `chat-stream-${Date.now()}`;
    setTimeout(() => event.sender.send(channel, { type: 'error', error: 'The AI assistant is not available yet.' }), 0);
    return { streamChannel: channel };
  });

  refresh().catch((err) => console.error('[sidecar]', err.message)); // start it now, not on the first click

  return async (kind, id, ts) => {
    if (kind === 'preview' || kind === 'frame') {
      const key = Math.floor(id / SHIFT);
      const lib = libs.find((l) => l.key === key) ?? (await refresh()).find((l) => l.key === key);
      if (!lib) return null;
      const idx = kind === 'frame' ? Math.round(ts ?? 0) : 0; // 1 fps: frame idx = second
      return join(lib.dataDir, 'previews.noindex', String(id % SHIFT), `${String(idx).padStart(6, '0')}.jpg`);
    }
    return call<string>('resolveMedia', { id, kind });
  };
}

function registerMock(getWindow: () => BrowserWindow | null): void {
  const mock = new MockSnapsortApi();
  const methods = [
    'query', 'getMedia', 'getDetections', 'getCounts', 'getLabelManifest', 'listPlaces', 'listScenes',
    'listPeople', 'renamePerson', 'listLibraries', 'listFolders', 'rescanFolder', 'getIngestJobs',
    'cancelIngest', 'ejectDrive', 'revealInFinder', 'openMedia', 'stageQueryImage',
  ] as const;
  for (const m of methods) {
    handle(`api:${m}`, (...args) => (mock[m] as (...a: unknown[]) => unknown).apply(mock, args));
  }
  handle('api:pickAndAddFolder', async () => {
    const win = getWindow();
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : mock.pickAndAddFolder();
  });
  ipcMain.handle('api:chat:start', async (event, req) => {
    const channel = `chat-stream-${Date.now()}`;
    const cancel = mock.chat(req, (e) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, e);
    });
    ipcMain.once(`chat:cancel:${channel}`, () => cancel());
    return { streamChannel: channel };
  });
}
