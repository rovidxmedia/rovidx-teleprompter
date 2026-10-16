const { _electron: electron } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rovidx-preview-"));
  const app = await electron.launch({
    executablePath: path.resolve(
      "release/win-unpacked/Rovidx Teleprompter.exe",
    ),
    args: [`--user-data-dir=${directory}`],
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("heading", { name: "Load your script." }).waitFor();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setSize(3440, 1440),
    );
    await fs.mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/welcome.png" });
    await app.evaluate(({ dialog }, filename) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [filename],
      });
    }, path.resolve("examples/welcome.teleprompter.txt"));
    await page
      .getByRole("button", { name: "Open text file", exact: true })
      .first()
      .click();
    await page.locator(".script-content").waitFor();
    await page.locator(".script-viewport").evaluate((element) => {
      element.scrollTop = 280;
    });
    await page.screenshot({ path: "artifacts/reading.png" });
    await page.getByRole("button", { name: "Teleprompter settings" }).click();
    await page.screenshot({ path: "artifacts/settings.png" });
    console.log("Saved app previews to artifacts/.");
  } finally {
    await app.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
