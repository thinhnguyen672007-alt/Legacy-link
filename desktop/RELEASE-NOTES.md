Windows and macOS desktop clients for the existing Legacy Link web/backend server.

- Windows x64: download `Legacy-Link-Setup-0.1.4-x64.exe`.
- Apple Silicon (M-series): download the `macOS-arm64.dmg` file.
- Intel Mac: download the `macOS-x64.dmg` file.
- Open the DMG and drag Legacy Link to Applications. ZIP bundles are also provided.
- Enter the web server URL (HTTPS ngrok or LAN); do not append `/api`. Sign in with an account from that server.
- Closing the window keeps alarm monitoring active in the tray/menu bar. Choose Quit to stop. On macOS, clicking the Dock icon restores the window; Command-Q quits.
- macOS has native Edit shortcuts, notifications and window menus. Notification clicks open the alarm view without acknowledging it.

These demo builds have no trusted publisher certificate. macOS uses an ad-hoc signature and is not Apple-notarized; Windows is unsigned. After checking the source/checksums, macOS may require System Settings → Privacy & Security → Open Anyway. Do not disable Gatekeeper globally. Allow notifications for Legacy Link in macOS settings if needed.

Each platform includes SHA-256 checksums and a manifest with the exact source commit. CI verifies the Mac bundle architecture/signature and starts the native Apple Silicon bundle. Real Mac notification permission, Dock/tray interaction and end-to-end alarm delivery still need user acceptance; CI startup is not that proof. No automatic updates or launch-at-login are configured.
