import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  Link2,
  Mic,
  RefreshCw,
  Unlink2,
  X,
} from "lucide-react";
import type { LightSettings, ModelStatus, Settings } from "../shared/types";
import { updateLight } from "../shared/settings";

export type SettingsTab = "left" | "prompter" | "right" | "voice";
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="color-control">
        <input
          aria-label={`${label} picker`}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          value={draft}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#[\da-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </label>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field range-field">
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
export function SettingsPanel({
  tab,
  setTab,
  settings,
  setSettings,
  model,
  onDownload,
  onCancel,
  onClose,
}: {
  tab: SettingsTab;
  setTab: (tab: SettingsTab) => void;
  settings: Settings;
  setSettings: (settings: Settings) => void;
  model: ModelStatus;
  onDownload: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceError, setDeviceError] = useState("");
  const change = (patch: Partial<Settings>) =>
    setSettings({ ...settings, ...patch });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input, select, textarea, [tabindex="0"]',
          ) ?? [],
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => {
      document.removeEventListener("keydown", trap, true);
      previous?.focus();
    };
  }, [onClose]);
  const refreshDevices = async (request = false) => {
    try {
      if (request) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        stream.getTracks().forEach((t) => t.stop());
      }
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "audioinput",
        ),
      );
      setDeviceError("");
    } catch {
      setDeviceError(
        "Microphone access is unavailable. Check Windows Settings → Privacy & security → Microphone, then refresh.",
      );
    }
  };
  useEffect(() => {
    if (tab === "voice") void refreshDevices();
  }, [tab]);
  const side = tab === "left" || tab === "right" ? tab : null;
  const light = side ? settings[side] : null;
  const lightChange = (patch: Partial<LightSettings>) =>
    side && setSettings(updateLight(settings, side, patch));
  return (
    <div
      className="settings-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        ref={root}
      >
        <div className="panel-heading">
          <div>
            <h2 id="settings-title">Studio settings</h2>
            <p>Make this space yours.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <nav className="settings-tabs" aria-label="Settings sections">
          {(["left", "prompter", "right", "voice"] as const).map((t) => (
            <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === "prompter"
                ? "Text"
                : t === "voice"
                  ? "Voice"
                  : `${t === "left" ? "Left" : "Right"} light`}
            </button>
          ))}
        </nav>
        <div className="panel-content">
          {light && side && (
            <>
              <div className="section-title">
                <h3>{side === "left" ? "Left" : "Right"} studio light</h3>
                <label className="toggle">
                  <input
                    aria-label={`${side} light enabled`}
                    type="checkbox"
                    checked={light.enabled}
                    onChange={(e) => lightChange({ enabled: e.target.checked })}
                  />
                  <span>On</span>
                </label>
              </div>
              <ColorField
                label="Light color"
                value={light.color}
                onChange={(color) => lightChange({ color })}
              />
              <Range
                label="Brightness"
                value={light.brightness}
                min={0}
                max={100}
                unit="%"
                onChange={(brightness) => lightChange({ brightness })}
              />
              <div className="field">
                <span>White presets</span>
                <div className="preset-row">
                  {[
                    ["Warm", "#ffdbad"],
                    ["Neutral", "#ffffff"],
                    ["Cool", "#d6e8ff"],
                  ].map(([name, color]) => (
                    <button key={name} onClick={() => lightChange({ color })}>
                      <i style={{ background: color }} />
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className={`link-button ${settings.linked ? "linked" : ""}`}
                aria-pressed={settings.linked}
                onClick={() =>
                  setSettings({
                    ...settings,
                    linked: !settings.linked,
                    ...(!settings.linked
                      ? { left: { ...light }, right: { ...light } }
                      : {}),
                  })
                }
              >
                {settings.linked ? <Link2 size={18} /> : <Unlink2 size={18} />}
                <span>
                  {settings.linked ? "Lights linked" : "Link both lights"}
                  <small>
                    {settings.linked
                      ? "Changes apply to both panels."
                      : "Use the same settings on both sides."}
                  </small>
                </span>
              </button>
              <p className="help-text">
                Brightness adjusts this panel’s color. Right-click either light
                to return here.
              </p>
            </>
          )}
          {tab === "prompter" && (
            <>
              <h3>Appearance</h3>
              <ColorField
                label="Text color"
                value={settings.foreground}
                onChange={(foreground) => change({ foreground })}
              />
              <ColorField
                label="Background color"
                value={settings.background}
                onChange={(background) => change({ background })}
              />
              <label className="field">
                <span>Font</span>
                <select
                  aria-label="Font"
                  value={settings.font}
                  onChange={(e) => change({ font: e.target.value })}
                >
                  {[
                    "Arial",
                    "Georgia",
                    "Verdana",
                    "Tahoma",
                    "Trebuchet MS",
                  ].map((font) => (
                    <option key={font}>{font}</option>
                  ))}
                </select>
              </label>
              <Range
                label="Font size"
                value={settings.fontSize}
                min={24}
                max={120}
                unit=" px"
                onChange={(fontSize) => change({ fontSize })}
              />
              <Range
                label="Line spacing"
                value={settings.lineHeight}
                min={1.1}
                max={2.5}
                step={0.1}
                onChange={(lineHeight) => change({ lineHeight })}
              />
              <Range
                label="Paragraph spacing"
                value={settings.paragraphGap}
                min={0.3}
                max={3}
                step={0.1}
                unit=" em"
                onChange={(paragraphGap) => change({ paragraphGap })}
              />
              <Range
                label="Text width"
                value={settings.textWidth}
                min={40}
                max={96}
                unit="%"
                onChange={(textWidth) => change({ textWidth })}
              />
              <h3>Reading position</h3>
              <div className="segmented">
                <button
                  aria-pressed={settings.anchor === 50}
                  onClick={() => change({ anchor: 50 })}
                >
                  Center camera
                </button>
                <button
                  aria-pressed={settings.anchor === 22}
                  onClick={() => change({ anchor: 22 })}
                >
                  Above monitor
                </button>
              </div>
              <Range
                label="Reading line position"
                value={settings.anchor}
                min={15}
                max={75}
                unit="%"
                onChange={(anchor) => change({ anchor })}
              />
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={settings.guide}
                  onChange={(e) => change({ guide: e.target.checked })}
                />
                Show reading guide
              </label>
              <h3>Scrolling</h3>
              <label className="field">
                <span>Reading mode</span>
                <select
                  aria-label="Reading mode settings"
                  value={settings.mode}
                  onChange={(e) =>
                    change({ mode: e.target.value as Settings["mode"] })
                  }
                >
                  <option value="manual">Manual</option>
                  <option value="auto">Steady auto-scroll</option>
                  <option value="voice">Follow my voice</option>
                </select>
              </label>
              <Range
                label="Auto-scroll speed"
                value={settings.speed}
                min={5}
                max={200}
                unit=" px/s"
                onChange={(speed) => change({ speed })}
              />
              <button
                className="quiet-button"
                onClick={() => change({ widths: [30, 40, 30] })}
              >
                Reset panel widths
              </button>
            </>
          )}
          {tab === "voice" && (
            <>
              <div className="section-title">
                <h3>Offline voice following</h3>
                <Mic size={20} />
              </div>
              <p className="body-copy">
                The script moves as you read. Pause, take a breath, or go
                off-script — your place stays put.
              </p>
              <div className="model-status">
                <div className="status-line">
                  {model.state === "ready" ? (
                    <Check size={18} />
                  ) : (
                    <Download size={18} />
                  )}
                  <strong>
                    {model.state === "ready"
                      ? "English model ready"
                      : model.state === "downloading"
                        ? "Downloading English model…"
                        : "Download the English model"}
                  </strong>
                </div>
                <p>
                  {model.state === "ready"
                    ? "Recognition runs on your computer, even offline."
                    : "One download, about 70 MB. No account or usage fees."}
                </p>
                {model.state === "downloading" ? (
                  <>
                    <progress
                      aria-label="Model download progress"
                      value={model.progress}
                      max={100}
                    />
                    <div className="download-line">
                      <span>{model.progress}%</span>
                      <button onClick={onCancel}>Cancel download</button>
                    </div>
                  </>
                ) : (
                  model.state !== "ready" && (
                    <button className="primary-button" onClick={onDownload}>
                      <Download size={16} />
                      {model.state === "error"
                        ? "Retry download"
                        : "Download voice model"}
                    </button>
                  )
                )}
                {model.message && (
                  <p role={model.state === "error" ? "alert" : undefined}>
                    {model.message}
                  </p>
                )}
              </div>
              <label className="field">
                <span>Microphone</span>
                <select
                  aria-label="Microphone"
                  value={settings.microphone}
                  onChange={(e) => change({ microphone: e.target.value })}
                >
                  <option value="">System default microphone</option>
                  {devices
                    .filter((d) => d.deviceId !== "default")
                    .map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${i + 1}`}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="quiet-button"
                onClick={() => void refreshDevices(true)}
              >
                <RefreshCw size={15} />
                Allow access & refresh microphones
              </button>
              {deviceError && (
                <p className="help-text" role="alert">
                  {deviceError}
                </p>
              )}
              <p className="help-text">
                Only listens while voice following is running. Audio is
                processed locally and is never recorded or uploaded.
              </p>
            </>
          )}
        </div>
        <footer className="panel-footer">
          <span>Changes saved automatically</span>
          <button onClick={onClose}>Done</button>
        </footer>
      </aside>
    </div>
  );
}
