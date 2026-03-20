import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Menu,
	nativeImage,
	shell,
	Tray,
} from "electron";
import { loadRootEnv } from "./env.mjs";
import { startLocalServer } from "./local-server.mjs";

loadRootEnv();

app.setName("OpenGran");

const desktopProtocol = "opengran";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const trayIconPath = join(runtimeDir, "assets", "OpenGranTemplate.png");
const dockIconPath = join(runtimeDir, "assets", "OpenGranDock.png");
const traySettingsPath = join(app.getPath("userData"), "tray-settings.json");
const minimumWindowSize = {
	width: 390,
	height: 640,
};
const defaultTraySettings = {
	keepOpenInMenuBar: true,
};

let mainWindow = null;
let localServer = null;
let tray = null;
let isQuitting = false;
let traySettings = defaultTraySettings;
let trayStatusLabel = "Update checks are not configured yet";

const registerDesktopProtocol = () => {
	if (process.defaultApp && process.argv.length >= 2) {
		app.setAsDefaultProtocolClient(desktopProtocol, process.execPath, [
			process.argv[1],
		]);
		return;
	}

	app.setAsDefaultProtocolClient(desktopProtocol);
};

const closeLocalServer = async () => {
	if (!localServer) {
		return;
	}

	const server = localServer;
	localServer = null;
	await server.close();
};

const ensureLocalServer = async () => {
	if (!localServer) {
		localServer = await startLocalServer({
			onAuthCallback: handleDesktopAuthCallback,
		});
	}

	return localServer;
};

const resolveRendererUrl = async () => {
	const developmentUrl = process.env.OPENGRAN_RENDERER_URL?.trim();
	if (developmentUrl) {
		return developmentUrl;
	}

	return (await ensureLocalServer()).origin;
};

const loadTraySettings = async () => {
	try {
		const raw = await readFile(traySettingsPath, "utf8");
		const parsed = JSON.parse(raw);

		traySettings = {
			...defaultTraySettings,
			...(parsed && typeof parsed === "object" ? parsed : {}),
		};
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			traySettings = { ...defaultTraySettings };
			return;
		}

		console.warn("Failed to read tray settings.", error);
		traySettings = { ...defaultTraySettings };
	}
};

const saveTraySettings = async () => {
	try {
		await mkdir(app.getPath("userData"), { recursive: true });
		await writeFile(
			traySettingsPath,
			JSON.stringify(traySettings, null, 2),
			"utf8",
		);
	} catch (error) {
		console.warn("Failed to save tray settings.", error);
	}
};

const getNavigationUrl = async ({ pathname = "/home", hash = "" } = {}) => {
	const targetUrl = new URL(await resolveRendererUrl());
	targetUrl.pathname = pathname;
	targetUrl.hash = hash;

	return targetUrl.toString();
};

const buildAuthCallbackUrl = async (callbackUrl) => {
	const rendererUrl = new URL(await resolveRendererUrl());
	const incomingUrl = new URL(callbackUrl);
	const ott = incomingUrl.searchParams.get("ott");
	const authError = incomingUrl.searchParams.get("error");
	const authErrorDescription =
		incomingUrl.searchParams.get("error_description");

	rendererUrl.pathname = "/home";
	rendererUrl.hash = "";
	rendererUrl.search = "";

	if (ott) {
		rendererUrl.searchParams.set("ott", ott);
	}

	if (authError) {
		rendererUrl.searchParams.set("authError", authError);
	}

	if (authErrorDescription) {
		rendererUrl.searchParams.set("authErrorDescription", authErrorDescription);
	}

	return rendererUrl.toString();
};

const getDesktopAuthCallbackUrl = async () => {
	const server = await ensureLocalServer();
	return `${server.origin}/auth/callback`;
};

const showMainWindow = async (options = {}) => {
	const targetUrl = await getNavigationUrl(options);

	if (!mainWindow) {
		await createMainWindow(targetUrl);
	} else if (mainWindow.webContents.getURL() !== targetUrl) {
		await mainWindow.loadURL(targetUrl);
	}

	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}

	mainWindow.show();
	mainWindow.focus();
};

const handleDesktopProtocolUrl = async (callbackUrl) => {
	if (!callbackUrl?.startsWith(`${desktopProtocol}://`)) {
		return;
	}

	const targetUrl = await buildAuthCallbackUrl(callbackUrl);

	if (!mainWindow) {
		await createMainWindow(targetUrl);
	} else {
		await mainWindow.loadURL(targetUrl);
	}

	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}

	mainWindow.show();
	mainWindow.focus();
};

const handleDesktopAuthCallback = async (callbackUrl) => {
	const targetUrl = await buildAuthCallbackUrl(callbackUrl);

	if (!mainWindow) {
		await createMainWindow(targetUrl);
	} else {
		await mainWindow.loadURL(targetUrl);
	}

	if (mainWindow.isMinimized()) {
		mainWindow.restore();
	}

	mainWindow.show();
	mainWindow.focus();
};

const createMainWindow = async (targetUrl) => {
	const navigationUrl = targetUrl ?? (await getNavigationUrl());
	const isMac = process.platform === "darwin";

	mainWindow = new BrowserWindow({
		width: 1440,
		height: 960,
		minWidth: minimumWindowSize.width,
		minHeight: minimumWindowSize.height,
		title: "OpenGran",
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

	mainWindow.on("close", (event) => {
		if (
			isQuitting ||
			process.platform !== "darwin" ||
			!traySettings.keepOpenInMenuBar
		) {
			return;
		}

		event.preventDefault();
		mainWindow.hide();
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	await mainWindow.loadURL(navigationUrl);
};

ipcMain.handle("app:get-meta", () => ({
	name: app.getName(),
	version: app.getVersion(),
	platform: process.platform,
}));

ipcMain.handle("app:open-external-url", async (_event, url) => {
	if (typeof url !== "string" || !url.startsWith("http")) {
		throw new Error("Invalid external URL.");
	}

	await shell.openExternal(url);
	return { ok: true };
});

ipcMain.handle("app:get-auth-callback-url", async () => {
	return {
		url: await getDesktopAuthCallbackUrl(),
	};
});

const quitCompletely = () => {
	isQuitting = true;
	app.quit();
};

const handleCheckForUpdates = async () => {
	trayStatusLabel = "Update checks are not configured yet";

	await dialog.showMessageBox({
		type: "info",
		title: "Check for updates",
		message: "Update checks are not configured yet.",
		detail:
			"Add an Electron updater integration before wiring this action to a real release feed.",
	});
};

const handleTrayQuit = async () => {
	if (!traySettings.keepOpenInMenuBar) {
		quitCompletely();
		return;
	}

	if (mainWindow) {
		mainWindow.hide();
		return;
	}

	await createMainWindow();
	mainWindow.hide();
};

const buildTrayMenu = () =>
	Menu.buildFromTemplate([
		{
			label: "Open desktop",
			click: () => {
				void showMainWindow();
			},
		},
		{
			label: "Quick note",
			click: () => {
				void showMainWindow({ pathname: "/quick-note" });
			},
		},
		{
			label: "Settings",
			click: () => {
				void showMainWindow({ pathname: "/home", hash: "settings" });
			},
		},
		{
			label: `${app.getName()} v${app.getVersion()}`,
			enabled: false,
		},
		{
			label: trayStatusLabel,
			enabled: false,
		},
		{
			label: "Check for updates",
			click: () => {
				void handleCheckForUpdates();
			},
		},
		{ type: "separator" },
		{
			label: "Quit",
			click: () => {
				void handleTrayQuit();
			},
		},
		{
			label: "Quit options",
			submenu: [
				{
					label: "Keep OpenGran in the menu bar",
					type: "checkbox",
					checked: traySettings.keepOpenInMenuBar,
					click: (menuItem) => {
						traySettings = {
							...traySettings,
							keepOpenInMenuBar: menuItem.checked,
						};
						void saveTraySettings();
						refreshTrayMenu();
					},
				},
				{
					label: "Quit completely",
					click: () => {
						quitCompletely();
					},
				},
			],
		},
	]);

const refreshTrayMenu = () => {
	if (!tray) {
		return;
	}

	tray.setContextMenu(buildTrayMenu());
};

const createTray = () => {
	if (tray || process.platform !== "darwin") {
		return;
	}

	const icon = nativeImage.createFromPath(trayIconPath);
	if (icon.isEmpty()) {
		console.warn(`Tray icon is missing or invalid at ${trayIconPath}.`);
		return;
	}

	icon.setTemplateImage(true);

	tray = new Tray(icon);
	tray.setToolTip(app.getName());
	refreshTrayMenu();
	tray.on("double-click", () => {
		void showMainWindow();
	});
};

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
	app.quit();
} else {
	registerDesktopProtocol();

	app.on("open-url", (event, url) => {
		event.preventDefault();
		void handleDesktopProtocolUrl(url);
	});

	app.on("second-instance", (_event, argv) => {
		const deepLinkUrl = argv.find((value) =>
			value.startsWith(`${desktopProtocol}://`),
		);
		if (deepLinkUrl) {
			void handleDesktopProtocolUrl(deepLinkUrl);
			return;
		}

		void showMainWindow();
	});

	app.whenReady().then(async () => {
		if (process.platform === "darwin") {
			app.dock?.setIcon(dockIconPath);
		}

		await loadTraySettings();
		await createMainWindow();
		createTray();

		const initialDeepLink = process.argv.find((value) =>
			value.startsWith(`${desktopProtocol}://`),
		);
		if (initialDeepLink) {
			await handleDesktopProtocolUrl(initialDeepLink);
		}

		app.on("activate", async () => {
			await showMainWindow();
		});
	});

	app.on("window-all-closed", async () => {
		await closeLocalServer();

		if (process.platform !== "darwin" || !traySettings.keepOpenInMenuBar) {
			quitCompletely();
		}
	});

	app.on("before-quit", () => {
		isQuitting = true;
		void closeLocalServer();
	});
}
