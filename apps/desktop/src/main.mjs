import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	clipboard,
	desktopCapturer,
	dialog,
	ipcMain,
	Menu,
	nativeImage,
	shell,
	systemPreferences,
	Tray,
} from "electron";
import electronUpdater from "electron-updater";
import { getDesktopAuthClient } from "./auth-client.mjs";
import { loadRootEnv } from "./env.mjs";
import { startLocalServer } from "./local-server.mjs";
import {
	getRuntimeConfig,
	hydrateRuntimeConfig,
	saveRuntimeConfig,
} from "./runtime-config.mjs";

const { autoUpdater } = electronUpdater;

loadRootEnv();
await hydrateRuntimeConfig();

app.setName("OpenGran");

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const trayIconPath = join(runtimeDir, "assets", "OpenGranTemplate.png");
const dockIconPath = join(runtimeDir, "assets", "OpenGranDock.png");
const traySettingsPath = join(app.getPath("userData"), "tray-settings.json");
const desktopPermissionsPath = join(
	app.getPath("userData"),
	"desktop-permissions.json",
);
const transcriptDraftsDirPath = join(
	app.getPath("userData"),
	"transcript-drafts",
);
const systemAudioCaptureEventChannel = "app:system-audio-capture-event";
const transcriptDraftStorageVersion = 1;
const transcriptDraftMaxAgeMs = 72 * 60 * 60 * 1000;
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
const defaultDesktopPermissionsState = {
	systemAudioValidated: false,
	systemAudioBlocked: false,
};

let mainWindow = null;
let localServer = null;
let tray = null;
let isQuitting = false;
let traySettings = defaultTraySettings;
let desktopPermissionsState = defaultDesktopPermissionsState;
let trayStatusLabel = "Updates are unavailable in development builds";
let hasConfiguredDisplayMediaHandler = false;
let systemAudioCaptureSession = null;
let systemAudioCaptureStartRequestId = 0;
let hasPendingUpdateDownload = false;
let isCheckingForUpdates = false;
let shouldShowUpdateResultDialogs = false;
let pendingUpdateVersion = null;

const isUpdaterAvailable = () =>
	process.platform === "darwin" &&
	app.isPackaged === true &&
	process.env.OPENGRAN_DISABLE_UPDATER !== "1";

const setTrayStatusLabel = (value) => {
	trayStatusLabel = value;
	refreshTrayMenu();
};

const normalizeDesktopPermissionsState = (value) => ({
	systemAudioValidated: value?.systemAudioValidated === true,
	systemAudioBlocked: value?.systemAudioBlocked === true,
});

const resolveSystemAudioHelperPath = () => {
	const envPath = process.env.OPENGRAN_SYSTEM_AUDIO_HELPER_PATH?.trim();
	const unpackedHelperPath = app.isPackaged
		? resolve(
				process.resourcesPath,
				"app.asar.unpacked",
				".bundle-root",
				"apps",
				"desktop",
				"dist",
				"bin",
				"opengran-system-audio-helper",
			)
		: null;
	const candidates = [
		envPath,
		unpackedHelperPath,
		resolve(runtimeDir, "bin", "opengran-system-audio-helper"),
		resolve(
			runtimeDir,
			"..",
			".generated",
			"system-audio",
			"opengran-system-audio-helper",
		),
	].filter(Boolean);

	return candidates.find((candidatePath) => existsSync(candidatePath)) ?? null;
};

const hydrateDesktopPermissionsState = async () => {
	try {
		const raw = await readFile(desktopPermissionsPath, "utf8");
		desktopPermissionsState = normalizeDesktopPermissionsState(JSON.parse(raw));
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			desktopPermissionsState = defaultDesktopPermissionsState;
			return;
		}

		console.warn("Failed to read desktop permissions state.", error);
		desktopPermissionsState = defaultDesktopPermissionsState;
	}
};

const persistDesktopPermissionsState = async () => {
	await mkdir(app.getPath("userData"), { recursive: true });
	await writeFile(
		desktopPermissionsPath,
		JSON.stringify(desktopPermissionsState, null, 2),
		"utf8",
	);
};

const setSystemAudioValidated = async (isValidated) => {
	desktopPermissionsState = normalizeDesktopPermissionsState({
		...desktopPermissionsState,
		systemAudioValidated: isValidated,
	});
	await persistDesktopPermissionsState();
};

const setSystemAudioBlocked = async (isBlocked) => {
	desktopPermissionsState = normalizeDesktopPermissionsState({
		...desktopPermissionsState,
		systemAudioBlocked: isBlocked,
	});
	await persistDesktopPermissionsState();
};

const isLikelySystemAudioPermissionError = (error) => {
	const message = error instanceof Error ? error.message : String(error);

	return (
		message.includes("system-audio tap") ||
		message.includes("System audio capture exited before it became ready") ||
		message.includes("Timed out while starting macOS system audio capture")
	);
};

await hydrateDesktopPermissionsState();

const emitSystemAudioCaptureEvent = (event) => {
	if (!mainWindow || mainWindow.isDestroyed()) {
		return;
	}

	mainWindow.webContents.send(systemAudioCaptureEventChannel, event);
};

const wait = (durationMs) =>
	new Promise((resolvePromise) => {
		setTimeout(resolvePromise, durationMs);
	});

const verifyDesktopOneTimeToken = async (oneTimeToken) => {
	const retryDelayMs = [0, 250, 750, 1500];
	let lastError = null;

	for (const delayMs of retryDelayMs) {
		if (delayMs > 0) {
			await wait(delayMs);
		}

		try {
			const desktopAuthClient = getDesktopAuthClient();
			await desktopAuthClient.$fetch("/cross-domain/one-time-token/verify", {
				method: "POST",
				body: JSON.stringify({
					token: oneTimeToken,
				}),
				headers: {
					"content-type": "application/json",
				},
				throw: true,
			});
			return;
		} catch (error) {
			lastError = error;
			console.warn(
				"Desktop auth callback verification failed.",
				error instanceof Error ? error.message : error,
			);
		}
	}

	throw lastError instanceof Error
		? lastError
		: new Error("Failed to verify desktop auth callback.");
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

const getTranscriptDraftPath = (noteKey) =>
	join(
		transcriptDraftsDirPath,
		`${Buffer.from(noteKey, "utf8").toString("base64url")}.json`,
	);

const ensureTranscriptDraftsDir = async () => {
	await mkdir(transcriptDraftsDirPath, { recursive: true });
};

const pruneTranscriptDrafts = async () => {
	try {
		await ensureTranscriptDraftsDir();
		const entries = await readdir(transcriptDraftsDirPath, {
			withFileTypes: true,
		});

		await Promise.all(
			entries.map(async (entry) => {
				if (!entry.isFile()) {
					return;
				}

				const filePath = join(transcriptDraftsDirPath, entry.name);

				try {
					const fileStats = await stat(filePath);

					if (Date.now() - fileStats.mtimeMs > transcriptDraftMaxAgeMs) {
						await rm(filePath, { force: true });
					}
				} catch {
					await rm(filePath, { force: true });
				}
			}),
		);
	} catch (error) {
		console.warn("Failed to prune transcript drafts.", error);
	}
};

const loadTranscriptDraft = async (noteKey) => {
	await pruneTranscriptDrafts();

	const filePath = getTranscriptDraftPath(noteKey);

	try {
		const rawValue = await readFile(filePath, "utf8");
		const parsed = JSON.parse(rawValue);

		if (
			parsed?.version !== transcriptDraftStorageVersion ||
			parsed?.noteKey !== noteKey ||
			typeof parsed?.updatedAt !== "number" ||
			Date.now() - parsed.updatedAt > transcriptDraftMaxAgeMs
		) {
			await rm(filePath, { force: true });
			return { draft: null };
		}

		return {
			draft: parsed,
		};
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return { draft: null };
		}

		await rm(filePath, { force: true }).catch(() => {});
		return { draft: null };
	}
};

const saveTranscriptDraft = async ({ noteKey, draft }) => {
	await pruneTranscriptDrafts();
	await ensureTranscriptDraftsDir();

	await writeFile(
		getTranscriptDraftPath(noteKey),
		JSON.stringify(
			{
				...draft,
				version: transcriptDraftStorageVersion,
				noteKey,
				updatedAt: Date.now(),
			},
			null,
			2,
		),
		"utf8",
	);

	return { ok: true };
};

const clearTranscriptDraft = async (noteKey) => {
	await rm(getTranscriptDraftPath(noteKey), { force: true });
	return { ok: true };
};

const stopSystemAudioCapture = async () => {
	if (!systemAudioCaptureSession) {
		return;
	}

	const session = systemAudioCaptureSession;
	systemAudioCaptureSession = null;
	session.isStopping = true;

	if (session.cleanupTimeout) {
		clearTimeout(session.cleanupTimeout);
		session.cleanupTimeout = null;
	}

	session.lineReader?.removeAllListeners();
	session.process.stdout?.removeAllListeners();
	session.process.stderr?.removeAllListeners();
	session.process.removeAllListeners();

	await new Promise((resolvePromise) => {
		const finalize = () => {
			resolvePromise();
		};

		session.process.once("exit", finalize);
		session.process.kill("SIGTERM");

		setTimeout(() => {
			if (!session.process.killed) {
				session.process.kill("SIGKILL");
			}
			finalize();
		}, 1_000);
	});

	emitSystemAudioCaptureEvent({
		type: "stopped",
	});
};

const startSystemAudioCapture = async () => {
	if (process.platform !== "darwin") {
		throw new Error("Native system audio capture is only available on macOS.");
	}

	const helperPath = resolveSystemAudioHelperPath();
	if (!helperPath) {
		throw new Error("The macOS system-audio helper is missing.");
	}

	console.info("[system-audio] starting macOS helper", {
		helperPath,
	});

	const requestId = ++systemAudioCaptureStartRequestId;
	await stopSystemAudioCapture();

	return await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(helperPath, [], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		const lineReader = createInterface({
			input: child.stdout,
			crlfDelay: Infinity,
		});
		let didResolve = false;

		const rejectStart = (error) => {
			if (requestId !== systemAudioCaptureStartRequestId) {
				console.info("[system-audio] ignoring stale helper start failure", {
					requestId,
					currentRequestId: systemAudioCaptureStartRequestId,
					message: error instanceof Error ? error.message : String(error),
				});
				return;
			}

			console.error(
				"[system-audio] helper failed to start",
				error instanceof Error ? error.message : error,
			);
			if (didResolve) {
				emitSystemAudioCaptureEvent({
					type: "error",
					message: error instanceof Error ? error.message : String(error),
				});
				return;
			}

			didResolve = true;
			rejectPromise(error);
		};

		const resolveStart = (payload) => {
			if (requestId !== systemAudioCaptureStartRequestId) {
				console.info("[system-audio] ignoring stale helper ready event", {
					requestId,
					currentRequestId: systemAudioCaptureStartRequestId,
				});
				return;
			}

			if (didResolve) {
				return;
			}

			console.info("[system-audio] helper reported ready", payload);
			didResolve = true;
			resolvePromise(payload);
		};

		const cleanupTimeout = setTimeout(() => {
			if (requestId !== systemAudioCaptureStartRequestId) {
				console.info("[system-audio] cleared stale helper startup timeout", {
					requestId,
					currentRequestId: systemAudioCaptureStartRequestId,
				});
				return;
			}

			console.error("[system-audio] helper startup timed out after 5000ms");
			rejectStart(
				new Error("Timed out while starting macOS system audio capture."),
			);
			child.kill("SIGKILL");
		}, 5_000);

		const session = {
			isStopping: false,
			cleanupTimeout,
			lineReader,
			process: child,
			requestId,
		};
		systemAudioCaptureSession = session;

		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => {
			const message = String(chunk).trim();
			if (message) {
				console.error("[system-audio-helper]", message);
			}
		});

		lineReader.on("line", (line) => {
			let event;

			try {
				event = JSON.parse(line);
			} catch (error) {
				console.error("Failed to parse system audio helper event", error, line);
				return;
			}

			if (event?.type !== "chunk") {
				console.info("[system-audio] helper event", event?.type ?? "unknown");
			}

			if (event?.type === "ready") {
				clearTimeout(cleanupTimeout);
				session.cleanupTimeout = null;
				resolveStart({
					channels: Number(event.channels) || 1,
					sampleRate: Number(event.sampleRate) || 48_000,
				});
				return;
			}

			if (event?.type === "error") {
				const nextError = new Error(
					typeof event.message === "string"
						? event.message
						: "System audio capture failed.",
				);
				clearTimeout(cleanupTimeout);
				session.cleanupTimeout = null;
				rejectStart(nextError);
				return;
			}

			emitSystemAudioCaptureEvent(event);
		});

		child.on("error", (error) => {
			clearTimeout(cleanupTimeout);
			session.cleanupTimeout = null;
			if (systemAudioCaptureSession === session) {
				systemAudioCaptureSession = null;
			}
			console.error("[system-audio] helper process error", error);
			rejectStart(error);
		});

		child.on("exit", (code, signal) => {
			clearTimeout(cleanupTimeout);
			session.cleanupTimeout = null;
			if (systemAudioCaptureSession === session) {
				systemAudioCaptureSession = null;
			}

			console.info("[system-audio] helper exited", {
				code,
				signal,
				didResolve,
				isStopping: session.isStopping,
			});

			if (!session.isStopping && !didResolve) {
				rejectStart(
					new Error(
						`System audio capture exited before it became ready (code ${code ?? "null"}, signal ${signal ?? "null"}).`,
					),
				);
				return;
			}

			if (!session.isStopping) {
				emitSystemAudioCaptureEvent({
					type: "stopped",
					code,
					signal,
				});
			}
		});
	});
};

const getNavigationUrl = async ({
	pathname = "/home",
	search = "",
	hash = "",
} = {}) => {
	const targetUrl = new URL(await resolveRendererUrl());
	targetUrl.pathname = pathname;
	targetUrl.search = search;
	targetUrl.hash = hash;

	return targetUrl.toString();
};

const buildAuthCallbackUrl = async (callbackUrl) => {
	const rendererUrl = new URL(await resolveRendererUrl());
	const incomingUrl = new URL(callbackUrl);
	const authError = incomingUrl.searchParams.get("error");
	const authErrorDescription =
		incomingUrl.searchParams.get("error_description");

	rendererUrl.pathname = "/home";
	rendererUrl.hash = "";
	rendererUrl.search = "";

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

const handleDesktopAuthCallback = async (callbackUrl) => {
	const incomingUrl = new URL(callbackUrl);
	const oneTimeToken = incomingUrl.searchParams.get("ott");

	if (oneTimeToken) {
		await verifyDesktopOneTimeToken(oneTimeToken);
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

	if (!hasConfiguredDisplayMediaHandler) {
		hasConfiguredDisplayMediaHandler = true;
		mainWindow.webContents.session.setDisplayMediaRequestHandler(
			async (_request, callback) => {
				const sources = await desktopCapturer.getSources({
					types: ["screen"],
					thumbnailSize: {
						width: 1,
						height: 1,
					},
				});
				const primarySource = sources[0];

				if (!primarySource) {
					callback({});
					return;
				}

				callback(
					process.platform === "win32"
						? {
								video: primarySource,
								audio: "loopback",
							}
						: {
								video: primarySource,
							},
				);
			},
			{
				useSystemPicker: true,
			},
		);
	}

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
			description:
				"During your meetings, OpenGran transcribes your microphone.",
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
		description: "During your meetings, OpenGran transcribes your microphone.",
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

const getSystemAudioPermission = () => {
	if (process.platform === "win32") {
		return {
			id: "systemAudio",
			description:
				"During your meetings, OpenGran transcribes your system audio output.",
			required: false,
			state: "granted",
			canRequest: false,
			canOpenSystemSettings: false,
		};
	}

	if (process.platform === "darwin") {
		const helperPath = resolveSystemAudioHelperPath();
		const hasSystemAudioGrant = desktopPermissionsState.systemAudioValidated;
		const isSystemAudioBlocked =
			desktopPermissionsState.systemAudioBlocked && !hasSystemAudioGrant;

		return {
			id: "systemAudio",
			description: helperPath
				? hasSystemAudioGrant
					? "During your meetings, OpenGran transcribes your system audio output."
					: "During your meetings, OpenGran transcribes your system audio output."
				: "The macOS system-audio helper is missing from this build.",
			required: false,
			state: helperPath
				? hasSystemAudioGrant
					? "granted"
					: isSystemAudioBlocked
						? "blocked"
						: "prompt"
				: "unsupported",
			canRequest:
				Boolean(helperPath) && !hasSystemAudioGrant && !isSystemAudioBlocked,
			canOpenSystemSettings: isSystemAudioBlocked,
		};
	}

	return {
		id: "systemAudio",
		description:
			"System audio capture is not available on this desktop platform.",
		required: false,
		state: "unsupported",
		canRequest: false,
		canOpenSystemSettings: false,
	};
};

const getPermissionsStatus = () => ({
	isDesktop: true,
	platform: process.platform,
	permissions: [getMicrophonePermission(), getSystemAudioPermission()],
});

const requestPermission = async (permissionId) => {
	if (permissionId === "systemAudio") {
		if (process.platform !== "darwin") {
			throw new Error("Unsupported desktop permission.");
		}

		if (getMicrophonePermission().state !== "granted") {
			throw new Error("Enable microphone before system audio.");
		}

		try {
			await startSystemAudioCapture();
			await stopSystemAudioCapture();
			await setSystemAudioBlocked(false);
			await setSystemAudioValidated(true);
		} catch (error) {
			await stopSystemAudioCapture().catch(() => {});

			if (isLikelySystemAudioPermissionError(error)) {
				await setSystemAudioBlocked(true);
				throw new Error(
					"System audio access is blocked. Enable it in System Settings > Privacy & Security > Screen & System Audio Recording, then try again.",
				);
			}

			throw error;
		}

		return getPermissionsStatus();
	}

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
	if (permissionId === "systemAudio") {
		if (process.platform !== "darwin") {
			throw new Error("Unsupported desktop permission.");
		}

		await setSystemAudioBlocked(false);
		await shell.openExternal(
			"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
		);

		return { ok: true };
	}

	if (permissionId !== "microphone") {
		throw new Error("Unsupported desktop permission.");
	}

	if (process.platform === "darwin") {
		const currentStatus = systemPreferences.getMediaAccessStatus("microphone");

		// macOS only lists an app in Privacy > Microphone after it has asked once.
		if (currentStatus === "not-determined") {
			await systemPreferences.askForMediaAccess("microphone");
		}

		if (systemPreferences.getMediaAccessStatus("microphone") === "granted") {
			return { ok: true };
		}
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

ipcMain.handle("app:get-runtime-config", async () => {
	return await getRuntimeConfig();
});

ipcMain.handle("app:auth-fetch", async (_event, request) => {
	if (!request || typeof request !== "object") {
		throw new Error("Auth request payload must be an object.");
	}

	const method =
		typeof request.method === "string" && request.method.trim()
			? request.method.toUpperCase()
			: "GET";
	const path =
		typeof request.path === "string" && request.path.startsWith("/")
			? request.path
			: null;

	if (!path) {
		throw new Error("Auth request path must start with '/'.");
	}

	const headers =
		request.headers && typeof request.headers === "object"
			? Object.fromEntries(
					Object.entries(request.headers).filter(
						([key, value]) =>
							typeof key === "string" && typeof value === "string",
					),
				)
			: {};

	const desktopAuthClient = getDesktopAuthClient();
	const cookie = desktopAuthClient.getCookie();

	if (cookie) {
		headers.cookie = cookie;
	}

	if (method !== "GET" && method !== "HEAD" && !headers["content-type"]) {
		headers["content-type"] = "application/json";
	}

	const body =
		method === "GET" || method === "HEAD"
			? undefined
			: headers["content-type"]?.includes("application/json") &&
					request.body !== undefined &&
					request.body !== null &&
					typeof request.body !== "string"
				? JSON.stringify(request.body)
				: request.body;

	return await desktopAuthClient.$fetch(path, {
		method,
		body,
		headers,
		throw: Boolean(request.throw),
	});
});

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

ipcMain.handle("app:start-system-audio-capture", async () => {
	return await startSystemAudioCapture();
});

ipcMain.handle("app:stop-system-audio-capture", async () => {
	await stopSystemAudioCapture();
	return { ok: true };
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

ipcMain.handle("app:save-runtime-config", async (_event, value) => {
	if (!value || typeof value !== "object") {
		throw new Error("Runtime config payload must be an object.");
	}

	return await saveRuntimeConfig(value);
});

ipcMain.handle("app:load-transcript-draft", async (_event, noteKey) => {
	if (typeof noteKey !== "string" || !noteKey.trim()) {
		throw new Error("Transcript draft key must be a non-empty string.");
	}

	return await loadTranscriptDraft(noteKey.trim());
});

ipcMain.handle("app:save-transcript-draft", async (_event, noteKey, draft) => {
	if (typeof noteKey !== "string" || !noteKey.trim()) {
		throw new Error("Transcript draft key must be a non-empty string.");
	}

	if (!draft || typeof draft !== "object") {
		throw new Error("Transcript draft payload must be an object.");
	}

	return await saveTranscriptDraft({
		noteKey: noteKey.trim(),
		draft,
	});
});

ipcMain.handle("app:clear-transcript-draft", async (_event, noteKey) => {
	if (typeof noteKey !== "string" || !noteKey.trim()) {
		throw new Error("Transcript draft key must be a non-empty string.");
	}

	return await clearTranscriptDraft(noteKey.trim());
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

const promptToInstallDownloadedUpdate = async (version) => {
	const { response } = await dialog.showMessageBox({
		type: "info",
		title: "Update ready",
		message: `OpenGran ${version} is ready to install.`,
		detail: "Install the update now or wait until you quit the app.",
		buttons: ["Install and restart", "Later"],
		defaultId: 0,
		cancelId: 1,
	});

	if (response === 0) {
		isQuitting = true;
		autoUpdater.quitAndInstall();
	}
};

const configureAutoUpdater = () => {
	if (!isUpdaterAvailable()) {
		return;
	}

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;

	autoUpdater.on("checking-for-update", () => {
		isCheckingForUpdates = true;
		setTrayStatusLabel("Checking for updates...");
	});

	autoUpdater.on("update-available", (info) => {
		hasPendingUpdateDownload = false;
		pendingUpdateVersion = info.version;
		setTrayStatusLabel(`Downloading OpenGran ${info.version}...`);
	});

	autoUpdater.on("download-progress", (progress) => {
		setTrayStatusLabel(
			`Downloading update... ${Math.round(progress.percent)}%`,
		);
	});

	autoUpdater.on("update-not-available", async () => {
		isCheckingForUpdates = false;
		hasPendingUpdateDownload = false;
		pendingUpdateVersion = null;
		setTrayStatusLabel("OpenGran is up to date");

		if (!shouldShowUpdateResultDialogs) {
			return;
		}

		shouldShowUpdateResultDialogs = false;
		await dialog.showMessageBox({
			type: "info",
			title: "Check for updates",
			message: "OpenGran is up to date.",
		});
	});

	autoUpdater.on("update-downloaded", async (info) => {
		isCheckingForUpdates = false;
		hasPendingUpdateDownload = true;
		pendingUpdateVersion = info.version;
		shouldShowUpdateResultDialogs = false;
		setTrayStatusLabel(`OpenGran ${info.version} is ready to install`);
		await promptToInstallDownloadedUpdate(info.version);
	});

	autoUpdater.on("error", async (error) => {
		isCheckingForUpdates = false;
		setTrayStatusLabel("Update check failed");
		console.error("Auto updater failed", error);

		if (!shouldShowUpdateResultDialogs) {
			return;
		}

		shouldShowUpdateResultDialogs = false;
		await dialog.showMessageBox({
			type: "error",
			title: "Check for updates",
			message: "OpenGran couldn't check for updates.",
			detail: error instanceof Error ? error.message : String(error),
		});
	});
};

const handleCheckForUpdates = async () => {
	if (!isUpdaterAvailable()) {
		await dialog.showMessageBox({
			type: "info",
			title: "Check for updates",
			message: "Updates are only available in packaged release builds.",
		});
		return;
	}

	if (isCheckingForUpdates) {
		await dialog.showMessageBox({
			type: "info",
			title: "Check for updates",
			message: "OpenGran is already checking for updates.",
		});
		return;
	}

	if (hasPendingUpdateDownload) {
		await promptToInstallDownloadedUpdate(
			pendingUpdateVersion ?? app.getVersion(),
		);
		return;
	}

	shouldShowUpdateResultDialogs = true;
	await autoUpdater.checkForUpdates();
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
				void showMainWindow({
					pathname: "/note",
					search: "?capture=1",
				});
			},
		},
		{
			label: "Settings",
			click: () => {
				void showMainWindow({ pathname: "/settings/profile" });
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
	app.on("second-instance", (_event, _argv) => {
		void showMainWindow();
	});

	app.whenReady().then(async () => {
		if (process.platform === "darwin") {
			app.dock?.setIcon(dockIconPath);
		}

		await loadTraySettings();
		await createMainWindow();
		createTray();
		configureAutoUpdater();

		if (isUpdaterAvailable()) {
			setTrayStatusLabel("Checking for updates...");
			void autoUpdater.checkForUpdates().catch((error) => {
				console.error("Initial update check failed", error);
			});
		}

		app.on("activate", async () => {
			await showMainWindow();
		});
	});

	app.on("window-all-closed", async () => {
		await stopSystemAudioCapture();
		await closeLocalServer();

		if (process.platform !== "darwin" || !traySettings.keepOpenInMenuBar) {
			quitCompletely();
		}
	});

	app.on("before-quit", () => {
		isQuitting = true;
		void stopSystemAudioCapture();
		void closeLocalServer();
	});
}
