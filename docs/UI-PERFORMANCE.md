# UI performance changes

The web UI and desktop client share the same server-hosted interface. These changes preserve the existing artwork, blur, navigation animation, login transition timing and alarm monitoring.

- Memoize the backdrop so route changes do not reconcile its 118 SVG paths.
- Pause decorative animation while the document is hidden; resume its existing phase when visible.
- Confine background painting and provide compositing hints only for the three animated SVG groups. Browser/GPU implementations decide whether to promote these groups.
- Load the commissioning page on demand.
- Compress text assets through nginx; retain immutable caching for hashed assets.

Validation on 2026-10-11: 101 frontend tests, production build, lint and both desktop test files passed. Local browser inspection retained all 118 paths and all three animated groups. The initial JavaScript bundle decreased from 589,712 to approximately 567,880 bytes before compression. The deployed ngrok response used gzip and transferred 204,937 bytes for that bundle. These are payload measurements, not a measured FPS improvement.

Real-device GPU frame-time comparison remains necessary to quantify smoothness. Existing Windows/macOS clients receive these web changes from the server without a new installer. No native graphics acceleration flags, notification polling or security settings were changed.
