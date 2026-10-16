const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const executable =
  process.platform === "win32"
    ? "release/win-unpacked/Rovidx Teleprompter.exe"
    : process.platform === "darwin"
      ? `release/${process.arch === "arm64" ? "mac-arm64" : "mac"}/Rovidx Teleprompter.app/Contents/MacOS/Rovidx Teleprompter`
      : `release/${process.arch === "arm64" ? "linux-arm64-unpacked" : "linux-unpacked"}/rovidx-teleprompter`;
if (!fs.existsSync(executable))
  throw new Error(`Packaged executable not found: ${executable}`);
const result = spawnSync(
  process.execPath,
  [require.resolve("@playwright/test/cli"), "test", "tests/e2e/voice.spec.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, ROVIDX_PACKAGED_EXE: path.resolve(executable) },
    windowsHide: true,
  },
);
process.exitCode = result.status ?? 1;
