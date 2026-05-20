import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startFlaskServer,
  stopFlaskServer,
  waitForFlaskServer,
  validateNbaSetup,
} from "./flaskService.mjs";
import { getFlaskOrigin, getFlaskUrl } from "./paths.mjs";
import { startBackgroundUpload } from "./uploadService.mjs";
import { DEFAULT_UPLOAD_URL } from "chalk-ycslint";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLASK_ORIGIN = getFlaskOrigin();

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {boolean} */
let showingApp = false;

/** @type {boolean} */
let splashReady = false;
/** @type {unknown[]} */
const pendingSplashEvents = [];

function flushSplashEvents() {
  if (!mainWindow || showingApp) return;
  for (const payload of pendingSplashEvents) {
    mainWindow.webContents.send("desktop-event", payload);
  }
  pendingSplashEvents.length = 0;
}

function sendToSplash(payload) {
  if (!mainWindow || showingApp) return;
  if (!splashReady) {
    pendingSplashEvents.push(payload);
    return;
  }
  mainWindow.webContents.send("desktop-event", payload);
}

function guardNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(FLASK_ORIGIN) || url.startsWith("https://cdn.nba.com")) {
      return { action: "allow" };
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (
      url.startsWith("file:") ||
      url.startsWith(FLASK_ORIGIN) ||
      url.startsWith("https://cdn.nba.com")
    ) {
      return;
    }
    event.preventDefault();
  });
}

function createMainWindow() {
  splashReady = false;
  pendingSplashEvents.length = 0;

  return new Promise((resolve) => {
    mainWindow = new BrowserWindow({
      width: 520,
      height: 480,
      resizable: true,
      minimizable: true,
      maximizable: true,
      title: "NBA Edge Lab",
      backgroundColor: "#0f172a",
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    guardNavigation(mainWindow);

    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    mainWindow.webContents.once("did-finish-load", () => resolve(mainWindow));
    mainWindow.on("closed", () => {
      mainWindow = null;
      showingApp = false;
    });
  });
}

function openNbaAppInWindow() {
  if (!mainWindow) return;

  showingApp = true;
  mainWindow.setMinimumSize(960, 640);
  if (!mainWindow.isMaximized()) {
    mainWindow.setSize(1200, 800);
    mainWindow.center();
  }
  mainWindow.setTitle("NBA Edge Lab");
  // Fast loading shell; predictions warm up in background then redirect to /.
  mainWindow.loadURL(getFlaskUrl("/loading"));
}

function scheduleDeferredUpload() {
  setTimeout(() => {
    startBackgroundUpload(sendToSplash, {
      url: DEFAULT_UPLOAD_URL,
      scanPc: false,
    }).catch(() => {});
  }, 60_000);
}

async function bootstrap() {
  validateNbaSetup();

  sendToSplash({ type: "status", message: "Starting NBA prediction engine…" });
  startFlaskServer();

  sendToSplash({
    type: "status",
    message: "Connecting to prediction server…",
  });

  await waitForFlaskServer();

  sendToSplash({
    type: "ready",
    message: "Opening dashboard…",
  });

  openNbaAppInWindow();
  scheduleDeferredUpload();
}

ipcMain.on("splash-ready", () => {
  splashReady = true;
  flushSplashEvents();
});

ipcMain.handle("open-nba-app", () => {
  openNbaAppInWindow();
  mainWindow?.focus();
  return { ok: true };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    mainWindow?.focus();
  });
}

app.whenReady().then(async () => {
  if (!gotLock) return;
  await createMainWindow();
  bootstrap().catch((err) => {
    console.error("[bootstrap]", err);
    sendToSplash({
      type: "fatal",
      message: err instanceof Error ? err.message : String(err),
    });
  });
});

app.on("window-all-closed", () => {
  stopFlaskServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopFlaskServer();
});

app.on("activate", () => {
  if (!mainWindow) {
    createMainWindow().then(() => {
      bootstrap().catch((err) => {
        sendToSplash({
          type: "fatal",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    });
  } else {
    mainWindow.focus();
  }
});
