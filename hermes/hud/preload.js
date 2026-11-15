// Gives the /hud page one call: grow the window when the pill expands, shrink when it collapses.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tribunalHud", {
  setExpanded: (expanded) => ipcRenderer.send("hud:expanded", Boolean(expanded)),
});
