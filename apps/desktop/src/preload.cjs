const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openGranDesktop", {
	getMeta: () => ipcRenderer.invoke("app:get-meta"),
	getAuthCallbackUrl: () => ipcRenderer.invoke("app:get-auth-callback-url"),
	getShareBaseUrl: () => ipcRenderer.invoke("app:get-share-base-url"),
	openExternalUrl: (url) => ipcRenderer.invoke("app:open-external-url", url),
	writeClipboardText: (value) =>
		ipcRenderer.invoke("app:write-clipboard-text", value),
	saveTextFile: (defaultFileName, content) =>
		ipcRenderer.invoke("app:save-text-file", defaultFileName, content),
});
