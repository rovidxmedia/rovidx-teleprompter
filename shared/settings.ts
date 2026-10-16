import type { LightSettings, Settings } from "./types";
export const defaults: Settings = {
  left: { color: "#ffffff", brightness: 80, enabled: true },
  right: { color: "#ffffff", brightness: 80, enabled: true },
  linked: false,
  widths: [30, 40, 30],
  background: "#000000",
  foreground: "#ffffff",
  font: "Arial",
  fontSize: 54,
  lineHeight: 1.5,
  paragraphGap: 1,
  textWidth: 86,
  anchor: 50,
  guide: true,
  speed: 45,
  mode: "manual",
  microphone: "",
};
export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? clamp(value, min, max)
    : fallback;
const color = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
function light(value: any, fallback: LightSettings): LightSettings {
  return {
    color: color(value?.color, fallback.color),
    brightness: number(value?.brightness, fallback.brightness, 0, 100),
    enabled:
      typeof value?.enabled === "boolean" ? value.enabled : fallback.enabled,
  };
}
export function normalizeSettings(value: any): Settings {
  const source = value && typeof value === "object" ? value : {};
  let widths: Settings["widths"] = [...defaults.widths];
  if (
    Array.isArray(source.widths) &&
    source.widths.length === 3 &&
    source.widths.every(
      (n: unknown) =>
        typeof n === "number" && Number.isFinite(n) && n >= 10 && n <= 80,
    ) &&
    Math.abs(source.widths.reduce((a: number, b: number) => a + b, 0) - 100) <
      0.1
  )
    widths = [...source.widths] as Settings["widths"];
  return {
    left: light(source.left, defaults.left),
    right: light(source.right, defaults.right),
    linked: source.linked === true,
    widths,
    background: color(source.background, defaults.background),
    foreground: color(source.foreground, defaults.foreground),
    font: ["Arial", "Georgia", "Verdana", "Tahoma", "Trebuchet MS"].includes(
      source.font,
    )
      ? source.font
      : defaults.font,
    fontSize: number(source.fontSize, 54, 24, 120),
    lineHeight: number(source.lineHeight, 1.5, 1.1, 2.5),
    paragraphGap: number(source.paragraphGap, 1, 0.3, 3),
    textWidth: number(source.textWidth, 86, 40, 96),
    anchor: number(source.anchor, 50, 15, 75),
    guide: source.guide !== false,
    speed: number(source.speed, 45, 5, 200),
    mode: ["manual", "auto", "voice"].includes(source.mode)
      ? source.mode
      : "manual",
    microphone:
      typeof source.microphone === "string"
        ? source.microphone.slice(0, 500)
        : "",
  };
}
export function updateLight(
  settings: Settings,
  side: "left" | "right",
  patch: Partial<LightSettings>,
): Settings {
  const next = { ...settings[side], ...patch };
  return {
    ...settings,
    [side]: next,
    ...(settings.linked ? { left: next, right: next } : {}),
  };
}
export function lightColor(light: LightSettings): string {
  if (!light.enabled) return "#000000";
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          (parseInt(light.color.slice(i, i + 2), 16) * light.brightness) / 100,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
