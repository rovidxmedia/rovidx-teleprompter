import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let app: ElectronApplication, page: Page, directory: string;
test.beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "rovidx-e2e-"));
  const executablePath = process.env.ROVIDX_PACKAGED_EXE;
  app = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${directory}`],
    env: { ...process.env },
  });
  page = await app.firstWindow();
  await expect(
    page.getByRole("heading", { name: "Load your script." }),
  ).toBeVisible();
});
test.afterAll(async () => {
  await app?.close();
});
async function pasteScript(text: string) {
  await page
    .getByRole("button", { name: "Paste text", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Script text" }).fill(text);
  await page.getByRole("button", { name: "Load script", exact: true }).click();
}
test("welcome layout and accessible light controls", async () => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(3440, 1440),
  );
  await page.screenshot({ path: "test-results/welcome-3440.png" });
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 900),
  );
  await page
    .getByRole("button", { name: "Left light settings", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Light color hex", exact: true })
    .fill("#ff0000");
  await expect(
    page.getByRole("region", { name: "Left studio light" }),
  ).toHaveCSS("background-color", "rgb(204, 0, 0)");
  await expect(
    page.getByRole("region", { name: "Right studio light" }),
  ).toHaveCSS("background-color", "rgb(204, 204, 204)");
  await page.getByRole("button", { name: "Link both lights" }).click();
  await expect(
    page.getByRole("region", { name: "Right studio light" }),
  ).toHaveCSS("background-color", "rgb(204, 0, 0)");
  await page.getByRole("button", { name: "Neutral", exact: true }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page
    .getByRole("region", { name: "Right studio light" })
    .click({ button: "right" });
  await expect(
    page.getByRole("heading", { name: "Right studio light", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});
test("file cancel, empty, UTF-8 and literal HTML handling", async () => {
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await page
    .getByRole("button", { name: "Open text file", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Load your script." }),
  ).toBeVisible();
  const empty = path.join(directory, "empty.txt");
  await writeFile(empty, "");
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, empty);
  await page
    .getByRole("button", { name: "Open text file", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("empty");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  const filename = path.join(directory, "sample.txt");
  await writeFile(
    filename,
    "\uFEFFHello café.\r\n\r\n<script>window.hacked = true</script>",
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, filename);
  await page
    .getByRole("button", { name: "Open text file", exact: true })
    .first()
    .click();
  await expect(page.locator(".script-content")).toContainText(
    "<script>window.hacked = true</script>",
  );
  expect(await page.evaluate(() => (window as any).hacked)).toBeUndefined();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
});
test("manual scrolling, automatic movement, pause and resize retain location", async () => {
  await pasteScript(
    Array.from(
      { length: 40 },
      (_, i) =>
        `Paragraph ${i + 1}. Welcome to our studio. We are making a video with a little more light and a clear voice.`,
    ).join("\n\n"),
  );
  await page.locator(".script-viewport").focus();
  await page.keyboard.press("ArrowDown");
  expect(
    await page.locator(".script-viewport").evaluate((el) => el.scrollTop),
  ).toBeGreaterThan(20);
  await page
    .getByRole("combobox", { name: "Reading mode", exact: true })
    .selectOption("auto");
  await page.getByRole("button", { name: "Start scrolling" }).click();
  const before = await page
    .locator(".script-viewport")
    .evaluate((el) => el.scrollTop);
  await expect
    .poll(() => page.locator(".script-viewport").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(before + 20);
  await page.locator(".script-viewport").dispatchEvent("wheel", { deltaY: 50 });
  await expect(
    page.getByRole("button", { name: "Start scrolling" }),
  ).toBeVisible();
  const paused = await page
    .locator(".script-viewport")
    .evaluate((el) => el.scrollTop);
  await page.waitForTimeout(250);
  expect(
    await page.locator(".script-viewport").evaluate((el) => el.scrollTop),
  ).toBeCloseTo(paused, 0);
  await page.getByRole("separator", { name: "Left panel divider" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("separator", { name: "Left panel divider" }),
  ).toHaveAttribute("aria-valuenow", "31");
  await page.getByRole("button", { name: "Teleprompter settings" }).click();
  await page
    .getByRole("button", { name: "Above monitor", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Reading line position" }),
  ).toHaveValue("22");
  await page.getByRole("button", { name: "Close settings" }).click();
});
test("voice setup and ultrawide layouts", async () => {
  await page
    .getByRole("button", { name: "Voice settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download voice model", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  for (const [width, height] of [
    [1440, 900],
    [3440, 1440],
    [5120, 1440],
  ]) {
    await app.evaluate(
      ({ BrowserWindow }, { width, height }) =>
        BrowserWindow.getAllWindows()[0].setSize(width, height),
      { width, height },
    );
    await page.waitForTimeout(150);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await page.locator(".reader").boundingBox();
    expect(box!.width).toBeGreaterThan(width * 0.3);
    await page.screenshot({ path: `test-results/reading-${width}.png` });
  }
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1440, 900),
  );
  await page
    .getByRole("button", { name: "Paste text", exact: true })
    .first()
    .click();
  await page.screenshot({ path: "test-results/paste-1440.png" });
  await page.getByRole("button", { name: "Close paste" }).click();
  await page.waitForTimeout(400);
  const state = JSON.parse(
    await readFile(path.join(directory, "settings.json"), "utf8"),
  );
  expect(state.settings.anchor).toBe(22);
  expect(state.settings.linked).toBe(true);
});
test("end of script stops, input fields keep shortcuts, and fullscreen exits", async () => {
  await pasteScript("This is a short script for testing.");
  await page
    .getByRole("combobox", { name: "Reading mode", exact: true })
    .selectOption("auto");
  await page.locator(".script-viewport").focus();
  await page.keyboard.press("End");
  await page.getByRole("button", { name: "Start scrolling" }).click();
  await expect(
    page.getByRole("button", { name: "Start scrolling" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Paste text", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Script text" }).fill("Typing here");
  await page.keyboard.press("Space");
  await page.keyboard.type("works");
  await expect(page.getByRole("textbox", { name: "Script text" })).toHaveValue(
    "Typing here works",
  );
  await page.keyboard.press("Escape");
  await page.locator(".script-viewport").focus();
  await page.keyboard.press("F11");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isFullScreen(),
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isFullScreen(),
      ),
    )
    .toBe(false);
});
test("preferences and recent files survive relaunch while the script stays paused", async () => {
  await app.close();
  const executablePath = process.env.ROVIDX_PACKAGED_EXE;
  app = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${directory}`],
    env: { ...process.env },
  });
  page = await app.firstWindow();
  await expect(
    page.getByRole("heading", { name: "Load your script." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "sample.txt" })).toBeVisible();
  await page.getByRole("button", { name: "Teleprompter settings" }).click();
  await expect(
    page.getByRole("slider", { name: "Reading line position" }),
  ).toHaveValue("22");
  await page.getByRole("button", { name: "Close settings" }).click();
  // Remove the source through the test harness to exercise stale recent-file recovery.
  const { unlink } = await import("node:fs/promises");
  await unlink(path.join(directory, "sample.txt"));
  await page.getByRole("button", { name: "sample.txt" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Could not open the script",
  );
});
