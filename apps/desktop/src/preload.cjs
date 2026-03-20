const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openGranDesktop", {
	getMeta: () => ipcRenderer.invoke("app:get-meta"),
});
