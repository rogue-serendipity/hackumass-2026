// Always-on-top Tribunal pill, top-center of the screen. It shows the frontend's /hud page
// (frontend/app/hud/page.tsx), which asks for more room when a block expands the pill.
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");

const URL = process.env.TRIBUNAL_HUD_URL || "http://localhost:3000/hud";
const WIDTH = 576;
const COLLAPSED = 64;
const EXPANDED = 520;

let win;

function place(height) {
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: workArea.y + 6,
    width: WIDTH,
    height,
  });
}

function create() {
  win = new BrowserWindow({
    width: WIDTH,
    height: COLLAPSED,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  place(COLLAPSED);

  const load = () => win.loadURL(URL).catch(() => setTimeout(load, 2000)); // retry until the frontend is up
  load();
  win.webContents.on("did-fail-load", () => setTimeout(load, 2000));
}

ipcMain.on("hud:expanded", (_e, expanded) => {
  if (win) place(expanded ? EXPANDED : COLLAPSED);
});

// Dev aid: TRIBUNAL_HUD_CAPTURE=<dir> saves a PNG of the window every 2 s (no screen-recording permission needed).
if (process.env.TRIBUNAL_HUD_CAPTURE) {
  const fs = require("fs");
  let n = 0;
  setInterval(async () => {
    if (!win) return;
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(process.env.TRIBUNAL_HUD_CAPTURE, `hud-${String(++n).padStart(2, "0")}.png`), img.toPNG());
  }, 2000);
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock.hide();
  create();
});
app.on("window-all-closed", () => app.quit());
