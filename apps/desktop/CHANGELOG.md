# desktop

## 0.0.3

### Patch Changes

- b886fc2: stabilize desktop live transcription reconnect behavior and remove the redundant interruption alert from the bundled transcript UI

## 0.0.2

### Patch Changes

- c5666b9: Ship the first public desktop build of OpenGran.

  - add the initial desktop onboarding flow for transcription permissions
  - use existing desktop configuration by default instead of a setup gate
  - prepare the packaged app for GitHub-based desktop releases and updates

- 762f68a: Move live desktop transcription session ownership into Electron main and harden the macOS packaging path.

  - run native microphone and system-audio capture from the desktop runtime
  - move desktop-native realtime transcription orchestration out of the renderer
  - improve recovery for capture health checks, route changes, and restarts
  - stop mac packaging from failing on icon regeneration by using the committed desktop icon asset
