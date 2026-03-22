const { contextBridge, ipcRenderer } = require("electron");

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
	writeClipboardText: (value) =>
		ipcRenderer.invoke("app:write-clipboard-text", value),
	saveTextFile: (defaultFileName, content) =>
		ipcRenderer.invoke("app:save-text-file", defaultFileName, content),
});
