const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  notifySplashReady: () => ipcRenderer.send("splash-ready"),
  openNbaApp: () => ipcRenderer.invoke("open-nba-app"),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("desktop-event", listener);
    return () => ipcRenderer.removeListener("desktop-event", listener);
  },
});
