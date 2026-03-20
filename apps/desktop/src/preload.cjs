const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openGranDesktop", {
	getMeta: () => ipcRenderer.invoke("app:get-meta"),
	getAuthCallbackUrl: () => ipcRenderer.invoke("app:get-auth-callback-url"),
	openExternalUrl: (url) => ipcRenderer.invoke("app:open-external-url", url),
});
