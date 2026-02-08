const { contextBridge, shell, ipcRenderer } = require("electron");

// Receive config from main through additionalArguments for sandboxed preload.
let appConfig = { clientId: "", clientSecret: "", apiKey: "" };
try {
  const arg = process.argv.find((a) => a.startsWith("{"));
  if (arg) {
    const parsed = JSON.parse(arg);
    appConfig = parsed.appConfig || appConfig;
  }
} catch (_) {
  // Fallback to empty config
}

contextBridge.exposeInMainWorld("appBridge", {
  openExternal: (url) => shell.openExternal(url),
  config: appConfig,
  getToken: () => ipcRenderer.invoke("token:get"),
  setToken: (token) => ipcRenderer.invoke("token:set", token),
  clearToken: () => ipcRenderer.invoke("token:clear"),
  exportPlaylist: (data) => ipcRenderer.invoke("playlist:export", data),
  importPlaylist: () => ipcRenderer.invoke("playlist:import"),
});
