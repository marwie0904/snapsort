import { contextBridge, ipcRenderer } from 'electron';
import type {
  BackendEvent,
  ChatStreamCallback,
  SnapsortApi,
} from '@snapsort/contract';

/** Main returns errors as {__error: {code, message}}; rethrow them with their code. */
async function invoke(channel: string, ...args: unknown[]): Promise<any> {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (r && typeof r === 'object' && '__error' in r) {
    throw Object.assign(new Error(r.__error.message), { code: r.__error.code });
  }
  return r;
}

const api: SnapsortApi = {
  query: (req) => invoke('api:query', req),
  getMedia: (id) => invoke('api:getMedia', id),
  getDetections: (id, ts) => invoke('api:getDetections', id, ts),
  getCounts: () => invoke('api:getCounts'),
  getLabelManifest: () => invoke('api:getLabelManifest'),
  listPlaces: () => invoke('api:listPlaces'),
  listScenes: () => invoke('api:listScenes'),
  listPeople: () => invoke('api:listPeople'),
  renamePerson: (id, name) => invoke('api:renamePerson', id, name),
  mergePeople: (ids) => invoke('api:mergePeople', ids),
  suggestMerges: () => invoke('api:suggestMerges'),
  listLibraries: () => invoke('api:listLibraries'),
  listFolders: () => invoke('api:listFolders'),
  pickAndAddFolder: () => invoke('api:pickAndAddFolder'),
  rescanFolder: (id) => invoke('api:rescanFolder', id),
  getIngestJobs: () => invoke('api:getIngestJobs'),
  cancelIngest: (jobId) => invoke('api:cancelIngest', jobId),
  ejectDrive: (libraryId) => invoke('api:ejectDrive', libraryId),
  revealInFinder: (id) => invoke('api:revealInFinder', id),
  openMedia: (id) => invoke('api:openMedia', id),
  stageQueryImage: (input) => invoke('api:stageQueryImage', input),
  onBackendEvent: (callback) => {
    const handler = (_event: unknown, e: BackendEvent) => callback(e);
    ipcRenderer.on('backend:event', handler);
    return () => {
      ipcRenderer.removeListener('backend:event', handler);
    };
  },

  chat: (req, onEvent: ChatStreamCallback) => {
    let cancelFn: () => void = () => {};

    ipcRenderer
      .invoke('api:chat:start', req)
      .then(({ streamChannel }) => {
        const handler = (_event: unknown, streamEvent: Parameters<ChatStreamCallback>[0]) => {
          onEvent(streamEvent);
          if (streamEvent.type === 'done' || streamEvent.type === 'error') {
            ipcRenderer.removeListener(streamChannel, handler);
          }
        };

        ipcRenderer.on(streamChannel, handler);

        cancelFn = () => {
          ipcRenderer.send(`chat:cancel:${streamChannel}`);
          ipcRenderer.removeListener(streamChannel, handler);
        };
      })
      .catch((err) => {
        onEvent({ type: 'error', error: String(err) });
      });

    return () => cancelFn();
  },

  listThreads: async () => [],
  createThread: async (title) => ({
    id: 1,
    title: title || 'New Chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  getThread: async (id) => ({
    id,
    title: 'Chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  }),

  // Shelf
  openShelfWindow: () => ipcRenderer.invoke('shelf:open'),
  closeShelfWindow: () => ipcRenderer.invoke('shelf:close'),
  toggleShelfPin: (pinned) => ipcRenderer.invoke('shelf:togglePin', pinned),
  isShelfPinned: () => ipcRenderer.invoke('shelf:isPinned'),
  getShelfItems: () => ipcRenderer.invoke('shelf:getItems'),
  addToShelf: (items) => ipcRenderer.invoke('shelf:add', items),
  removeFromShelf: (id) => ipcRenderer.invoke('shelf:remove', id),
  clearShelf: () => ipcRenderer.invoke('shelf:clear'),
  startNativeDrag: (filePaths) => ipcRenderer.invoke('shelf:startDrag', filePaths),
  onShelfSync: (callback) => {
    const handler = (_event: unknown, items: any) => callback(items);
    ipcRenderer.on('shelf:sync', handler);
    return () => {
      ipcRenderer.removeListener('shelf:sync', handler);
    };
  },
};

contextBridge.exposeInMainWorld('snapsort', api);
