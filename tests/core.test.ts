import { describe, expect, it } from "vitest";
import {
  defaults,
  lightColor,
  normalizeSettings,
  updateLight,
} from "../shared/settings";
import {
  matchSpeech,
  normalizeText,
  scriptWords,
  tokenize,
} from "../shared/script";

describe("script compatibility", () => {
  it("normalizes BOM and Windows line endings while preserving content", () => {
    expect(normalizeText("\uFEFFHello, world.\r\n\r\n[PAUSE]\rNext.\n")).toBe(
      "Hello, world.\n\n[PAUSE]\nNext.",
    );
  });
  it("preserves every character and maps punctuation, Unicode and hyphenated words", () => {
    const input =
      "It’s a well-paced café script.\n\n<script>alert('hello')</script>";
    const words = scriptWords(input);
    expect(words.map((p) => p.map((w) => w.text).join("")).join("\n\n")).toBe(
      input,
    );
    expect(
      words
        .flat()
        .filter((w) => w.index >= 0)
        .map((w) => w.normalized),
    ).toEqual(tokenize(input));
  });
});
describe("appearance persistence", () => {
  it("recovers defaults from malformed data and constrains dangerous or invalid values", () => {
    expect(normalizeSettings(null)).toEqual(defaults);
    const settings = normalizeSettings({
      fontSize: Infinity,
      widths: [-5, 100, 5],
      foreground: "url(javascript:x)",
      left: { brightness: 500 },
      font: "not installed",
    });
    expect(settings.widths).toEqual([30, 40, 30]);
    expect(settings.foreground).toBe("#ffffff");
    expect(settings.left.brightness).toBe(100);
    expect(settings.fontSize).toBe(54);
    expect(settings.font).toBe("Arial");
  });
  it("adjusts independent and linked lights and dims the rendered color", () => {
    const settings = normalizeSettings(defaults);
    expect(
      updateLight(settings, "left", { color: "#ff0000" }).right.color,
    ).toBe("#ffffff");
    const linked = updateLight({ ...settings, linked: true }, "right", {
      color: "#ff0000",
      brightness: 50,
    });
    expect(linked.left).toEqual(linked.right);
    expect(lightColor(linked.left)).toBe("#800000");
    expect(lightColor({ ...linked.left, enabled: false })).toBe("#000000");
  });
});
describe("local voice alignment", () => {
  const text =
    "Welcome to the studio today we are making a short video about better lighting and clear sound. Take a breath and find your own pace. This is the final sentence in our little script.";
  const script = tokenize(text);
  it("advances on phrases, ignoring case and punctuation", () =>
    expect(matchSpeech(script, "WELCOME to the studio!", 0)).toBe(3));
  it("tolerates a skipped word", () =>
    expect(matchSpeech(script, "we are making short video", 4)).toBe(10));
  it("holds on silence, isolated words and ad-libbing", () => {
    expect(matchSpeech(script, "", 6)).toBeNull();
    expect(matchSpeech(script, "studio", 6)).toBeNull();
    expect(matchSpeech(script, "my coffee is over there", 6)).toBeNull();
  });
  it("does not jump backwards on corrections", () =>
    expect(matchSpeech(script, "welcome to the studio", 5)).toBe(5));
  it("does not find matching material far away in the document", () => {
    expect(
      matchSpeech(
        [
          ...Array(100).fill("filler"),
          ...tokenize("this is the final sentence"),
        ],
        "this is the final sentence",
        0,
      ),
    ).toBeNull();
  });
  it("chooses the nearby repetition over a distant repetition", () => {
    const repeated = tokenize(
      "welcome to our studio today and now we start. welcome to our studio today and now we finish.",
    );
    expect(matchSpeech(repeated, "welcome to our studio", 0)).toBe(3);
  });
});
