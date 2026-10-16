import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("physical microphone access and display scaling", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rovidx-hardware-"));
  const executablePath = process.env.ROVIDX_PACKAGED_EXE;
  const app = await electron.launch({
    executablePath,
    args: [
      ...(executablePath ? [] : ["."]),
      `--user-data-dir=${directory}`,
      "--force-device-scale-factor=1.5",
    ],
    env: { ...process.env },
  });
  try {
    const page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Load your script." }),
    ).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(1000, 800),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "test-results/scaling-150.png" });
    const recovered = await app.evaluate(({ BrowserWindow, screen }) => {
      const current = BrowserWindow.getAllWindows()[0];
      const original = screen.getAllDisplays;
      try {
        // Simulate loss of every display that intersects the saved window bounds.
        screen.getAllDisplays = () => [];
        screen.emit("display-removed", {}, screen.getPrimaryDisplay());
        return {
          bounds: current.getBounds(),
          target: screen.getPrimaryDisplay().workArea,
        };
      } finally {
        screen.getAllDisplays = original;
      }
    });
    expect(recovered.bounds).toEqual(recovered.target);
    const result = await page.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        const tracks = stream.getAudioTracks();
        const live =
          tracks.length > 0 && tracks.every((t) => t.readyState === "live");
        tracks.forEach((t) => t.stop());
        return {
          live,
          stopped: tracks.every((t) => t.readyState === "ended"),
          error: "",
        };
      } catch (error) {
        return {
          live: false,
          stopped: true,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    test.skip(
      !result.live,
      `No accessible physical microphone: ${result.error}`,
    );
    expect(result.stopped).toBe(true);
  } finally {
    await app.close();
  }
});
