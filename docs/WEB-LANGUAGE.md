# Web language: VI / EN

- Switch at the right of the top bar, beside the account, and above the sign-in form.
- Vietnamese is the default. The selected language is saved under `legacy-link.language` in browser storage. Sessions and credentials remain in memory.
- Switching preserves the session, form values, test results and pending operations. It does not submit configuration or refresh the page.
- Copy is translated with `tr()` and `src/translations.ts`. Call `tr()` when rendering, not when saving form state or API errors. Subscribe to the language in the app root with `useLanguage()`; the switch also subscribes for its selected state.
- Numbers use vi-VN or en-GB. Operational timestamps always use Asia/Ho_Chi_Minh (GMT+7).
- Device names, metric keys, identifiers, protocol values and typed questions remain unchanged. Known backend messages are translated; unknown server details are kept for diagnosis.
- Browser validation messages follow the browser's own language settings.

## Verification

- Frontend regression suite, lint and production build.
- Added checks for preserved inputs/session/draft, localized Modbus and validation errors, formatting, blocked storage and language synchronization across tabs.
- Chromium desktop (1440×1000) and mobile viewport (390×844): sign-in, device list, configuration validation and failed test, alerts, device detail, sign-out and reload. Fixture API only; no actual device configuration sent.
