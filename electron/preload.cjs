const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  notifySplashReady: () => ipcRenderer.send("splash-ready"),
  openNbaApp: () => ipcRenderer.invoke("open-nba-app"),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop-event", listener);
    return () => ipcRenderer.removeListener("desktop-event", listener);
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke("window-minimize"),
    maximize: () => ipcRenderer.invoke("window-maximize"),
    close: () => ipcRenderer.invoke("window-close"),
    isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
    onMaximizeChanged: (callback) => {
      const listener = (_event, maximized) => callback(maximized);
      ipcRenderer.on("window-maximized-changed", listener);
      return () => ipcRenderer.removeListener("window-maximized-changed", listener);
    },
  },
});
