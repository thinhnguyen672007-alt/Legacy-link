# Legacy Link Desktop

Electron client for the existing Legacy Link web/backend server. Download the Windows x64 installer or a macOS Intel/Apple Silicon DMG from [GitHub Releases](https://github.com/thinhnguyen672007-alt/Legacy-link/releases). ZIP Mac bundles are also available. The installer requires no Node.js on the user's computer.

## Connect and use

1. Windows: run the EXE; it installs for the current user without choosing a folder. Mac: open the DMG and drag Legacy Link to Applications.
2. Open the app and sign in with your team's account. Windows and Mac always load **https://vineyard-fifteen-elusive.ngrok-free.dev**; API and alarm polling use that origin's `/api`.
3. If Internet/the tunnel/server is unavailable (including HTTP errors), the app shows a local error page with **Thử lại**. Retry always uses the same fixed domain. No server-address form or change-server menu exists.

Version 0.1.5 ignores the old `server.json`; it does not read, migrate or overwrite user passwords/server configuration. The hosted frontend must deploy this PR too to remove its old advanced connection control. Browser production uses its own origin's `/api`: ngrok web uses ngrok, localhost continues using the local server; dev Vite retains `VITE_API_BASE_URL` for local/test development.

Closing the window keeps alarm monitoring active in the tray/menu bar. Choose Quit to stop it. The main process keeps tokens only in memory; the hosted web frontend uses sessionStorage for reload, validates with the server, and clears on logout/expiry. Quit/restart requires login. A new domain requires a new desktop build. Desktop requests to the fixed domain include ngrok's documented `ngrok-skip-browser-warning` header so first launch goes straight to the web login rather than the free tunnel interstitial.

Alarm polling covers the most recent 24 hours, normally every five seconds, with backoff on network errors. The first pass establishes a baseline without notifying historical alarms. Clicking a notification opens the alarm view but does not ACK it. More than three alarms per pass produce one summary notification. Test notifications are explicitly labeled and do not prove ESP32 connectivity.

## macOS demo distribution

Choose **arm64** for Apple Silicon (M-series) or **x64** for Intel. Mac builds use an ad-hoc signature, without an Apple Developer certificate or notarization; Windows builds are unsigned. Verify the release checksum, then use System Settings → Privacy & Security → Open Anyway if macOS blocks the first launch. Do not disable Gatekeeper globally. Allow Legacy Link notifications in system settings if prompted or if notifications are disabled.

There is no auto-update or automatic startup. Build/startup checks do not replace testing notifications, Dock/menu-bar behavior and real alarms on a user's Mac.

## Build and release

Use Node 22+ and run `npm ci` and `npm test` in `desktop`.

- Windows x64: `npm run dist:win` on Windows.
- Apple Silicon: `npm run dist:mac -- --arm64` on macOS.
- Intel Mac: `npm run dist:mac -- --x64` on macOS.

The Mac build generates its ICNS icon with macOS `sips`/`iconutil`. Dependencies are pinned in the lockfile. The **Desktop app** workflow builds Windows x64 and both Mac architectures, verifies Mac binary architecture/signature and launches the native Apple Silicon bundle. Each artifact includes SHA-256 checksums and a source manifest. Pushing `desktop-v<package version>` publishes all successful builds to GitHub Releases; no release is published if any build fails. Branch/PR runs only upload build artifacts.

Prior Windows 0.1.3 VM acceptance is recorded in [Windows validation](../docs/WINDOWS-APP-VALIDATION.md). Version 0.1.4 introduces macOS support; see [release notes](RELEASE-NOTES.md) for verification limits.


## Shared logo

The canonical green Unplug mark from the supplied login reference is `frontend/public/legacy-link.svg` (#00ed77, transparent background). Login/sidebar/favicons/README use that SVG. Desktop window/tray/toasts/offline page use `assets/icon.png`; Windows installer/shortcuts use `assets/icon.ico`; the Mac build makes ICNS from the same PNG. Keep these derivatives together when changing the mark:

```sh
# From repository root, with librsvg and ImageMagick installed:
rsvg-convert -w 1024 -h 1024 frontend/public/legacy-link.svg -o desktop/assets/icon.png
magick desktop/assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 desktop/assets/icon.ico
```

Notification failures remain visible in the desktop status and tray. Failed alarms are retried after at least one minute while the session remains active and the alarm is within the 24-hour polling window. Successful native delivery confirmation prevents duplicate retries; it does not prove a banner was visible when Focus mode is enabled. **Thử thông báo** displays the native failure reason if delivery fails or no confirmation arrives within ten seconds. Logs include notification errors, without API tokens.
