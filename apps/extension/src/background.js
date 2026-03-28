const bridgePorts = Array.from(
	{ length: 20 },
	(_value, index) => 42831 + index,
);
const bridgeInfoPath = "/api/browser-meeting-bridge-info";
const bridgeSignalPath = "/api/browser-meeting-signal";
const heartbeatAlarmName = "opengran-meeting-heartbeat";
const heartbeatPeriodMinutes = 0.5;

const providerMatchers = [
	{
		id: "google-meet",
		sourceName: "Google Meet",
		match: ({ hostname }) => hostname === "meet.google.com",
	},
	{
		id: "yandex-telemost",
		sourceName: "Yandex Telemost",
		match: ({ hostname }) =>
			hostname === "telemost.yandex.ru" ||
			hostname === "telemost.360.yandex.ru",
	},
	{
		id: "zoom",
		sourceName: "Zoom",
		match: ({ hostname, pathname }) =>
			hostname.endsWith(".zoom.us") &&
			(pathname.startsWith("/j/") ||
				pathname.startsWith("/wc/") ||
				pathname.startsWith("/s/")),
	},
	{
		id: "microsoft-teams",
		sourceName: "Microsoft Teams",
		match: ({ hostname, pathname }) =>
			(hostname === "teams.microsoft.com" ||
				hostname.endsWith(".teams.microsoft.com")) &&
			(pathname.includes("/meet") || pathname.includes("/l/meetup-join")),
	},
];

let cachedBridgePort = null;
let lastPayloadFingerprint = null;

const timeout = (durationMs) =>
	new Promise((resolvePromise) => {
		setTimeout(resolvePromise, durationMs);
	});

const withTimeout = async (promise, durationMs) =>
	await Promise.race([
		promise,
		timeout(durationMs).then(() => {
			throw new Error("Timed out");
		}),
	]);

const tryBridgePort = async (port, path, payload) => {
	const response = await withTimeout(
		fetch(`http://127.0.0.1:${port}${path}`, {
			method: payload ? "POST" : "GET",
			headers: payload ? { "Content-Type": "application/json" } : undefined,
			body: payload ? JSON.stringify(payload) : undefined,
		}),
		750,
	);

	if (!response.ok) {
		throw new Error(`Bridge responded with ${response.status}`);
	}

	return response;
};

const resolveBridgePort = async () => {
	const ports = cachedBridgePort
		? [
				cachedBridgePort,
				...bridgePorts.filter((port) => port !== cachedBridgePort),
			]
		: bridgePorts;

	for (const port of ports) {
		try {
			const response = await tryBridgePort(port, bridgeInfoPath);
			const payload = await response.json().catch(() => null);
			if (
				payload?.app === "OpenGran" &&
				payload?.bridge === "browser-meeting"
			) {
				cachedBridgePort = port;
				return port;
			}
		} catch {}
	}

	return null;
};

const postBridgeSignal = async (payload) => {
	const port = await resolveBridgePort();
	if (!port) {
		return false;
	}

	try {
		await tryBridgePort(port, bridgeSignalPath, payload);
		return true;
	} catch {
		if (cachedBridgePort === port) {
			cachedBridgePort = null;
		}
		return false;
	}
};

const fingerprintPayload = (payload) =>
	JSON.stringify([
		payload.active,
		payload.providerId ?? null,
		payload.sourceName ?? null,
		payload.urlHost ?? null,
		payload.tabTitle ?? null,
	]);

const detectMeetingFromTab = (tab) => {
	if (!tab || typeof tab.url !== "string") {
		return null;
	}

	let parsedUrl = null;
	try {
		parsedUrl = new URL(tab.url);
	} catch {
		return null;
	}

	if (parsedUrl.protocol !== "https:") {
		return null;
	}

	const title =
		typeof tab.title === "string" && tab.title.trim() ? tab.title.trim() : null;
	const context = {
		hostname: parsedUrl.hostname.toLowerCase(),
		pathname: parsedUrl.pathname,
		search: parsedUrl.search,
		title,
	};

	const provider = providerMatchers.find((matcher) => matcher.match(context));
	if (!provider) {
		return null;
	}

	return {
		active: true,
		detectedAt: Date.now(),
		providerId: provider.id,
		sourceName: provider.sourceName,
		tabId: tab.id ?? null,
		tabTitle: title,
		url: parsedUrl.toString(),
		urlHost: parsedUrl.hostname.toLowerCase(),
	};
};

const emitActiveTabSignal = async () => {
	const [tab] = await chrome.tabs.query({
		active: true,
		lastFocusedWindow: true,
	});

	const payload = detectMeetingFromTab(tab) ?? {
		active: false,
		detectedAt: Date.now(),
		providerId: null,
		sourceName: null,
		tabId: tab?.id ?? null,
		tabTitle:
			typeof tab?.title === "string" && tab.title.trim()
				? tab.title.trim()
				: null,
		url: typeof tab?.url === "string" ? tab.url : null,
		urlHost: null,
	};

	const fingerprint = fingerprintPayload(payload);
	if (fingerprint === lastPayloadFingerprint) {
		return;
	}

	lastPayloadFingerprint = fingerprint;
	await postBridgeSignal(payload);
};

const scheduleHeartbeat = () => {
	chrome.alarms.create(heartbeatAlarmName, {
		periodInMinutes: heartbeatPeriodMinutes,
	});
};

chrome.runtime.onInstalled.addListener(() => {
	scheduleHeartbeat();
	void emitActiveTabSignal();
});

chrome.runtime.onStartup.addListener(() => {
	scheduleHeartbeat();
	void emitActiveTabSignal();
});

chrome.tabs.onActivated.addListener(() => {
	void emitActiveTabSignal();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
	if (!tab.active) {
		return;
	}

	if (
		!("url" in changeInfo) &&
		!("title" in changeInfo) &&
		changeInfo.status !== "complete"
	) {
		return;
	}

	void emitActiveTabSignal();
});

chrome.windows.onFocusChanged.addListener(() => {
	void emitActiveTabSignal();
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name !== heartbeatAlarmName) {
		return;
	}

	void emitActiveTabSignal();
});
