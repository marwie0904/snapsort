import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { registerMediaProtocol } from './mediaProtocol';
import { MockSnapsortApi } from '@snapsort/mock';
import type { ShelfItem } from '@snapsort/contract';

// Register custom protocol scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'snapsort-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);

// Only enforce single-instance lock in packaged production builds
if (app.isPackaged) {
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

// Disable hardware acceleration to resolve dual-GPU / Optimus laptop invisible window bugs
app.disableHardwareAcceleration();

// Silence GPU cache lock warning on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('no-sandbox');

let mainWindow: BrowserWindow | null = null;
let shelfWindow: BrowserWindow | null = null;
let shelfItems: ShelfItem[] = [];
let isShelfPinned = true;
const mockApi = new MockSnapsortApi();

function broadcastShelfSync(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shelf:sync', shelfItems);
  }
  if (shelfWindow && !shelfWindow.isDestroyed()) {
    shelfWindow.webContents.send('shelf:sync', shelfItems);
  }
}

function openShelfWindow(): void {
  console.log('[main] openShelfWindow invoked');
  if (shelfWindow && !shelfWindow.isDestroyed()) {
    console.log('[main] focusing existing shelfWindow');
    if (shelfWindow.isMinimized()) shelfWindow.restore();
    shelfWindow.show();
    shelfWindow.focus();
    return;
  }

  const isMac = process.platform === 'darwin';
  const buildIcon = join(__dirname, '../../build/icon.png');
  const rootIcon = join(__dirname, '../../../../assets/icon.png');
  const iconPath = existsSync(buildIcon) ? buildIcon : rootIcon;

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 420,
    height: 580,
    minWidth: 300,
    minHeight: 340,
    title: 'Shelf — snapsort',
    icon: iconPath,
    show: true,
    alwaysOnTop: isShelfPinned,
    backgroundColor: '#0F0F0F',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 12, y: 14 };
  }

  shelfWindow = new BrowserWindow(windowOptions);

  shelfWindow.webContents.on('did-finish-load', () => {
    console.log('[main] Shelf window finished loading');
  });

  shelfWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] Shelf window failed to load:', errorCode, errorDescription);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    const targetUrl = `${process.env.ELECTRON_RENDERER_URL}?view=shelf#shelf`;
    console.log('[main] Loading shelf URL:', targetUrl);
    shelfWindow.loadURL(targetUrl);
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html');
    console.log('[main] Loading shelf file:', htmlPath);
    shelfWindow.loadFile(htmlPath, { query: { view: 'shelf' }, hash: 'shelf' });
  }

  shelfWindow.show();
  shelfWindow.focus();

  shelfWindow.on('closed', () => {
    shelfWindow = null;
    // Session only: clear items when shelf window is closed
    shelfItems = [];
    broadcastShelfSync();
  });
}

// Register media protocol and create window
app.whenReady().then(() => {
  console.log('[main] app.whenReady fired');
  try {
    registerMediaProtocol();
    console.log('[main] media protocol registered');
  } catch (err) {
    console.error('[main] registerMediaProtocol error:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((err) => {
  console.error('[main] app.whenReady rejected:', err);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function createWindow(): void {
  const isMac = process.platform === 'darwin';

  const buildIcon = join(__dirname, '../../build/icon.png');
  const rootIcon = join(__dirname, '../../../../assets/icon.png');
  const iconPath = existsSync(buildIcon) ? buildIcon : rootIcon;

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1380,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'snapsort',
    icon: iconPath,
    show: true,
    backgroundColor: '#0F0F0F',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset';
    windowOptions.trafficLightPosition = { x: 16, y: 18 };
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[renderer console] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[main] Renderer finished loading');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[main] Renderer failed to load:', errorCode, errorDescription);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    console.log('[main] Loading renderer URL:', process.env.ELECTRON_RENDERER_URL);
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html');
    console.log('[main] Loading file:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.show();
  mainWindow.focus();
}

// IPC Handlers wiring SnapsortApi
ipcMain.handle('api:query', async (_event, req) => {
  return await mockApi.query(req);
});

ipcMain.handle('api:getMedia', async (_event, id) => {
  return await mockApi.getMedia(id);
});

ipcMain.handle('api:getDetections', async (_event, id, ts) => {
  return await mockApi.getDetections(id, ts);
});

ipcMain.handle('api:getCounts', async () => {
  return await mockApi.getCounts();
});

ipcMain.handle('api:getLabelManifest', async () => {
  return await mockApi.getLabelManifest();
});

ipcMain.handle('api:listPlaces', async () => {
  return await mockApi.listPlaces();
});

ipcMain.handle('api:listScenes', async () => {
  return await mockApi.listScenes();
});

ipcMain.handle('api:listPeople', async () => {
  return await mockApi.listPeople();
});

ipcMain.handle('api:renamePerson', async (_event, id, name) => {
  return await mockApi.renamePerson(id, name);
});

ipcMain.handle('api:listFolders', async () => {
  return await mockApi.listFolders();
});

ipcMain.handle('api:pickAndAddFolder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Media Folder to Index',
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  return await mockApi.pickAndAddFolder();
});

ipcMain.handle('api:rescanFolder', async (_event, id) => {
  return await mockApi.rescanFolder(id);
});

ipcMain.handle('api:revealInFinder', async (_event, id) => {
  const folders = await mockApi.listFolders();
  const folder = folders.find((f) => f.id === id);
  if (folder) {
    shell.showItemInFolder(folder.path);
  }
});

ipcMain.handle('api:stageQueryImage', async (_event, input) => {
  return await mockApi.stageQueryImage(input);
});

// AI Chat streaming over IPC
ipcMain.handle('api:chat:start', async (event, req) => {
  const channel = `chat-stream-${Date.now()}`;
  const cancel = mockApi.chat(req, (streamEvent) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send(channel, streamEvent);
    }
  });

  // Store cancel listener
  ipcMain.once(`chat:cancel:${channel}`, () => {
    cancel();
  });

  return { streamChannel: channel };
});

// Shelf IPC Handlers
ipcMain.handle('shelf:open', () => {
  openShelfWindow();
});

ipcMain.handle('shelf:close', () => {
  if (shelfWindow && !shelfWindow.isDestroyed()) {
    shelfWindow.close();
  }
});

ipcMain.handle('shelf:togglePin', (_event, pinned?: boolean) => {
  isShelfPinned = pinned !== undefined ? pinned : !isShelfPinned;
  if (shelfWindow && !shelfWindow.isDestroyed()) {
    shelfWindow.setAlwaysOnTop(isShelfPinned);
  }
  return isShelfPinned;
});

ipcMain.handle('shelf:isPinned', () => {
  return isShelfPinned;
});

ipcMain.handle('shelf:getItems', () => {
  return shelfItems;
});

ipcMain.handle('shelf:add', (_event, items: ShelfItem | ShelfItem[]) => {
  const list = Array.isArray(items) ? items : [items];
  for (const item of list) {
    if (!shelfItems.some((e) => e.id === item.id)) {
      shelfItems.push(item);
    }
  }
  broadcastShelfSync();
  return shelfItems;
});

ipcMain.handle('shelf:remove', (_event, id: number) => {
  shelfItems = shelfItems.filter((e) => e.id !== id);
  broadcastShelfSync();
  return shelfItems;
});

ipcMain.handle('shelf:clear', () => {
  shelfItems = [];
  broadcastShelfSync();
});

ipcMain.handle('shelf:startDrag', (event, filePaths: string[]) => {
  if (!filePaths || filePaths.length === 0) return;

  const tempDir = join(app.getPath('temp'), 'snapsort_shelf');
  if (!existsSync(tempDir)) {
    try {
      mkdirSync(tempDir, { recursive: true });
    } catch {}
  }

  const resolvedPaths: string[] = filePaths.map((p) => {
    if (existsSync(p)) return p;
    // If path is virtual/mock (e.g. /media/CER_0412.mp4), create a real temporary placeholder file so external drag works
    const baseName = p.split(/[\\/]/).pop() || 'media.mp4';
    const tempFile = join(tempDir, baseName);
    if (!existsSync(tempFile)) {
      try {
        writeFileSync(tempFile, Buffer.from(`Snapsort Media: ${baseName}`));
      } catch {}
    }
    return tempFile;
  });

  const buildIcon = join(__dirname, '../../build/icon.png');
  const rootIcon = join(__dirname, '../../../../assets/icon.png');
  const iconPath = existsSync(buildIcon) ? buildIcon : rootIcon;

  try {
    (event.sender as any).startDrag({
      file: resolvedPaths[0],
      files: resolvedPaths,
      icon: iconPath,
    });
  } catch (err) {
    console.error('[main] startDrag error:', err);
  }
});
