## Download

| Your computer | Installer |
|---|---|
| Windows 10/11 · 64-bit | [Download for Windows](https://github.com/thinhnguyen672007-alt/Legacy-link/releases/download/desktop-v0.1.5/Legacy-Link-Setup-0.1.5-x64.exe) |
| Mac · Apple Silicon (M-series) | [Download for Apple Silicon](https://github.com/thinhnguyen672007-alt/Legacy-link/releases/download/desktop-v0.1.5/Legacy-Link-0.1.5-macOS-arm64.dmg) |
| Mac · Intel | [Download for Intel Mac](https://github.com/thinhnguyen672007-alt/Legacy-link/releases/download/desktop-v0.1.5/Legacy-Link-0.1.5-macOS-x64.dmg) |

**Install:** Windows: run the installer. Mac: open the DMG and drag Legacy Link to Applications. Open the app and sign in with your team's account. Windows and Mac automatically connect to https://vineyard-fifteen-elusive.ngrok-free.dev; no server setup is required. Windows installs for the current user in one step. If the server is unavailable, use **Thử lại**.

These demo installers are unsigned / not Apple-notarized. On Mac, you may need **System Settings → Privacy & Security → Open Anyway**. Keep Gatekeeper enabled.

Closing the window keeps alarm monitoring in the tray/menu bar. Choose **Quit** to stop it. The app loads the server's current web interface, so web improvements do not require reinstalling the desktop client.

<details>
<summary>Technical files and verification</summary>

ZIP files are alternative Mac app bundles. Platform SHA256SUMS files verify downloads; manifests identify the exact installer source commit. These files are optional for normal installation.

CI checks Mac architecture/signature and native Apple Silicon startup. Real-device notification permissions and alarm delivery require acceptance testing. Automatic updates and launch-at-login are not configured.

</details>
