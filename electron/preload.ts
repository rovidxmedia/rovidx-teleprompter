import { contextBridge, ipcRenderer } from "electron";
import type { DesktopAPI } from "../shared/types";
const api: DesktopAPI = {
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  openScript: (path) => ipcRenderer.invoke("script:open", path),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  fullscreen: (value) => ipcRenderer.invoke("window:fullscreen", value),
  selectMonitor: () => ipcRenderer.invoke("window:monitor"),
  modelDownload: () => ipcRenderer.invoke("model:download"),
  modelCancel: () => ipcRenderer.invoke("model:cancel"),
  speechStart: (session) => ipcRenderer.invoke("speech:start", session),
  speechStop: (session) => ipcRenderer.invoke("speech:stop", session),
  speechAudio: (session, samples) =>
    ipcRenderer.send("speech:audio", session, samples),
  onModel: (callback) => {
    const listener = (_: unknown, status: any) => callback(status);
    ipcRenderer.on("model:status", listener);
    return () => ipcRenderer.removeListener("model:status", listener);
  },
  onSpeech: (callback) => {
    const listener = (_: unknown, event: any) => callback(event);
    ipcRenderer.on("speech:event", listener);
    return () => ipcRenderer.removeListener("speech:event", listener);
  },
};
contextBridge.exposeInMainWorld("desktop", api);
