import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import {
  Aperture,
  ArrowLeft,
  ClipboardPaste,
  FileText,
  FolderOpen,
  Lightbulb,
  Maximize,
  Mic,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import {
  clamp,
  defaults,
  lightColor,
  normalizeSettings,
} from "../shared/settings";
import {
  matchSpeech,
  normalizeText,
  scriptWords,
  type Word,
} from "../shared/script";
import type {
  ModelStatus,
  RecentFile,
  Script,
  Settings,
} from "../shared/types";
import { SettingsPanel, type SettingsTab } from "./SettingsPanel";
import { useMicrophone } from "./useMicrophone";

const ScriptContent = memo(function ScriptContent({
  paragraphs,
  settings,
  height,
  elements,
}: {
  paragraphs: Word[][];
  settings: Settings;
  height: number;
  elements: RefObject<Map<number, HTMLSpanElement>>;
}) {
  return (
    <article
      className="script-content"
      style={{
        fontFamily: settings.font,
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        width: `${settings.textWidth}%`,
        paddingTop: `${(height * settings.anchor) / 100}px`,
        paddingBottom: `${height * (1 - settings.anchor / 100)}px`,
      }}
    >
      {paragraphs.map((words, p) => (
        <p key={p} style={{ marginBottom: `${settings.paragraphGap}em` }}>
          {words.map((word, i) =>
            word.index >= 0 ? (
              <span
                key={i}
                className="script-word"
                data-word={word.index}
                ref={(element) => {
                  if (element) elements.current.set(word.index, element);
                  else elements.current.delete(word.index);
                }}
              >
                {word.text}
              </span>
            ) : (
              <span key={i}>{word.text}</span>
            ),
          )}
        </p>
      ))}
    </article>
  );
});

export function App() {
  const [settings, setSettings] = useState<Settings>(() =>
    normalizeSettings(defaults),
  );
  const [ready, setReady] = useState(false),
    [script, setScript] = useState<Script | null>(null),
    [recent, setRecent] = useState<RecentFile[]>([]);
  const [running, setRunning] = useState(false),
    [visible, setVisible] = useState(true),
    [tab, setTab] = useState<SettingsTab | null>(null);
  const [paste, setPaste] = useState(false),
    [pasted, setPasted] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [model, setModel] = useState<ModelStatus>({
    state: "missing",
    progress: 0,
  });
  const [position, setPosition] = useState(0),
    [elapsed, setElapsed] = useState(0),
    [heard, setHeard] = useState("");
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const scroller = useRef<HTMLDivElement>(null),
    reader = useRef<HTMLElement>(null),
    layout = useRef<HTMLDivElement>(null),
    pasteRef = useRef<HTMLTextAreaElement>(null);
  const wordIndex = useRef(0),
    voiceTarget = useRef<number | null>(null),
    wordElements = useRef(new Map<number, HTMLSpanElement>());
  const toolbarTimer = useRef<ReturnType<typeof setTimeout>>(undefined),
    scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const paragraphs = useMemo(
    () => (script ? scriptWords(script.text) : []),
    [script],
  );
  const tokens = useMemo(
    () =>
      paragraphs
        .flat()
        .filter((w) => w.index >= 0)
        .map((w) => w.normalized),
    [paragraphs],
  );
  const reportError = useCallback((message: string) => {
    setError(message);
    setRunning(false);
  }, []);
  const { level, starting } = useMicrophone(
    running && settings.mode === "voice",
    settings.microphone,
    reportError,
  );
  const reveal = useCallback(() => {
    setVisible(true);
    clearTimeout(toolbarTimer.current);
    toolbarTimer.current = setTimeout(() => setVisible(false), 2600);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void window.desktop
      .bootstrap()
      .then((data) => {
        if (!cancelled) {
          setSettings(data.settings);
          setRecent(data.recent);
          setModel(data.model);
          setReady(true);
        }
      })
      .catch(() =>
        reportError(
          "Could not load app preferences. Restart Rovidx Teleprompter.",
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [reportError]);
  useEffect(() => window.desktop.onModel(setModel), []);
  useEffect(() => {
    if (!ready) return;
    void window.desktop
      .saveSettings(settings)
      .catch(() =>
        setError("Could not save preferences. Check available disk space."),
      );
  }, [settings, ready]);
  useEffect(() => {
    if (paste) pasteRef.current?.focus();
  }, [paste]);
  useEffect(() => {
    if (!paste) return;
    const trap = (e: KeyboardEvent) => {
      const dialog = document.querySelector(".paste-dialog");
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setPaste(false);
      }
      if (e.key === "Tab") {
        const nodes = Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),textarea",
          ) ?? [],
        );
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes[nodes.length - 1]?.focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === nodes[nodes.length - 1]
        ) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", trap, true);
    return () => document.removeEventListener("keydown", trap, true);
  }, [paste]);
  useEffect(
    () => () => {
      clearTimeout(toolbarTimer.current);
      clearTimeout(scrollTimer.current);
    },
    [],
  );
  const closeSettings = useCallback(() => setTab(null), []);
  const openSettings = useCallback(
    (section: SettingsTab) => {
      setRunning(false);
      setTab(section);
      setPaste(false);
      reveal();
    },
    [reveal],
  );
  const loadScript = useCallback(
    (value: Script) => {
      setRunning(false);
      setScript(value);
      setError("");
      setElapsed(0);
      setPosition(0);
      setHeard("");
      wordIndex.current = 0;
      voiceTarget.current = null;
      setPaste(false);
      setPasted("");
      if (value.path)
        setRecent((current) =>
          [
            { name: value.name, path: value.path! },
            ...current.filter((f) => f.path !== value.path),
          ].slice(0, 8),
        );
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = 0;
      });
      reveal();
    },
    [reveal],
  );
  const openScript = useCallback(
    async (path?: string) => {
      setRunning(false);
      setBusy(true);
      setError("");
      try {
        const result = await window.desktop.openScript(path);
        if (!result.ok) reportError(result.error);
        else if (result.value) loadScript(result.value);
      } catch {
        reportError("Could not open a file. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [loadScript, reportError],
  );
  const scrollToWord = useCallback(
    (index: number, smooth = false) => {
      const viewport = scroller.current,
        element = wordElements.current.get(index);
      if (!viewport || !element) return;
      const target =
        element.getBoundingClientRect().top -
        viewport.getBoundingClientRect().top +
        viewport.scrollTop -
        (viewport.clientHeight * settings.anchor) / 100;
      viewport.scrollTo({
        top: Math.max(0, target),
        behavior: smooth ? "smooth" : "instant",
      });
    },
    [settings.anchor],
  );
  const updateReadingPosition = useCallback(() => {
    const viewport = scroller.current;
    if (!viewport) return;
    const line =
      viewport.getBoundingClientRect().top +
      (viewport.clientHeight * settings.anchor) / 100;
    let best = 0,
      distance = Infinity;
    // Binary search by vertical position, then use the first word on that line.
    let lo = 0,
      hi = tokens.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1,
        el = wordElements.current.get(mid);
      if (!el) break;
      const y = el.getBoundingClientRect().top;
      if (Math.abs(y - line) < distance) {
        distance = Math.abs(y - line);
        best = mid;
      }
      if (y < line) lo = mid + 1;
      else hi = mid - 1;
    }
    const top = wordElements.current.get(best)?.offsetTop;
    while (best > 0 && wordElements.current.get(best - 1)?.offsetTop === top)
      best--;
    wordIndex.current = best;
    setPosition(best);
  }, [settings.anchor, tokens.length]);
  useLayoutEffect(() => {
    scrollToWord(wordIndex.current);
  }, [
    settings.font,
    settings.fontSize,
    settings.lineHeight,
    settings.paragraphGap,
    settings.textWidth,
    settings.anchor,
    settings.widths,
    viewportHeight,
    scrollToWord,
  ]);
  useEffect(() => {
    const element = reader.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewportHeight(element.clientHeight);
      scrollToWord(wordIndex.current);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollToWord]);
  useEffect(
    () =>
      window.desktop.onSpeech((event) => {
        if (event.error) {
          reportError(event.error);
          return;
        }
        if (!running || settings.mode !== "voice" || !event.text) return;
        setHeard(event.text);
        const match = matchSpeech(tokens, event.text, wordIndex.current);
        if (match !== null) {
          wordIndex.current = match;
          voiceTarget.current = match;
          setPosition(match);
        }
      }),
    [running, settings.mode, tokens, reportError],
  );
  useEffect(() => {
    if (!running) return;
    let frame = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;
      const viewport = scroller.current;
      if (viewport) {
        if (settings.mode === "auto") {
          viewport.scrollTop += settings.speed * dt;
          if (
            viewport.scrollTop >=
            viewport.scrollHeight - viewport.clientHeight - 1
          ) {
            setRunning(false);
            return;
          }
        } else if (settings.mode === "voice" && voiceTarget.current !== null) {
          const element = wordElements.current.get(voiceTarget.current);
          if (element) {
            const target =
              element.getBoundingClientRect().top -
              viewport.getBoundingClientRect().top +
              viewport.scrollTop -
              (viewport.clientHeight * settings.anchor) / 100;
            viewport.scrollTop +=
              (target - viewport.scrollTop) * (1 - Math.exp(-dt * 7));
            if (
              voiceTarget.current === tokens.length - 1 &&
              Math.abs(target - viewport.scrollTop) < 2
            ) {
              setRunning(false);
              return;
            }
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    reveal();
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, [
    running,
    settings.mode,
    settings.speed,
    settings.anchor,
    tokens.length,
    reveal,
  ]);
  const toggleRunning = useCallback(() => {
    if (!script || settings.mode === "manual") return;
    if (settings.mode === "voice" && model.state !== "ready") {
      openSettings("voice");
      return;
    }
    if (!running) {
      updateReadingPosition();
      voiceTarget.current = null;
      setHeard("");
      setError("");
    }
    setRunning((value) => !value);
    reveal();
  }, [
    script,
    settings.mode,
    model.state,
    running,
    updateReadingPosition,
    openSettings,
    reveal,
  ]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement;
      if (
        target.closest('input,textarea,select,[contenteditable="true"]') ||
        tab ||
        paste
      )
        return;
      if (e.key === "F11") {
        e.preventDefault();
        void window.desktop.fullscreen();
        return;
      }
      if (e.key === "Escape") {
        void window.desktop.fullscreen(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void openScript();
        return;
      }
      if (!script) return;
      if (e.code === "Space" && !target.closest("button")) {
        e.preventDefault();
        toggleRunning();
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setSettings((s) => ({
          ...s,
          speed: clamp(s.speed + (e.key === "ArrowRight" ? 5 : -5), 5, 200),
        }));
        reveal();
      }
      if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        setRunning(false);
        voiceTarget.current = null;
        const viewport = scroller.current;
        if (viewport) {
          if (e.key === "Home") viewport.scrollTop = 0;
          else if (e.key === "End") viewport.scrollTop = viewport.scrollHeight;
          else
            viewport.scrollTop +=
              e.key === "ArrowDown"
                ? settings.fontSize * settings.lineHeight
                : -settings.fontSize * settings.lineHeight;
          updateReadingPosition();
        }
        reveal();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [
    script,
    settings.fontSize,
    settings.lineHeight,
    toggleRunning,
    openScript,
    tab,
    paste,
    reveal,
    updateReadingPosition,
  ]);
  const resize = (side: "left" | "right", startX: number) => {
    const bounds = layout.current?.getBoundingClientRect();
    if (!bounds) return;
    const initial = [...settings.widths];
    const move = (e: PointerEvent) => {
      const delta = ((e.clientX - startX) / bounds.width) * 100;
      if (side === "left") {
        const left = clamp(initial[0] + delta, 10, 90 - initial[2]);
        setSettings((s) => ({
          ...s,
          widths: [left, 100 - left - initial[2], initial[2]],
        }));
      } else {
        const right = clamp(initial[2] - delta, 10, 90 - initial[0]);
        setSettings((s) => ({
          ...s,
          widths: [initial[0], 100 - initial[0] - right, right],
        }));
      }
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.classList.remove("resizing");
    };
    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  };
  const dividerKeys = (side: "left" | "right", e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const direction = e.key === "ArrowRight" ? 1 : -1;
    setSettings((s) => {
      const [l, c, r] = s.widths;
      if (side === "left") {
        const next = clamp(l + direction, 10, 90 - r);
        return { ...s, widths: [next, 100 - next - r, r] };
      }
      const next = clamp(r - direction, 10, 90 - l);
      return { ...s, widths: [l, 100 - l - next, next] };
    });
  };
  const chromeVisible = visible || !running || !!tab || paste;
  const progress = tokens.length
    ? Math.min(100, Math.round(((position + 1) / tokens.length) * 100))
    : 0;
  if (!ready)
    return (
      <div className="loading-screen">
        <Aperture size={32} />
        <p>Opening your studio…</p>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="app" onMouseMove={reveal}>
      <div
        ref={layout}
        className="studio"
        style={{
          gridTemplateColumns: `${settings.widths[0]}fr 0px ${settings.widths[1]}fr 0px ${settings.widths[2]}fr`,
        }}
      >
        <section
          aria-label="Left studio light"
          className="light-panel"
          style={{ backgroundColor: lightColor(settings.left) }}
          onContextMenu={(e) => {
            e.preventDefault();
            openSettings("left");
          }}
        />
        <div
          className="divider"
          role="separator"
          aria-label="Left panel divider"
          aria-orientation="vertical"
          aria-valuemin={10}
          aria-valuemax={80}
          aria-valuenow={Math.round(settings.widths[0])}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            resize("left", e.clientX);
          }}
          onKeyDown={(e) => dividerKeys("left", e)}
        >
          <i />
        </div>
        <main
          ref={reader}
          className="reader"
          style={{
            background: settings.background,
            color: settings.foreground,
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            openSettings("prompter");
          }}
        >
          {!script ? (
            <div className="welcome">
              <div className="welcome-mark">
                <Aperture size={34} strokeWidth={1.5} />
              </div>
              <h1>Load your script.</h1>
              <p>
                Your words. Your pace.
                <br />A little light on either side.
              </p>
              <button
                className="primary-button open-script"
                onClick={() => void openScript()}
                disabled={busy}
              >
                <FolderOpen size={19} />
                {busy ? "Opening…" : "Open text file"}
                <kbd>Ctrl O</kbd>
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setPaste(true);
                  setRunning(false);
                }}
              >
                <ClipboardPaste size={18} />
                Paste text
              </button>
              <p className="file-note">
                UTF-8 .txt files · Everything stays local
              </p>
              {recent.length > 0 && (
                <div className="recent">
                  <h2>Recent scripts</h2>
                  {recent.map((file) => (
                    <button
                      key={file.path}
                      title={file.path}
                      onClick={() => void openScript(file.path)}
                    >
                      <FileText size={16} />
                      <span>{file.name}</span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="welcome-hint">
                <Settings2 size={15} />
                <span>Right-click any panel to make it yours.</span>
              </div>
            </div>
          ) : (
            <>
              <div
                ref={scroller}
                className="script-viewport"
                tabIndex={0}
                aria-label="Script reading area"
                onWheel={() => {
                  setRunning(false);
                  voiceTarget.current = null;
                }}
                onScroll={() => {
                  if (settings.mode === "voice" && running) return;
                  clearTimeout(scrollTimer.current);
                  scrollTimer.current = setTimeout(updateReadingPosition, 80);
                }}
              >
                <ScriptContent
                  paragraphs={paragraphs}
                  settings={settings}
                  height={viewportHeight}
                  elements={wordElements}
                />
              </div>
              {settings.guide && (
                <div
                  className="reading-guide"
                  aria-hidden="true"
                  style={{
                    top: `${settings.anchor}%`,
                    color: settings.foreground,
                  }}
                >
                  <i />
                  <i />
                </div>
              )}
            </>
          )}
        </main>
        <div
          className="divider"
          role="separator"
          aria-label="Right panel divider"
          aria-orientation="vertical"
          aria-valuemin={10}
          aria-valuemax={80}
          aria-valuenow={Math.round(settings.widths[2])}
          tabIndex={0}
          onPointerDown={(e) => {
            e.preventDefault();
            resize("right", e.clientX);
          }}
          onKeyDown={(e) => dividerKeys("right", e)}
        >
          <i />
        </div>
        <section
          aria-label="Right studio light"
          className="light-panel"
          style={{ backgroundColor: lightColor(settings.right) }}
          onContextMenu={(e) => {
            e.preventDefault();
            openSettings("right");
          }}
        />
      </div>
      <header
        className={`toolbar ${chromeVisible ? "" : "is-hidden"}`}
        onFocus={reveal}
        onMouseEnter={reveal}
      >
        <div className="brand">
          <Aperture size={23} />
          <span>
            <strong>Rovidx</strong>
            <span>Teleprompter</span>
          </span>
        </div>
        <span className="toolbar-separator" />
        <button
          className="icon-button"
          aria-label="Open text file"
          title="Open text file (Ctrl+O)"
          disabled={busy}
          onClick={() => void openScript()}
        >
          <FolderOpen size={19} />
        </button>
        <button
          className="icon-button"
          aria-label="Paste text"
          title="Paste text"
          onClick={() => {
            setRunning(false);
            setPaste(true);
          }}
        >
          <ClipboardPaste size={18} />
        </button>
        <span className="script-name" title={script?.name}>
          {script?.name ?? "No script loaded"}
        </span>
        <div className="transport">
          <select
            aria-label="Reading mode"
            value={settings.mode}
            onChange={(e) => {
              setRunning(false);
              setSettings({
                ...settings,
                mode: e.target.value as Settings["mode"],
              });
            }}
          >
            <option value="manual">Manual scroll</option>
            <option value="auto">Auto-scroll</option>
            <option value="voice">Voice following</option>
          </select>
          {settings.mode === "auto" && (
            <label className="speed-control">
              <input
                aria-label="Scroll speed"
                type="number"
                min={5}
                max={200}
                value={settings.speed}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    speed: clamp(Number(e.target.value), 5, 200),
                  })
                }
              />
              <span>px/s</span>
            </label>
          )}
          <button
            className={`play-button ${running ? "active" : ""}`}
            aria-label={running ? "Pause scrolling" : "Start scrolling"}
            disabled={!script || settings.mode === "manual"}
            onClick={toggleRunning}
          >
            {running ? <Pause size={17} /> : <Play size={17} />}
            <span>{starting ? "Starting…" : running ? "Pause" : "Start"}</span>
          </button>
        </div>
        <span className="toolbar-separator" />
        <div className="toolbar-settings">
          <button
            title="Left light settings"
            aria-label="Left light settings"
            className="light-button"
            onClick={() => openSettings("left")}
          >
            <Lightbulb size={17} />
            <span>L</span>
            <i style={{ background: lightColor(settings.left) }} />
          </button>
          <button
            title="Right light settings"
            aria-label="Right light settings"
            className="light-button"
            onClick={() => openSettings("right")}
          >
            <Lightbulb size={17} />
            <span>R</span>
            <i style={{ background: lightColor(settings.right) }} />
          </button>
          <button
            className="icon-button"
            title="Teleprompter settings"
            aria-label="Teleprompter settings"
            onClick={() => openSettings("prompter")}
          >
            <Settings2 size={19} />
          </button>
          <button
            className="icon-button"
            title="Voice settings"
            aria-label="Voice settings"
            onClick={() => openSettings("voice")}
          >
            <Mic size={18} />
          </button>
          <button
            className="icon-button desktop-control"
            title="Choose monitor"
            aria-label="Choose monitor"
            onClick={() => void window.desktop.selectMonitor()}
          >
            <Monitor size={18} />
          </button>
          <button
            className="icon-button"
            title="Fullscreen (F11)"
            aria-label="Toggle fullscreen"
            onClick={() => void window.desktop.fullscreen()}
          >
            <Maximize size={18} />
          </button>
        </div>
      </header>
      {script && (
        <footer className={`statusbar ${chromeVisible ? "" : "is-hidden"}`}>
          <div>
            <span className={`status-dot ${running ? "live" : ""}`} />
            <span>
              {starting
                ? "Connecting microphone"
                : running
                  ? settings.mode === "voice"
                    ? "Listening"
                    : "Scrolling"
                  : "Paused"}
            </span>
            {settings.mode === "voice" && running && (
              <meter
                aria-label="Microphone input level"
                min={0}
                max={1}
                value={level}
              />
            )}
          </div>
          <div className="status-progress">
            <span>{progress}%</span>
            <progress
              aria-label="Reading progress"
              value={progress}
              max={100}
            />
            <span>
              {Math.floor(elapsed / 60)
                .toString()
                .padStart(2, "0")}
              :{(elapsed % 60).toString().padStart(2, "0")}
            </span>
          </div>
          <div className="status-actions">
            <button
              aria-label="Restart script"
              title="Restart script"
              onClick={() => {
                setRunning(false);
                wordIndex.current = 0;
                voiceTarget.current = null;
                setPosition(0);
                setElapsed(0);
                scrollToWord(0);
              }}
            >
              <RotateCcw size={15} />
            </button>
            <span>
              {settings.mode === "manual" ? "↑ ↓ scroll" : "Space to pause"}
              <span className="subtle"> · Right-click for settings</span>
            </span>
          </div>
        </footer>
      )}
      {running && settings.mode === "voice" && heard && chromeVisible && (
        <div className="heard-text" aria-live="off">
          Heard: {heard}
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {tab && (
        <SettingsPanel
          tab={tab}
          setTab={setTab}
          settings={settings}
          setSettings={setSettings}
          model={model}
          onDownload={() =>
            void window.desktop
              .modelDownload()
              .then((result) => {
                if (!result.ok) setError(result.error);
              })
              .catch(() => reportError("Model download failed. Please retry."))
          }
          onCancel={() => void window.desktop.modelCancel()}
          onClose={closeSettings}
        />
      )}
      {paste && (
        <div className="paste-scrim">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="paste-title"
            className="paste-dialog"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                setPaste(false);
              }
            }}
          >
            <div className="panel-heading">
              <div>
                <h2 id="paste-title">Paste your script</h2>
                <p>Plain text is all you need.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Close paste"
                onClick={() => setPaste(false)}
              >
                <X size={20} />
              </button>
            </div>
            <textarea
              ref={pasteRef}
              aria-label="Script text"
              placeholder="Paste the words you want to read…"
              value={pasted}
              maxLength={500000}
              onChange={(e) => setPasted(e.target.value)}
            />
            <footer>
              <span>
                {pasted.trim()
                  ? pasted.trim().split(/\s+/).length.toLocaleString()
                  : 0}{" "}
                words
              </span>
              <button
                className="primary-button"
                disabled={!pasted.trim()}
                onClick={() =>
                  loadScript({
                    name: "Pasted script",
                    text: normalizeText(pasted),
                  })
                }
              >
                Load script
                <ArrowLeft className="arrow-forward" size={16} />
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
