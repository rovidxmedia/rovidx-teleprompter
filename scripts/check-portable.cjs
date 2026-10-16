// Attach to a portable app launched with --remote-debugging-port=0. NSIS does not forward
// Electron's debugger stderr, so Playwright's regular Electron launcher cannot attach to it.
const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
async function main() {
  const directory =
    process.argv[2] ||
    (await fs.mkdtemp(path.join(os.tmpdir(), "rovidx-portable-")));
  let child;
  if (!process.argv[2]) {
    await fs.cp(
      path.resolve(".runtime/voice-test/models"),
      path.join(directory, "models"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(directory, "settings.json"),
      JSON.stringify({ settings: { mode: "voice", fontSize: 60 } }),
    );
    child = spawn(
      path.resolve("release/Rovidx-Teleprompter-Windows-x64-Portable.exe"),
      [
        `--user-data-dir=${directory}`,
        "--remote-debugging-port=0",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        `--use-file-for-fake-audio-capture=${path.resolve(".runtime/voice-test/sample.wav")}`,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    child.on("error", (error) => {
      console.error(error);
    });
  }
  let available = false;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      await fs.access(path.join(directory, "DevToolsActivePort"));
      available = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!available) {
    child?.kill();
    throw new Error(
      `Portable app did not expose its test port. User data: ${directory}`,
    );
  }
  const port = (
    await fs.readFile(path.join(directory, "DevToolsActivePort"), "utf8")
  ).split("\n")[0];
  // Attaching while Electron is still creating its first target can pause startup.
  // Wait for the real application page before enabling CDP auto-attachment.
  let pageReady = false;
  const targetDeadline = Date.now() + 30000;
  while (Date.now() < targetDeadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(
      (response) => response.json(),
    );
    if (
      targets.some(
        (target) =>
          target.type === "page" && target.url.endsWith("/dist/index.html"),
      )
    ) {
      pageReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!pageReady) {
    child?.kill();
    throw new Error("Portable app did not finish opening its window.");
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    const context = browser.contexts()[0];
    const page =
      context.pages()[0] ||
      (await context.waitForEvent("page", { timeout: 30000 }));
    await expect(
      page.getByRole("heading", { name: "Load your script." }),
    ).toBeVisible();
    const transcript = await fs.readFile(
      path.resolve(".runtime/voice-test/transcript.txt"),
      "utf8",
    );
    await page
      .getByRole("button", { name: "Paste text", exact: true })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Script text" })
      .fill(
        transcript +
          "\n\nThis is another paragraph to keep the script open while we finish our test.",
      );
    await page
      .getByRole("button", { name: "Load script", exact: true })
      .click();
    await page.getByRole("button", { name: "Start scrolling" }).click();
    await expect
      .poll(
        () => page.locator(".script-viewport").evaluate((el) => el.scrollTop),
        { timeout: 30000 },
      )
      .toBeGreaterThan(80);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.mouse.move(100, 100);
    await page.getByRole("button", { name: "Pause scrolling" }).click();
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/portable-voice.png" });
    console.log(
      "Portable executable: startup, script load, bundled native speech, and microphone-driven scrolling passed.",
    );
    await page.close();
  } finally {
    for (const page of browser.contexts().flatMap((context) => context.pages()))
      await page.close().catch(() => {});
    await browser.close();
    child?.unref();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
