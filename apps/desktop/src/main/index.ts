import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron';
import { join } from 'path';
import { registerMediaProtocol } from './mediaProtocol';
import { MockSnapsortApi } from '@snapsort/mock';

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
const mockApi = new MockSnapsortApi();

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

  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1380,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'snapsort',
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
