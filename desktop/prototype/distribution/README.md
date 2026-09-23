# Desktop distribution

This folder packages the current application with the locally installed, pinned Electron 44.4.3 runtime. It does not sign, notarize, install the app, upload, or publish a release. The Windows recipe temporarily installs the exact official resource editor required to stamp the executable icon.

## macOS

Run from the engine repository:

```sh
node desktop/prototype/distribution/package.cjs
node desktop/prototype/distribution/smoke.cjs
```

Output: `.local/distribution/Travel Planner.app`. The bundle identifier is `app.travelplanner.desktop`; the bundled ICNS is the selected v2 logo on its rounded macOS background. The smoke check launches this artifact using disposable app state, checks the actual rendered composer and preload bridge over an ephemeral localhost debugging connection, then terminates only its own child and removes its state. It never connects an existing project or account.

The app is **unsigned and not notarized**. It is a local development artifact, not a signed public release. Apple Developer credentials and the release owner's authorization are required for a later signing/notarization release step. Helpers retain the Electron runtime's original names/signatures; the outer bundle's original resource signature is removed after rebranding.

The packager refuses to replace an existing artifact. For an incremental local rebuild of owned application code (without recopying Electron), call the exported `copyRuntime(resourcesAppDirectory)` from a Node script while that artifact is closed. A clean build is required when dependencies are removed or platform changes.

## Windows portable build

Use a native Windows checkout with Node.js and run `npm run desktop:setup` first. This installs the Windows Electron/runtime binaries; copying a macOS `node_modules` directory is not supported.

```powershell
powershell -ExecutionPolicy Bypass -File desktop/prototype/distribution/build-windows.ps1
node desktop/prototype/distribution/smoke.cjs '.local/distribution/Travel Planner-win-x64'
```

The PowerShell recipe produces a portable folder, ZIP and SHA-256 checksum without requiring an installer service. Run `Travel Planner.exe` after extracting the ZIP. The application UI/window uses the bundled v2 logo. The recipe temporarily installs official `rcedit@5.0.2` (vendored native rcedit 2.0.0), verifies its pinned version and npm integrity, and stamps the v2 ICO and Travel Planner version metadata into the copied executable. Resource editing failure stops the build before ZIP generation; it never silently keeps the Electron icon. The temporary tool is deleted afterward. Signing an installer remains a separate release step. Native Windows execution and its packaging recipe have not been validated on macOS.

## Included application files

The allowlist includes `desktop/prototype` runtime code/assets, the project metadata inspector, `packages/engine`, `src`, `public`, trusted script libraries/templates/schema documents, deployment scripts and pre-push protection. Runtime dependency closure includes the engine workspace, Acorn, pngjs and Wrangler, including installed platform dependencies. Imported project scripts are never copied into the application.

It excludes trips, app account profiles, chat/attachment state, local backups, `.git`, `.local`, tests, smoke scripts and developer dependencies such as Electron's npm downloader. The app runtime is separate from all user-selected private project content.

## Environment and release checks

`services/environment.cjs` exports:

- `inspectEnvironment()` reports installed Codex version for diagnosis (not as an allowlist), Git, GitHub CLI and bundled Wrangler, plus official setup links. It never installs anything and does not expose raw failed command output.
- `checkForUpdates()` reads only the public `wangch15/travel-planner` releases API, accepts stable tags named `desktop-vX.Y.Z`, verifies each release/download URL belongs to that exact repository, and returns metadata. Engine-only releases are ignored. No automatic download or replacement occurs.

## Primary references

- [Electron manual application packaging](https://www.electronjs.org/docs/latest/tutorial/application-distribution)
- [GitHub REST releases](https://docs.github.com/en/rest/releases/releases)
- [Cloudflare Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

- [Official Electron node-rcedit documentation](https://github.com/electron/node-rcedit) and [native rcedit 2.0.0 release](https://github.com/electron/rcedit/releases/tag/v2.0.0). Both upstream repositories were archived in April 2026; this build pins the reviewed available release.

## Signed installers and native updates

The runtime now includes pinned `electron-updater@6.8.9`. `services/updater.cjs` provides `UpdateManager` with explicit `check()`, `download()` and `install()` operations and `changed` events. Both `autoDownload` and `autoInstallOnAppQuit` remain false. The host must drain pending application writes before calling `install()`.

`check()` first reads the approved public release metadata, then configures a generic native provider for that **exact** `desktop-vX.Y.Z` GitHub download folder. Native version, file URLs, sizes and SHA-512 metadata must match the approved release assets before a download starts. Downgrade, prerelease, web installers and differential downloads are disabled. Native checksum/signature checking is retained. On macOS the native Squirrel signature check runs when the explicit install handoff begins; a downloaded ZIP alone is not claimed to have completed that native signature check.

Development builds, unsigned macOS bundles, portable Windows builds, missing update configuration, or Windows installations without a matching verified publisher are explicitly **manual-only**. macOS requires a valid Developer ID signature. Windows requires an NSIS installation, `publisherName` in `app-update.yml`, and a valid current Authenticode signature from that publisher.

For a signed release, the release owner supplies credentials through the environment and runs:

```sh
node desktop/prototype/distribution/build-installers.cjs
```

This recipe temporarily installs exact `electron-builder@26.15.3`, runs the signing/notarization `--dir` phase against the allowlisted runtime, then uses `--prepackaged` to create macOS DMG+ZIP or Windows NSIS and update YAML under `.local/installers`. Every invocation uses `--publish never`. No credentials are embedded into the repository or artifacts. Missing signing/notarization credentials stop the recipe instead of silently producing an unsigned update release. The tool installation is removed afterward.

Required release environment:

- macOS: `CSC_LINK` (and `CSC_KEY_PASSWORD` as needed) or `CSC_NAME`, plus Apple notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`; or Apple's API key variables).
- Windows: `CSC_LINK`/certificate password and `TRAVEL_PLANNER_WINDOWS_PUBLISHER` matching the signing certificate.

Signed installer creation, notarization and a real published update cycle remain untested until the owner provides signing credentials and approves a release. No signing service account is created by this recipe.

For an **unsigned local test** DMG without signing credentials:

```sh
node desktop/prototype/distribution/build-local-dmg.cjs
```

This uses macOS `hdiutil`, includes the existing `.app` plus an Applications shortcut, verifies the disk image and marks the artifact `unsigned`. It does not create update YAML or claim automatic-update capability.

Primary references: [electron-builder automatic updates](https://www.electron.build/docs/features/auto-update/), plus the installed `electron-updater@6.8.9` implementation (current online documentation also describes v7 features that this app does not use).
