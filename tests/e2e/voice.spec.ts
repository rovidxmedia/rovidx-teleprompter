import { _electron as electron, expect, test } from "@playwright/test";
import { access, cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("offline voice following through microphone capture and utility process", async () => {
  test.setTimeout(90000);
  const fixture = path.resolve(".runtime/voice-test");
  try {
    await access(path.join(fixture, "sample.wav"));
  } catch {
    test.skip(
      true,
      "Run npm run test:speech to prepare the optional offline speech fixture.",
    );
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), "rovidx-voice-"));
  await cp(path.join(fixture, "models"), path.join(directory, "models"), {
    recursive: true,
  });
  const transcript = await readFile(
    path.join(fixture, "transcript.txt"),
    "utf8",
  );
  await writeFile(
    path.join(directory, "settings.json"),
    JSON.stringify({ settings: { mode: "voice", fontSize: 60 } }),
  );
  const executablePath = process.env.ROVIDX_PACKAGED_EXE;
  const app = await electron.launch({
    executablePath,
    args: [
      ...(executablePath ? [] : ["."]),
      ...(process.env.CI && process.platform === "linux"
        ? ["--no-sandbox"]
        : []),
      `--user-data-dir=${directory}`,
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-audio-capture=${path.join(fixture, "sample.wav")}`,
    ],
    env: { ...process.env },
  });
  try {
    const page = await app.firstWindow();
    await page
      .getByRole("button", { name: "Paste text", exact: true })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Script text" })
      .fill(
        transcript +
          "\n\nAfter that story ends, we will read one more paragraph. This paragraph keeps the teleprompter running while we verify that the microphone stops when paused.",
      );
    await page
      .getByRole("button", { name: "Load script", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Voice settings", exact: true })
      .click();
    await expect(
      page.getByText("English model ready", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close settings" }).click();
    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      (window as any).capturedTracks = [];
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        (window as any).capturedTracks.push(...stream.getTracks());
        return stream;
      };
    });
    await page.getByRole("button", { name: "Start scrolling" }).click();
    await expect(
      page.getByRole("button", { name: "Pause scrolling" }),
    ).toBeVisible();
    await expect
      .poll(
        () => page.locator(".script-viewport").evaluate((el) => el.scrollTop),
        { timeout: 35000 },
      )
      .toBeGreaterThan(80);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.mouse.move(100, 100);
    await page.getByRole("button", { name: "Pause scrolling" }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).capturedTracks.every(
            (track: MediaStreamTrack) => track.readyState === "ended",
          ),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        app.evaluate(({ app }) =>
          app.getAppMetrics().some((p) => p.name === "Rovidx offline speech"),
        ),
      )
      .toBe(false);
    // A previous session's async cleanup must not stop a new session.
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "Start scrolling" }).click();
      await page.getByRole("button", { name: "Pause scrolling" }).click();
    }
    await page.getByRole("button", { name: "Start scrolling" }).click();
    await expect(page.getByText("Listening", { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Pause scrolling" }).click();
    await page.screenshot({
      path: `test-results/voice-${executablePath ? "packaged" : "development"}.png`,
    });
  } finally {
    await app.close();
  }
});
