import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  screen,
  session,
  utilityProcess,
  powerSaveBlocker,
} from "electron";
import type { UtilityProcess } from "electron";
import { mkdir, readFile, rename, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeSettings } from "../shared/settings";
import { normalizeText } from "../shared/script";
import type { RecentFile, Settings } from "../shared/types";
import { ModelManager } from "./model";

let window: BrowserWindow;
let speech: UtilityProcess | undefined;
let speechSession = "";
let settings = normalizeSettings(null),
  recent: RecentFile[] = [];
let savedBounds: Electron.Rectangle | undefined,
  savedFullscreen = false;
let saveQueue = Promise.resolve();
let model: ModelManager;
let displayBlocker: number | undefined;
let quitting = false,
  quitAfterSave = false;
let settingsTimer: ReturnType<typeof setTimeout>;
const dataDir = () => app.getPath("userData");
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

async function loadState() {
  try {
    const state = JSON.parse(
      await readFile(path.join(dataDir(), "settings.json"), "utf8"),
    );
    settings = normalizeSettings(state.settings);
    recent = Array.isArray(state.recent)
      ? state.recent
          .filter(
            (f: any) =>
              typeof f?.path === "string" && typeof f?.name === "string",
          )
          .slice(0, 8)
      : [];
    const bounds = state.bounds;
    if (
      bounds &&
      ["x", "y", "width", "height"].every((k) => Number.isFinite(bounds[k])) &&
      bounds.width >= 800 &&
      bounds.height >= 500
    )
      savedBounds = bounds;
    savedFullscreen = state.fullscreen === true;
  } catch {
    /* First launch or corrupt state: use safe defaults. */
  }
}
function persist() {
  if (window && !window.isDestroyed()) {
    savedBounds = window.getNormalBounds();
    savedFullscreen = window.isFullScreen();
  }
  const json = JSON.stringify(
    { settings, recent, bounds: savedBounds, fullscreen: savedFullscreen },
    null,
    2,
  );
  const task = saveQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(dataDir(), { recursive: true });
      const filename = path.join(dataDir(), "settings.json");
      await writeFile(filename + ".tmp", json, "utf8");
      await rename(filename + ".tmp", filename);
    });
  saveQueue = task;
  return task;
}
function stopSpeech(session?: string) {
  if (session !== undefined && session !== speechSession) return;
  speech?.kill();
  speech = undefined;
}
function sendSpeech(event: unknown) {
  if (window && !window.isDestroyed())
    window.webContents.send("speech:event", event);
}
function recoverWindow() {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const visible = screen.getAllDisplays().some((d) => {
    const x = Math.max(bounds.x, d.bounds.x),
      y = Math.max(bounds.y, d.bounds.y);
    return (
      Math.min(bounds.x + bounds.width, d.bounds.x + d.bounds.width) - x >=
        200 &&
      Math.min(bounds.y + bounds.height, d.bounds.y + d.bounds.height) - y >=
        200
    );
  });
  if (!visible) {
    window.setFullScreen(false);
    window.setBounds(screen.getPrimaryDisplay().workArea);
  }
}
async function startSpeech(session: string) {
  stopSpeech();
  if (model.status.state !== "ready")
    throw new Error("Download the voice model in Voice settings first.");
  const nativeDirectory = path.join(
    app.getAppPath().replace(/\.asar$/, ".asar.unpacked"),
    "node_modules",
    `sherpa-onnx-${process.platform === "win32" ? "win" : process.platform}-${process.arch}`,
  );
  const nativeEnvironment = { ...process.env };
  if (process.platform === "linux")
    nativeEnvironment.LD_LIBRARY_PATH = [
      nativeDirectory,
      process.env.LD_LIBRARY_PATH,
    ]
      .filter(Boolean)
      .join(path.delimiter);
  if (process.platform === "darwin")
    nativeEnvironment.DYLD_LIBRARY_PATH = [
      nativeDirectory,
      process.env.DYLD_LIBRARY_PATH,
    ]
      .filter(Boolean)
      .join(path.delimiter);
  const child = utilityProcess.fork(
    path.join(__dirname, "speech-worker.js"),
    [],
    {
      serviceName: "Rovidx offline speech",
      stdio: "pipe",
      env: nativeEnvironment,
    },
  );
  speech = child;
  speechSession = session;
  child.once("spawn", () => {
    if (speech !== child) child.kill();
  });
  let nativeError = "";
  child.stderr?.on("data", (chunk) => {
    nativeError = (nativeError + chunk.toString()).slice(-4000);
  });
  await new Promise<void>((resolve, reject) => {
    let ready = false;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Voice recognition took too long to start. Try again."));
    }, 30000);
    child.on("message", (event: any) => {
      if (speech !== child) return;
      if (event.ready) {
        ready = true;
        clearTimeout(timer);
        resolve();
      } else if (event.error) {
        if (!ready) {
          clearTimeout(timer);
          reject(new Error(event.error));
        } else sendSpeech(event);
      } else sendSpeech(event);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (speech === child) {
        speech = undefined;
        if (ready)
          sendSpeech({
            error: `Voice recognition stopped (${code}). Restart voice mode. ${nativeError.trim()}`,
          });
      }
      if (!ready)
        reject(
          new Error(
            `The speech process could not start. Try again. ${nativeError.trim()}`,
          ),
        );
    });
    child.postMessage({ type: "init", directory: model.directory });
  }).catch((error) => {
    if (speech === child) {
      speech = undefined;
      child.kill();
    }
    throw error;
  });
}

app
  .whenReady()
  .then(async () => {
    if (!app.isPackaged && process.env.ROVIDX_TEST_DATA)
      app.setPath("userData", process.env.ROVIDX_TEST_DATA);
    const userDataOverride = app.commandLine.getSwitchValue("user-data-dir");
    if (userDataOverride)
      app.setPath("userData", path.resolve(userDataOverride));
    await loadState();
    Menu.setApplicationMenu(null);
    const display = savedBounds
      ? screen.getDisplayMatching(savedBounds)
      : screen.getPrimaryDisplay();
    window = new BrowserWindow({
      title: "Rovidx Teleprompter",
      backgroundColor: "#111315",
      minWidth: 900,
      minHeight: 600,
      icon: path.join(__dirname, "../../dist/icon.png"),
      ...(savedBounds ?? { ...display.workArea }),
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    recoverWindow();
    model = new ModelManager(
      path.join(dataDir(), "models", "zipformer-en-2023-06-26"),
      (status) => {
        if (!window.isDestroyed())
          window.webContents.send("model:status", status);
      },
    );
    await model.check();
    const trusted = (contents: Electron.WebContents) =>
      contents.id === window.webContents.id;
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, callback, details) =>
        callback(
          trusted(contents) &&
            permission === "media" &&
            "mediaTypes" in details &&
            Array.isArray(details.mediaTypes) &&
            details.mediaTypes.length > 0 &&
            details.mediaTypes.every((t: string) => t === "audio"),
        ),
    );
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission, _origin, details) =>
        !!contents &&
        trusted(contents) &&
        permission === "media" &&
        details.mediaType === "audio",
    );
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    const handle = (channel: string, fn: (...args: any[]) => any) =>
      ipcMain.handle(channel, (event, ...args) => {
        if (
          !trusted(event.sender) ||
          event.senderFrame !== window.webContents.mainFrame
        )
          throw new Error("Untrusted request.");
        return fn(...args);
      });
    handle("bootstrap", () => ({ settings, recent, model: model.status }));
    handle("settings:save", (value: Settings) => {
      settings = normalizeSettings(value);
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(
        () =>
          void persist().catch((error) =>
            sendSpeech({
              error: `Could not save preferences. ${errorMessage(error)}`,
            }),
          ),
        150,
      );
    });
    handle("script:open", async (requested?: string) => {
      try {
        let filename: string | undefined;
        if (typeof requested === "string") {
          if (!recent.some((f) => f.path === requested))
            throw new Error("Choose this file through Open text file.");
          filename = requested;
        } else {
          const result = await dialog.showOpenDialog(window, {
            title: "Open a teleprompter script",
            filters: [{ name: "Text scripts", extensions: ["txt"] }],
            properties: ["openFile"],
          });
          if (result.canceled) return { ok: true, value: null };
          filename = result.filePaths[0];
        }
        if (!filename) return { ok: true, value: null };
        if ((await stat(filename)).size > 5 * 1024 * 1024)
          throw new Error(
            "This file is larger than 5 MB. Split it into smaller scripts.",
          );
        const buffer = await readFile(filename);
        const text = normalizeText(
          new TextDecoder("utf-8", { fatal: true }).decode(buffer),
        );
        if (!text)
          throw new Error(
            "This script is empty. Choose a text file with something to read.",
          );
        if (text.includes("\0"))
          throw new Error(
            "This does not look like a UTF-8 text file. Save it as UTF-8 .txt and try again.",
          );
        const script = { name: path.basename(filename), text, path: filename };
        recent = [
          { name: script.name, path: filename },
          ...recent.filter((f) => f.path !== filename),
        ].slice(0, 8);
        await persist();
        return { ok: true, value: script };
      } catch (error) {
        return {
          ok: false,
          error: `Could not open the script. ${errorMessage(error)}`,
        };
      }
    });
    handle("window:fullscreen", (value?: boolean) => {
      window.setFullScreen(
        typeof value === "boolean" ? value : !window.isFullScreen(),
      );
      void persist();
      return window.isFullScreen();
    });
    handle(
      "window:monitor",
      () =>
        new Promise<void>((resolve) => {
          Menu.buildFromTemplate(
            screen.getAllDisplays().map((d, i) => ({
              label: `Display ${i + 1}${d.label ? " · " + d.label : ""} (${d.size.width} × ${d.size.height})`,
              type: "radio",
              checked:
                screen.getDisplayMatching(window.getBounds()).id === d.id,
              click: () => {
                const full = window.isFullScreen();
                window.setFullScreen(false);
                window.setBounds(d.workArea);
                if (full) window.setFullScreen(true);
                void persist();
              },
            })),
          ).popup({ window, callback: resolve });
        }),
    );
    handle("model:download", async () => {
      try {
        await model.download();
        return { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    });
    handle("model:cancel", () => model.cancel());
    handle("speech:start", async (session: unknown) => {
      try {
        if (typeof session !== "string" || !/^[a-f\d-]{36}$/i.test(session))
          throw new Error("Invalid voice session.");
        await startSpeech(session);
        return { ok: true, value: undefined };
      } catch (error) {
        return {
          ok: false,
          error: `Voice recognition could not start. ${errorMessage(error)}`,
        };
      }
    });
    handle("speech:stop", (session: unknown) => {
      if (typeof session === "string") stopSpeech(session);
    });
    ipcMain.on("speech:audio", (event, session, samples) => {
      if (
        trusted(event.sender) &&
        event.senderFrame === window.webContents.mainFrame &&
        session === speechSession &&
        samples instanceof Float32Array &&
        samples.length <= 16000
      )
        speech?.postMessage({ type: "audio", samples });
    });
    window.on("ready-to-show", () => {
      if (savedFullscreen) window.setFullScreen(true);
      window.show();
    });
    window.on("close", () => {
      stopSpeech();
      model.cancel();
      clearTimeout(settingsTimer);
      void persist().catch(() => {});
    });
    let boundsTimer: ReturnType<typeof setTimeout>;
    const changed = () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => void persist().catch(() => {}), 350);
    };
    window.on("move", changed);
    window.on("resize", changed);
    window.on("enter-full-screen", changed);
    window.on("leave-full-screen", changed);
    screen.on("display-removed", recoverWindow);
    displayBlocker = powerSaveBlocker.start("prevent-display-sleep");
    if (process.env.VITE_DEV_SERVER_URL && !app.isPackaged)
      await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    else await window.loadFile(path.join(__dirname, "../../dist/index.html"));
  })
  .catch((error) => {
    dialog.showErrorBox(
      "Rovidx Teleprompter could not start",
      errorMessage(error),
    );
    app.quit();
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (quitAfterSave) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  stopSpeech();
  model?.cancel();
  if (displayBlocker !== undefined) powerSaveBlocker.stop(displayBlocker);
  saveQueue
    .catch(() => {})
    .finally(() => {
      quitAfterSave = true;
      app.quit();
    });
});
