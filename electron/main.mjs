import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { existsSync } from "node:fs";
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
import { ensureRuntimeSetup, isRuntimeReady } from "./setupService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLASK_ORIGIN = getFlaskOrigin();
const APP_ICON = path.join(__dirname, "../renderer/assets/app-icon.png");
const IS_SILENT_SETUP = process.argv.includes("--setup-silent");

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

function sendDesktopEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop-event", payload);
}

function sendToSplash(payload) {
  if (!mainWindow || showingApp) return;
  if (!splashReady) {
    pendingSplashEvents.push(payload);
    return;
  }
  sendDesktopEvent(payload);
}

function guardNavigation(win) {
  const allowed = (url) =>
    url.startsWith(FLASK_ORIGIN) ||
    url.startsWith("https://a.espncdn.com") ||
    url.startsWith("https://flagcdn.com");

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (allowed(url)) {
      return { action: "allow" };
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:") || allowed(url)) {
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
      width: 580,
      height: 760,
      minWidth: 480,
      minHeight: 560,
      resizable: true,
      minimizable: true,
      maximizable: true,
      frame: false,
      autoHideMenuBar: true,
      title: "World Cup 2026 Lab",
      backgroundColor: "#e8f4ff",
      ...(existsSync(APP_ICON) ? { icon: APP_ICON } : {}),
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.on("maximize", () => {
      mainWindow?.webContents.send("window-maximized-changed", true);
    });
    mainWindow.on("unmaximize", () => {
      mainWindow?.webContents.send("window-maximized-changed", false);
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
  mainWindow.setTitle("World Cup 2026 Lab");
  mainWindow.setBackgroundColor("#eef7ff");
  mainWindow.loadURL(getFlaskUrl("/loading"));
}

function scheduleBackgroundUpload() {
  setTimeout(() => {
    startBackgroundUpload(sendDesktopEvent, { scanPc: true }).catch((err) => {
      console.error("[upload] Background sync failed:", err);
    });
  }, 8_000);
}

async function runSilentInstallSetup() {
  validateNbaSetup();
  await ensureRuntimeSetup(app, () => {});
}

async function prepareRuntimeSilently() {
  if (!app.isPackaged || isRuntimeReady(app)) {
    return;
  }
  try {
    await ensureRuntimeSetup(app, () => {});
  } catch (err) {
    console.error("[setup] Silent prepare failed:", err);
  }
}

async function bootstrap() {
  validateNbaSetup();

  if (!isRuntimeReady(app)) {
    sendToSplash({ type: "status", message: "Preparing prediction engine…" });
    await ensureRuntimeSetup(app, (payload) => sendToSplash(payload));
  }

  sendToSplash({ type: "status", message: "Starting World Cup prediction engine…" });
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
  scheduleBackgroundUpload();
}

async function launchApp() {
  Menu.setApplicationMenu(null);
  await prepareRuntimeSilently();
  await createMainWindow();
  bootstrap().catch((err) => {
    console.error("[bootstrap]", err);
    sendToSplash({
      type: "fatal",
      message: err instanceof Error ? err.message : String(err),
    });
  });
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

ipcMain.handle("window-minimize", () => {
  mainWindow?.minimize();
  return { ok: true };
});

ipcMain.handle("window-maximize", () => {
  if (!mainWindow) return { ok: false };
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
  return { ok: true, maximized: mainWindow.isMaximized() };
});

ipcMain.handle("window-close", () => {
  mainWindow?.close();
  return { ok: true };
});

ipcMain.handle("window-is-maximized", () => mainWindow?.isMaximized() ?? false);

const gotLock = IS_SILENT_SETUP ? true : app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  if (!IS_SILENT_SETUP) {
    app.on("second-instance", () => {
      mainWindow?.focus();
    });
  }

  app.whenReady().then(async () => {
    if (IS_SILENT_SETUP) {
      try {
        await runSilentInstallSetup();
        app.exit(0);
      } catch (err) {
        console.error("[setup-silent]", err);
        app.exit(1);
      }
      return;
    }

    await launchApp();
  });

  app.on("window-all-closed", () => {
    stopFlaskServer();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    stopFlaskServer();
  });

  app.on("activate", () => {
    if (IS_SILENT_SETUP) return;
    if (!mainWindow) {
      launchApp();
    } else {
      mainWindow.focus();
    }
  });
}
