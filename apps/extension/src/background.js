import {
	getMeetingSignalPayload,
	getTrackedMeetingTabIds,
	isSupportedMeetingUrl,
	supportedMeetingQueryPatterns,
} from "./meeting-tabs.js";

const bridgePorts = Array.from(
	{ length: 20 },
	(_value, index) => 42831 + index,
);
const bridgeInfoPath = "/api/browser-meeting-bridge-info";
const bridgeSignalPath = "/api/browser-meeting-signal";
const heartbeatAlarmName = "opengran-meeting-heartbeat";
const heartbeatPeriodMinutes = 0.5;

let cachedBridgePort = null;
let lastDeliveredPayloadFingerprint = null;
let lastTrackedMeetingTabIds = new Set();
let isMeetingSignalSyncInFlight = false;
let hasPendingMeetingSignalSync = false;

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

const syncMeetingSignalOnce = async () => {
	const tabs = await chrome.tabs.query({
		url: supportedMeetingQueryPatterns,
	});
	const payload = getMeetingSignalPayload(tabs);
	lastTrackedMeetingTabIds = getTrackedMeetingTabIds(tabs);

	const fingerprint = fingerprintPayload(payload);
	if (fingerprint === lastDeliveredPayloadFingerprint) {
		return;
	}

	const didPost = await postBridgeSignal(payload);
	if (didPost) {
		lastDeliveredPayloadFingerprint = fingerprint;
	}
};

const requestMeetingSignalSync = () => {
	hasPendingMeetingSignalSync = true;
	if (isMeetingSignalSyncInFlight) {
		return;
	}

	isMeetingSignalSyncInFlight = true;
	void (async () => {
		try {
			while (hasPendingMeetingSignalSync) {
				hasPendingMeetingSignalSync = false;
				await syncMeetingSignalOnce();
			}
		} finally {
			isMeetingSignalSyncInFlight = false;
			if (hasPendingMeetingSignalSync) {
				requestMeetingSignalSync();
			}
		}
	})();
};

const shouldSyncForTab = (tab) =>
	typeof tab?.id === "number"
		? lastTrackedMeetingTabIds.has(tab.id) || isSupportedMeetingUrl(tab.url)
		: false;

const shouldSyncForNavigation = (details) =>
	details.frameId === 0 &&
	(typeof details.tabId === "number"
		? lastTrackedMeetingTabIds.has(details.tabId) ||
			isSupportedMeetingUrl(details.url)
		: false);

const scheduleHeartbeat = () => {
	chrome.alarms.create(heartbeatAlarmName, {
		periodInMinutes: heartbeatPeriodMinutes,
	});
};

chrome.runtime.onInstalled.addListener(() => {
	scheduleHeartbeat();
	requestMeetingSignalSync();
});

chrome.runtime.onStartup.addListener(() => {
	scheduleHeartbeat();
	requestMeetingSignalSync();
});

chrome.tabs.onActivated.addListener(() => {
	requestMeetingSignalSync();
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
	if (
		!("url" in changeInfo) &&
		!("title" in changeInfo) &&
		changeInfo.status !== "complete"
	) {
		return;
	}

	if (!shouldSyncForTab(tab)) {
		return;
	}

	requestMeetingSignalSync();
});

chrome.tabs.onRemoved.addListener(() => {
	requestMeetingSignalSync();
});

chrome.windows.onFocusChanged.addListener(() => {
	requestMeetingSignalSync();
});

chrome.tabs.onReplaced.addListener(() => {
	requestMeetingSignalSync();
});

chrome.webNavigation.onCommitted.addListener((details) => {
	if (!shouldSyncForNavigation(details)) {
		return;
	}

	requestMeetingSignalSync();
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
	if (!shouldSyncForNavigation(details)) {
		return;
	}

	requestMeetingSignalSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
	if (alarm.name !== heartbeatAlarmName) {
		return;
	}

	requestMeetingSignalSync();
});
