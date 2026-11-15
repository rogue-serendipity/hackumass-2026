// The /hud page's only links to Electron: say when the block card opens or closes, and report
// the short status shown beside the menu bar icon.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tribunalHud", {
  setExpanded: (expanded) => ipcRenderer.send("hud:expanded", Boolean(expanded)),
  setStatus: (status) =>
    ipcRenderer.send("hud:status", {
      title: String(status?.title ?? ""),
      tone: String(status?.tone ?? ""),
      text: String(status?.text ?? ""),
    }),
});
