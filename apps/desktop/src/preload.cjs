const { contextBridge, ipcRenderer } = require("electron");
const systemAudioCaptureEventChannel = "app:system-audio-capture-event";

contextBridge.exposeInMainWorld("openGranDesktop", {
	getMeta: () => ipcRenderer.invoke("app:get-meta"),
	getPermissionsStatus: () => ipcRenderer.invoke("app:get-permissions-status"),
	getAuthCallbackUrl: () => ipcRenderer.invoke("app:get-auth-callback-url"),
	getShareBaseUrl: () => ipcRenderer.invoke("app:get-share-base-url"),
	openExternalUrl: (url) => ipcRenderer.invoke("app:open-external-url", url),
	requestPermission: (permissionId) =>
		ipcRenderer.invoke("app:request-permission", permissionId),
	openPermissionSettings: (permissionId) =>
		ipcRenderer.invoke("app:open-permission-settings", permissionId),
	startSystemAudioCapture: () =>
		ipcRenderer.invoke("app:start-system-audio-capture"),
	stopSystemAudioCapture: () =>
		ipcRenderer.invoke("app:stop-system-audio-capture"),
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
});
