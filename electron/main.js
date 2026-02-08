const path = require("path");
const fs = require("fs");
const http = require("http");
const url = require("url");
const { app, BrowserWindow, nativeTheme, ipcMain, dialog, Tray, Menu, nativeImage, screen } =
  require("electron");

function loadLocalConfig() {
  const cfgPath = path.join(__dirname, "..", "config.local.json");
  try {
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Config load failed:", err.message);
  }
  return {};
}

const fileCfg = loadLocalConfig();
const APP_CONFIG = {
  clientId: fileCfg.clientId || process.env.YT_CLIENT_ID || "",
  clientSecret: fileCfg.clientSecret || process.env.YT_CLIENT_SECRET || "",
  apiKey: fileCfg.apiKey || process.env.YT_API_KEY || "",
};
const APP_NAME = "VoidTube";
const ICON_PATH = path.join(__dirname, "..", "resource", "logo_sign.svg");
const WINDOW_STATE_FILE = "window-state.json";

function getTokenPath() {
  return path.join(app.getPath("userData"), "yt-desk-token.json");
}

async function readTokenFile() {
  try {
    const raw = await fs.promises.readFile(getTokenPath(), "utf-8");
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function writeTokenFile(token) {
  const filePath = getTokenPath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(token), "utf-8");
}

async function clearTokenFile() {
  try {
    await fs.promises.unlink(getTokenPath());
  } catch (_) {
    // ignore
  }
}

ipcMain.handle("token:get", async () => readTokenFile());
ipcMain.handle("token:set", async (_evt, token) => {
  if (!token) return false;
  await writeTokenFile(token);
  return true;
});
ipcMain.handle("token:clear", async () => {
  await clearTokenFile();
  return true;
});

ipcMain.handle("playlist:export", async (_evt, data) => {
  try {
    if (!data) return { canceled: true };
    const res = await dialog.showSaveDialog({
      title: "Export playlist",
      defaultPath: "yt-desk-playlist.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePath) return { canceled: true };
    await fs.promises.writeFile(res.filePath, JSON.stringify(data, null, 2), "utf-8");
    return { canceled: false, filePath: res.filePath };
  } catch (err) {
    return { canceled: true, error: err.message };
  }
});

ipcMain.handle("playlist:import", async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: "Import playlist",
      properties: ["openFile"],
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true };
    const raw = await fs.promises.readFile(res.filePaths[0], "utf-8");
    return { canceled: false, data: JSON.parse(raw), filePath: res.filePaths[0] };
  } catch (err) {
    return { canceled: true, error: err.message };
  }
});

let staticServer;
let staticPort;
let tray;
let mainWindow;

function getWindowStatePath() {
  return path.join(app.getPath("userData"), WINDOW_STATE_FILE);
}

function loadWindowState() {
  const defaults = { width: 1280, height: 800 };
  try {
    const raw = fs.readFileSync(getWindowStatePath(), "utf-8");
    const parsed = JSON.parse(raw);
    const state = {
      width: Number.isFinite(parsed.width) ? parsed.width : defaults.width,
      height: Number.isFinite(parsed.height) ? parsed.height : defaults.height,
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
      isMaximized: Boolean(parsed.isMaximized),
    };
    if (Number.isFinite(state.x) && Number.isFinite(state.y)) {
      const displays = screen.getAllDisplays();
      const inBounds = displays.some((display) => {
        const area = display.workArea;
        return (
          state.x >= area.x &&
          state.y >= area.y &&
          state.x + state.width <= area.x + area.width &&
          state.y + state.height <= area.y + area.height
        );
      });
      if (!inBounds) {
        state.x = undefined;
        state.y = undefined;
      }
    }
    return state;
  } catch (_) {
    return defaults;
  }
}

function writeWindowState(state) {
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(state), "utf-8");
  } catch (_) {
    // ignore
  }
}

function startStaticServer(preferred = 38999) {
  const baseDir = path.join(__dirname, "..", "renderer");
  const resourceDir = path.join(__dirname, "..", "resource");
  staticServer = http.createServer((req, res) => {
    const parsed = url.parse(req.url);
    let safePath = path.normalize(parsed.pathname || "/").replace(/^(\.\.(\/|\\|$))+/, "");
    let rootDir = baseDir;
    if (safePath.startsWith("/resource/")) {
      rootDir = resourceDir;
      safePath = safePath.replace(/^\/resource\/?/, "");
    }
    if (safePath === "/" || safePath === "") {
      safePath = rootDir === baseDir ? "index.html" : "logo.svg";
    }
    safePath = safePath.replace(/^\/+/, "");
    const filePath = path.join(rootDir, safePath);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      const contentType =
        {
          ".html": "text/html",
          ".js": "application/javascript",
          ".css": "text/css",
          ".json": "application/json",
          ".svg": "image/svg+xml",
        }[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });

  const tryListen = (port) =>
    new Promise((resolve) => {
      staticServer.listen(port, "127.0.0.1", () => resolve({ ok: true, port }));
      staticServer.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
          resolve({ ok: false });
        }
      });
    });

  const pickPort = async () => {
    const first = await tryListen(preferred);
    if (first.ok) {
      staticPort = preferred;
      return;
    }
    const fallback = await tryListen(preferred + 1);
    staticPort = fallback.ok ? preferred + 1 : 0;
  };

  return pickPort();
}

/** Create the main application window. */
function createWindow() {
  const windowState = loadWindowState();
  const win = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f0f0f" : "#f5f5f5",
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      additionalArguments: [JSON.stringify({ appConfig: APP_CONFIG })],
    },
    titleBarStyle: "hiddenInset",
    title: APP_NAME,
  });

  win.loadURL(`http://127.0.0.1:${staticPort}/index.html`);
  win.webContents.openDevTools({ mode: "detach" });
  mainWindow = win;

  const saveState = () => {
    if (win.isDestroyed()) return;
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    writeWindowState({ ...bounds, isMaximized: win.isMaximized() });
  };
  let saveTimer;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 200);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("close", saveState);
  win.on("maximize", scheduleSave);
  win.on("unmaximize", scheduleSave);

  if (windowState.isMaximized) {
    win.maximize();
  }
}

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  await startStaticServer();
  createWindow();
  createTray();
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(ICON_PATH);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  const menu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        if (mainWindow) mainWindow.show();
      },
    },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    if (mainWindow) mainWindow.show();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  if (staticServer) {
    staticServer.close();
  }
});
