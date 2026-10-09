import { contextBridge, ipcRenderer } from 'electron';
import type {
  ChatStreamCallback,
  LibrarySearch,
  SnapsortApi,
} from '@snapsort/contract';

const api: SnapsortApi = {
  query: (req) => ipcRenderer.invoke('api:query', req),
  getMedia: (id) => ipcRenderer.invoke('api:getMedia', id),
  getDetections: (id, ts) => ipcRenderer.invoke('api:getDetections', id, ts),
  getCounts: () => ipcRenderer.invoke('api:getCounts'),
  getLabelManifest: () => ipcRenderer.invoke('api:getLabelManifest'),
  listPlaces: () => ipcRenderer.invoke('api:listPlaces'),
  listScenes: () => ipcRenderer.invoke('api:listScenes'),
  listPeople: () => ipcRenderer.invoke('api:listPeople'),
  renamePerson: (id, name) => ipcRenderer.invoke('api:renamePerson', id, name),
  listFolders: () => ipcRenderer.invoke('api:listFolders'),
  pickAndAddFolder: () => ipcRenderer.invoke('api:pickAndAddFolder'),
  rescanFolder: (id) => ipcRenderer.invoke('api:rescanFolder', id),
  revealInFinder: (id) => ipcRenderer.invoke('api:revealInFinder', id),
  stageQueryImage: (input) => ipcRenderer.invoke('api:stageQueryImage', input),

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
