export type ReadingMode = "manual" | "auto" | "voice";
export interface LightSettings {
  color: string;
  brightness: number;
  enabled: boolean;
}
export interface Settings {
  left: LightSettings;
  right: LightSettings;
  linked: boolean;
  widths: [number, number, number];
  background: string;
  foreground: string;
  font: string;
  fontSize: number;
  lineHeight: number;
  paragraphGap: number;
  textWidth: number;
  anchor: number;
  guide: boolean;
  speed: number;
  mode: ReadingMode;
  microphone: string;
}
export interface Script {
  name: string;
  text: string;
  path?: string;
}
export interface RecentFile {
  name: string;
  path: string;
}
export interface ModelStatus {
  state: "missing" | "downloading" | "ready" | "error";
  progress: number;
  message?: string;
}
export interface SpeechEvent {
  text?: string;
  final?: boolean;
  error?: string;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface DesktopAPI {
  bootstrap(): Promise<{
    settings: Settings;
    recent: RecentFile[];
    model: ModelStatus;
  }>;
  openScript(path?: string): Promise<Result<Script | null>>;
  saveSettings(settings: Settings): Promise<void>;
  fullscreen(value?: boolean): Promise<boolean>;
  selectMonitor(): Promise<void>;
  modelDownload(): Promise<Result<void>>;
  modelCancel(): Promise<void>;
  speechStart(session: string): Promise<Result<void>>;
  speechStop(session: string): Promise<void>;
  speechAudio(session: string, samples: Float32Array): void;
  onModel(callback: (status: ModelStatus) => void): () => void;
  onSpeech(callback: (event: SpeechEvent) => void): () => void;
}
