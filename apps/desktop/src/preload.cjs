const { contextBridge, ipcRenderer } = require("electron");
const microphoneCaptureEventChannel = "app:microphone-capture-event";
const systemAudioCaptureEventChannel = "app:system-audio-capture-event";
const desktopRealtimeTransportEventChannel =
	"app:desktop-realtime-transport-event";
const transcriptionSessionStateChannel = "app:transcription-session-state";
const transcriptionSessionEventChannel = "app:transcription-session-event";

contextBridge.exposeInMainWorld("openGranDesktop", {
	platform: process.platform,
	getMeta: () => ipcRenderer.invoke("app:get-meta"),
	getRuntimeConfig: () => ipcRenderer.invoke("app:get-runtime-config"),
	authFetch: (request) => ipcRenderer.invoke("app:auth-fetch", request),
	getPermissionsStatus: () => ipcRenderer.invoke("app:get-permissions-status"),
	getAuthCallbackUrl: () => ipcRenderer.invoke("app:get-auth-callback-url"),
	getShareBaseUrl: () => ipcRenderer.invoke("app:get-share-base-url"),
	openExternalUrl: (url) => ipcRenderer.invoke("app:open-external-url", url),
	requestPermission: (permissionId) =>
		ipcRenderer.invoke("app:request-permission", permissionId),
	openPermissionSettings: (permissionId) =>
		ipcRenderer.invoke("app:open-permission-settings", permissionId),
	getTranscriptionSessionState: () =>
		ipcRenderer.invoke("app:get-transcription-session-state"),
	configureTranscriptionSession: (options) =>
		ipcRenderer.invoke("app:configure-transcription-session", options),
	startTranscriptionSession: () =>
		ipcRenderer.invoke("app:start-transcription-session"),
	stopTranscriptionSession: () =>
		ipcRenderer.invoke("app:stop-transcription-session"),
	requestTranscriptionSystemAudio: () =>
		ipcRenderer.invoke("app:request-transcription-system-audio"),
	detachTranscriptionSystemAudio: () =>
		ipcRenderer.invoke("app:detach-transcription-system-audio"),
	onTranscriptionSessionState: (listener) => {
		const handler = (_event, payload) => {
			listener(payload);
		};

		ipcRenderer.on(transcriptionSessionStateChannel, handler);

		return () => {
			ipcRenderer.removeListener(transcriptionSessionStateChannel, handler);
		};
	},
	onTranscriptionSessionEvent: (listener) => {
		const handler = (_event, payload) => {
			listener(payload);
		};

		ipcRenderer.on(transcriptionSessionEventChannel, handler);

		return () => {
			ipcRenderer.removeListener(transcriptionSessionEventChannel, handler);
		};
	},
	startSystemAudioCapture: () =>
		ipcRenderer.invoke("app:start-system-audio-capture"),
	stopSystemAudioCapture: () =>
		ipcRenderer.invoke("app:stop-system-audio-capture"),
	startMicrophoneCapture: () =>
		ipcRenderer.invoke("app:start-microphone-capture"),
	stopMicrophoneCapture: () =>
		ipcRenderer.invoke("app:stop-microphone-capture"),
	startDesktopRealtimeTransport: (options) =>
		ipcRenderer.invoke("app:start-desktop-realtime-transport", options),
	stopDesktopRealtimeTransport: (speaker) =>
		ipcRenderer.invoke("app:stop-desktop-realtime-transport", speaker),
	onDesktopRealtimeTransportEvent: (listener) => {
		const handler = (_event, payload) => {
			listener(payload);
		};

		ipcRenderer.on(desktopRealtimeTransportEventChannel, handler);

		return () => {
			ipcRenderer.removeListener(desktopRealtimeTransportEventChannel, handler);
		};
	},
	onMicrophoneCaptureEvent: (listener) => {
		const handler = (_event, payload) => {
			listener(payload);
		};

		ipcRenderer.on(microphoneCaptureEventChannel, handler);

		return () => {
			ipcRenderer.removeListener(microphoneCaptureEventChannel, handler);
		};
	},
	onSystemAudioCaptureEvent: (listener) => {
		const handler = (_event, payload) => {
			listener(payload);
		};

		ipcRenderer.on(systemAudioCaptureEventChannel, handler);

		return () => {
			ipcRenderer.removeListener(systemAudioCaptureEventChannel, handler);
		};
	},
	writeClipboardText: (value) =>
		ipcRenderer.invoke("app:write-clipboard-text", value),
	loadTranscriptDraft: (noteKey) =>
		ipcRenderer.invoke("app:load-transcript-draft", noteKey),
	saveTranscriptDraft: (noteKey, draft) =>
		ipcRenderer.invoke("app:save-transcript-draft", noteKey, draft),
	clearTranscriptDraft: (noteKey) =>
		ipcRenderer.invoke("app:clear-transcript-draft", noteKey),
	saveTextFile: (defaultFileName, content) =>
		ipcRenderer.invoke("app:save-text-file", defaultFileName, content),
	saveRuntimeConfig: (config) =>
		ipcRenderer.invoke("app:save-runtime-config", config),
});
