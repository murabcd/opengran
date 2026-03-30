# OpenGran Browser Extension

This extension detects open browser meeting tabs and reports them to the OpenGran desktop app over the local desktop bridge.

## Supported providers

- Google Meet
- Yandex Telemost
- Zoom web meetings
- Microsoft Teams web meetings

## Development

```bash
cd apps/extension
bun run build
```

Load `apps/extension/dist` as an unpacked extension in a Chromium-based browser.

The desktop app listens on `127.0.0.1` using the first available port in the `42831-42850` range. The extension probes that range automatically and posts meeting-tab snapshots into the desktop bridge.
