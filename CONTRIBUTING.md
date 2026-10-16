# Contributing

Thanks for helping improve Rovidx Teleprompter, a project by [Rovidx](https://rovidx.com).

For a bug, open an issue with your operating system, processor architecture, app version, steps to reproduce, and the expected and actual behavior. Include a screenshot when useful. Use a short, non-sensitive sample script; do not upload microphone recordings or private scripts by default.

Discuss substantial features in an issue before starting a large change. For fixes, fork the repository, create a branch, and submit a focused pull request describing what changed and how you tested it.

## Development

Use Node.js 22.12 or newer and run `npm ci`, `npm run dev`, `npm test`, and `npm run build`. Native dependencies are platform-specific: package and test on the operating system and architecture you intend to ship.

Run `npm run test:speech` to download the public speech fixture, then `npm run test:e2e`. After packaging, `npm run test:packaged` verifies the bundled speech worker. Linux desktop tests need a display; CI uses `xvfb-run -a` and disables the operating-system sandbox only for its isolated test process.

Keep script wording intact, microphone processing local, renderer privileges limited, and settings backward compatible. Avoid committing generated builds, speech models, credentials, or personal recordings. Format changed source files with Prettier. Contributions are licensed under the repository's MIT license.

## Releases

Update `package.json`, the lockfile, and `docs/RELEASE_NOTES.md`, then push a matching `vX.Y.Z` tag. The release workflow builds and tests each platform on its own runner. Only after all builds and packaged voice checks pass does it publish the complete release and checksums. Asset names stay stable so the README's latest-download links remain valid.
