# Validation — Rovidx Teleprompter 1.0.0

Verified on Windows x64 on October 16, 2026.

## Passed

- Production TypeScript and Vite build; native `sherpa-onnx-node` loading.
- 12 unit tests covering script normalization and literal content, Unicode/hyphen token mapping, settings recovery, independent/linked light behavior, phrase following, corrections, omissions, repeated phrases, corrupt model downloads, cancellation, cleanup, and retry.
- Eight desktop integration tests against both the development build and packaged executable: loading/pasting/cancellation, empty and stale files, BOM and Unicode, literal HTML display, light controls, resizing, manual and automatic scrolling, pause and end-of-script stopping, camera presets, input shortcuts, fullscreen, preference persistence, offline voice capture and following, rapid voice pause/resume, and microphone shutdown.
- Layout inspection at 1440×900, 3440×1440, and 5120×1440; an additional 1000×800 window with 150% display scaling. Previews are saved in `artifacts/`.
- Actual physical microphone permission, live audio-track creation, and track shutdown on this machine. Speech accuracy and following were tested with a public reference recording streamed through Chromium's microphone capture path.
- Simulated display removal exercises recovery onto the primary monitor's working area.
- Pinned model download and SHA-256 verification, followed by native offline decoding of the reference recording.
- Windows installer and portable executable generated with the Rovidx app name, metadata, and original aperture icon. Both builds are unsigned.
- Portable executable startup, pasted script loading, bundled native speech loading, and microphone-driven scrolling verified through a direct browser debugging connection.
- Companion Codex skill validated with `quick_validate.py` and installed in the local Codex skills directory.

## Reproduce

```powershell
npm.cmd test
npm.cmd run test:speech
npm.cmd run test:e2e
npm.cmd run package
$env:ROVIDX_PACKAGED_EXE = Join-Path (Get-Location) 'release\win-unpacked\Rovidx Teleprompter.exe'
npx.cmd playwright test
Remove-Item Env:ROVIDX_PACKAGED_EXE
node scripts/check-portable.cjs
node scripts/capture-preview.cjs
```

The portable smoke test uses a browser debugging connection because the NSIS launcher does not forward Electron's debugger output to Playwright's normal Electron launcher. It starts an isolated instance, verifies text loading and microphone-driven offline recognition using the public fixture, and closes the test window.

## Limits

Installer installation/uninstallation and a physical monitor unplug/replug were not performed. Live spoken recognition accuracy depends on the microphone, voice, background noise, and wording; automated voice checks use a known reference recording. Code signing and automatic updates are not configured.

## Public cross-platform builds

The [GitHub Actions workflow](https://github.com/rovidxmedia/rovidx-teleprompter/actions/workflows/build.yml) runs the unit suite, native offline decoding, and packaged voice-following smoke test on Windows x64, macOS ARM64 and x64, and Linux ARM64 and x64. Branch checks package application directories; version tags also produce installers and archives. Release publication requires every native job to pass.

Microphone processing uses Chromium's silent audio sink so the capture worklet does not depend on a speaker/output device. Hosted-runner speech tests use a public audio fixture rather than a physical microphone. Windows and Linux use Chromium's simulated input device; Mac tests provide a WAV-backed MediaStream because the hosted virtual microphone can return silence. Both paths exercise the application's worklet, IPC, native recognizer, matching, scrolling, and pause cleanup. See the linked workflow for current results; the Windows hardware checks above describe the initial local validation.
