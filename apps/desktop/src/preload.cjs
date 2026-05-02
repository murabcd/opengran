const { contextBridge, ipcRenderer } = require("electron");
const { createOpenGranDesktopApi } = require("./preload-api.cjs");

contextBridge.exposeInMainWorld(
	"openGranDesktop",
	createOpenGranDesktopApi({
		ipcRenderer,
		platform: process.platform,
		env: process.env,
	}),
);
