# Legacy Link Desktop

Electron client for the existing Legacy Link web/backend server. Download the Windows x64 installer or a macOS Intel/Apple Silicon DMG from [GitHub Releases](https://github.com/thinhnguyen672007-alt/Legacy-link/releases). ZIP Mac bundles are also available. The installer requires no Node.js on the user's computer.

## Connect and use

1. Install the Windows EXE, or open the Mac DMG and drag Legacy Link to Applications.
2. Enter the **web URL**, such as an HTTPS ngrok address or `http://192.168.1.13:8080`, without `/api`. `localhost` means the computer running the app, not the backend laptop.
3. Sign in with an account from that server. The server must have the frontend desktop bridge deployed and allow the web origin.

Closing the window hides it and keeps alarm monitoring active in the tray/menu bar. Open Dashboard restores it. On macOS, the Dock icon restores the app and Command-Q quits; native Edit shortcuts allow pasting the URL/password. Choose Quit to stop monitoring. The native app stores only the server URL. The web frontend stores the account token in sessionStorage to survive reload, validates it with the server before restoring the dashboard, and clears it on logout/expiry. Quitting and restarting the app still requires login.

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
