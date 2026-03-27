---
"desktop": patch
---

Move live desktop transcription session ownership into Electron main and harden the macOS packaging path.

- run native microphone and system-audio capture from the desktop runtime
- move desktop-native realtime transcription orchestration out of the renderer
- improve recovery for capture health checks, route changes, and restarts
- stop mac packaging from failing on icon regeneration by using the committed desktop icon asset
