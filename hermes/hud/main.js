// The Tribunal indicator for Hermes, as an Electron app showing the frontend's /hud page
// (frontend/app/hud/page.tsx). Two modes:
//
//   menubar (default on macOS)  A menu bar item ("Tribunal ✓ 3", "Blocked") right of the notch.
//                               On a block, the block card drops down under it. Click it to see
//                               recent checks.
//   pill (TRIBUNAL_HUD_MODE=pill)  An always-on-top pill at the top center of the screen that
//                               expands on a block.
const { app, BrowserWindow, ipcMain, nativeImage, screen, Tray } = require("electron");
const path = require("path");

const MODE = process.env.TRIBUNAL_HUD_MODE || (process.platform === "darwin" ? "menubar" : "pill");
const BASE_URL = process.env.TRIBUNAL_HUD_URL || "http://localhost:3000/hud";
const WIDTH = 576;
const COLLAPSED = 64;
const EXPANDED = 520;
const DROPDOWN_HEIGHT = 470;

let win;
let tray;
let blockShowing = false; // a block or leak card is up: keep the dropdown open until dismissed

function pageUrl() {
  if (MODE !== "menubar") return BASE_URL;
  const u = new URL(BASE_URL);
  u.searchParams.set("menubar", "1");
  return u.toString();
}

// ---- pill mode -------------------------------------------------------------------------

function placePill(height) {
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: workArea.y + 6,
    width: WIDTH,
    height,
  });
}

// ---- menu bar mode ---------------------------------------------------------------------

function placeDropdown() {
  const t = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: t.x, y: t.y });
  const { workArea } = display;
  let x = Math.round(t.x + t.width / 2 - WIDTH / 2);
  x = Math.max(workArea.x + 4, Math.min(x, workArea.x + workArea.width - WIDTH - 4));
  win.setBounds({ x, y: workArea.y + 2, width: WIDTH, height: DROPDOWN_HEIGHT });
}

function showDropdown() {
  placeDropdown();
  win.showInactive(); // don't steal focus from Hermes's terminal
}

function toggleDropdown() {
  if (win.isVisible()) {
    win.hide();
  } else {
    placeDropdown();
    win.show();
    win.focus(); // so clicking elsewhere closes it (see "blur" below)
  }
}

// A small shield drawn as a macOS template image (black + alpha; the system tints it for light/dark).
function shieldIcon() {
  const s = 18;
  const px = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const cx = x - (s - 1) / 2;
      const top = y >= 2 && y <= 9 && Math.abs(cx) <= 6.5;
      const taper = y > 9 && y <= 16 && Math.abs(cx) <= 6.5 - (y - 9) * 0.95;
      const inner = (y >= 4 && y <= 9 && Math.abs(cx) <= 4.5) || (y > 9 && y <= 14 && Math.abs(cx) <= 4.5 - (y - 9) * 0.95);
      if ((top || taper) && !inner) px[(y * s + x) * 4 + 3] = 255; // outline
      if (inner && y >= 6 && y <= 11 && Math.abs(cx) <= 1.5) px[(y * s + x) * 4 + 3] = 255; // center mark
    }
  }
  const img = nativeImage.createFromBitmap(px, { width: s, height: s, scaleFactor: 1 });
  img.setTemplateImage(true);
  return img;
}

function createTray() {
  tray = new Tray(shieldIcon());
  tray.setToolTip("Shadow Agent Tribunal: watching Hermes");
  tray.setTitle(" Tribunal", { fontType: "monospacedDigit" });
  tray.on("click", toggleDropdown);
  tray.on("right-click", toggleDropdown);
}

// ---- window ----------------------------------------------------------------------------

function createWindow() {
  win = new BrowserWindow({
    width: WIDTH,
    height: MODE === "menubar" ? DROPDOWN_HEIGHT : COLLAPSED,
    show: MODE !== "menubar",
    frame: false,
    transparent: true,
    resizable: false,
    movable: MODE !== "menubar",
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // keep following the guard's stream while hidden
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (MODE === "pill") placePill(COLLAPSED);
  if (MODE === "menubar") {
    win.on("blur", () => {
      if (!blockShowing) win.hide();
    });
  }

  const load = () => win.loadURL(pageUrl()).catch(() => setTimeout(load, 2000)); // retry until the frontend is up
  load();
  win.webContents.on("did-fail-load", () => setTimeout(load, 2000));
}

// The page reports when its block/leak card opens or closes.
ipcMain.on("hud:expanded", (_e, expanded) => {
  if (!win) return;
  if (MODE === "pill") {
    placePill(expanded ? EXPANDED : COLLAPSED);
    return;
  }
  blockShowing = expanded;
  if (expanded) showDropdown();
  else win.hide();
});

// The page reports the short status for the menu bar item.
const TONE_PREFIX = { blocked: "⛔ ", breach: "⚠️ " };
ipcMain.on("hud:status", (_e, status) => {
  if (!tray || !status) return;
  const title = status.title ? `${TONE_PREFIX[status.tone] || ""}${status.title}` : "Tribunal";
  tray.setTitle(` ${title}`, { fontType: "monospacedDigit" });
  tray.setToolTip(status.text || "Shadow Agent Tribunal");
  if (process.env.TRIBUNAL_HUD_DEBUG) console.log(`menu bar: "${title}" (${status.tone})`);
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
  if (MODE === "menubar") createTray();
  createWindow();
});
app.on("window-all-closed", () => {
  if (MODE !== "menubar") app.quit();
});
