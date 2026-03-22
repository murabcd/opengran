import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	clipboard,
	dialog,
	ipcMain,
	Menu,
	nativeImage,
	shell,
	systemPreferences,
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
const defaultWindowSize = {
	width: 1280,
	height: 860,
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
		width: defaultWindowSize.width,
		height: defaultWindowSize.height,
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

const getMicrophonePermission = () => {
	if (process.platform !== "darwin" && process.platform !== "win32") {
		return {
			id: "microphone",
			required: false,
			state: "unsupported",
			canRequest: false,
			canOpenSystemSettings: false,
		};
	}

	const rawStatus = systemPreferences.getMediaAccessStatus("microphone");
	const canRequest =
		process.platform === "darwin" && rawStatus === "not-determined";

	return {
		id: "microphone",
		required: true,
		state:
			rawStatus === "granted"
				? "granted"
				: rawStatus === "denied" || rawStatus === "restricted"
					? "blocked"
					: rawStatus === "not-determined"
						? canRequest
							? "prompt"
							: "blocked"
						: "unknown",
		canRequest,
		canOpenSystemSettings: true,
	};
};

const getPermissionsStatus = () => ({
	isDesktop: true,
	platform: process.platform,
	permissions: [getMicrophonePermission()],
});

const requestPermission = async (permissionId) => {
	if (permissionId !== "microphone") {
		throw new Error("Unsupported desktop permission.");
	}

	if (
		process.platform === "darwin" &&
		systemPreferences.getMediaAccessStatus("microphone") === "not-determined"
	) {
		await systemPreferences.askForMediaAccess("microphone");
	}

	return getPermissionsStatus();
};

const openPermissionSettings = async (permissionId) => {
	if (permissionId !== "microphone") {
		throw new Error("Unsupported desktop permission.");
	}

	const settingsUrl =
		process.platform === "darwin"
			? "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
			: process.platform === "win32"
				? "ms-settings:privacy-microphone"
				: null;

	if (!settingsUrl) {
		throw new Error("System settings are not available on this platform.");
	}

	await shell.openExternal(settingsUrl);

	return { ok: true };
};

ipcMain.handle("app:get-meta", () => ({
	name: app.getName(),
	version: app.getVersion(),
	platform: process.platform,
}));

ipcMain.handle("app:get-permissions-status", () => getPermissionsStatus());

ipcMain.handle("app:open-external-url", async (_event, url) => {
	if (typeof url !== "string" || !url.startsWith("http")) {
		throw new Error("Invalid external URL.");
	}

	await shell.openExternal(url);
	return { ok: true };
});

ipcMain.handle("app:request-permission", async (_event, permissionId) => {
	if (typeof permissionId !== "string") {
		throw new Error("Permission id must be a string.");
	}

	return await requestPermission(permissionId);
});

ipcMain.handle("app:open-permission-settings", async (_event, permissionId) => {
	if (typeof permissionId !== "string") {
		throw new Error("Permission id must be a string.");
	}

	return await openPermissionSettings(permissionId);
});

ipcMain.handle("app:get-auth-callback-url", async () => {
	return {
		url: await getDesktopAuthCallbackUrl(),
	};
});

ipcMain.handle("app:get-share-base-url", async () => {
	const shareBaseUrl =
		process.env.SITE_URL?.trim() || (await resolveRendererUrl());

	return {
		url: shareBaseUrl,
	};
});

ipcMain.handle("app:write-clipboard-text", async (_event, value) => {
	if (typeof value !== "string") {
		throw new Error("Clipboard value must be a string.");
	}

	clipboard.writeText(value);
	return { ok: true };
});

ipcMain.handle(
	"app:save-text-file",
	async (_event, defaultFileName, content) => {
		if (typeof defaultFileName !== "string" || !defaultFileName.trim()) {
			throw new Error("Default file name must be a non-empty string.");
		}

		if (typeof content !== "string") {
			throw new Error("File content must be a string.");
		}

		const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
			defaultPath: defaultFileName,
			filters: [{ name: "Text", extensions: ["txt"] }],
		});

		if (result.canceled || !result.filePath) {
			return { ok: true, canceled: true };
		}

		await writeFile(result.filePath, content, "utf8");

		return {
			ok: true,
			canceled: false,
			filePath: result.filePath,
		};
	},
);

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
			label: "Note",
			click: () => {
				void showMainWindow({ pathname: "/note" });
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
