const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openMeetDesktop", {
	getMeta: () => ipcRenderer.invoke("app:get-meta"),
});
