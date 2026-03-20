import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain } from "electron";
import { loadRootEnv } from "./env.mjs";
import { startLocalServer } from "./local-server.mjs";

loadRootEnv();

const runtimeDir = dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let localServer = null;

const closeLocalServer = async () => {
	if (!localServer) {
		return;
	}

	const server = localServer;
	localServer = null;
	await server.close();
};

const resolveRendererUrl = async () => {
	const developmentUrl = process.env.OPENMEET_RENDERER_URL?.trim();
	if (developmentUrl) {
		return developmentUrl;
	}

	if (!localServer) {
		localServer = await startLocalServer();
	}

	return localServer.origin;
};

const createMainWindow = async () => {
	const targetUrl = await resolveRendererUrl();
	const isMac = process.platform === "darwin";

	mainWindow = new BrowserWindow({
		width: 1440,
		height: 960,
		minWidth: 1100,
		minHeight: 720,
		title: "OpenMeet",
		backgroundColor: "#f7f7f5",
		autoHideMenuBar: true,
		titleBarStyle: isMac ? "hiddenInset" : "default",
		webPreferences: {
			preload: join(runtimeDir, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	await mainWindow.loadURL(targetUrl);
};

ipcMain.handle("app:get-meta", () => ({
	name: app.getName(),
	version: app.getVersion(),
	platform: process.platform,
}));

app.whenReady().then(async () => {
	await createMainWindow();

	app.on("activate", async () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			await createMainWindow();
		}
	});
});

app.on("window-all-closed", async () => {
	await closeLocalServer();

	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("before-quit", () => {
	void closeLocalServer();
});
