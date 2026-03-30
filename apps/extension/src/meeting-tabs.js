export const supportedMeetingQueryPatterns = [
	"https://meet.google.com/*",
	"https://telemost.yandex.ru/*",
	"https://telemost.360.yandex.ru/*",
	"https://*.zoom.us/*",
	"https://teams.microsoft.com/*",
	"https://*.teams.microsoft.com/*",
];

const normalizePathname = (pathname) => {
	const normalizedPathname = pathname.replace(/\/+$/, "");
	return normalizedPathname.length > 0 ? normalizedPathname : "/";
};

const isGoogleMeetCodePath = (pathname) =>
	/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(normalizePathname(pathname));

const isGoogleMeetLookupPath = (pathname) =>
	/^\/lookup\/[\w.-]+$/i.test(normalizePathname(pathname));

const isSupportedMeetingUrl = (value) => {
	if (typeof value !== "string" || value.length === 0) {
		return false;
	}

	let parsedUrl = null;
	try {
		parsedUrl = new URL(value);
	} catch {
		return false;
	}

	if (parsedUrl.protocol !== "https:") {
		return false;
	}

	const hostname = parsedUrl.hostname.toLowerCase();
	return (
		hostname === "meet.google.com" ||
		hostname === "telemost.yandex.ru" ||
		hostname === "telemost.360.yandex.ru" ||
		hostname.endsWith(".zoom.us") ||
		hostname === "teams.microsoft.com" ||
		hostname.endsWith(".teams.microsoft.com")
	);
};

const providerMatchers = [
	{
		id: "google-meet",
		sourceName: "Google Meet",
		match: ({ hostname, pathname }) =>
			hostname === "meet.google.com" &&
			(isGoogleMeetCodePath(pathname) || isGoogleMeetLookupPath(pathname)),
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

const compareMeetingTabs = (left, right) => {
	if (left.active !== right.active) {
		return left.active ? -1 : 1;
	}

	const leftLastAccessed =
		typeof left.lastAccessed === "number" ? left.lastAccessed : 0;
	const rightLastAccessed =
		typeof right.lastAccessed === "number" ? right.lastAccessed : 0;
	if (leftLastAccessed !== rightLastAccessed) {
		return rightLastAccessed - leftLastAccessed;
	}

	const leftId =
		typeof left.id === "number" ? left.id : Number.MAX_SAFE_INTEGER;
	const rightId =
		typeof right.id === "number" ? right.id : Number.MAX_SAFE_INTEGER;
	return leftId - rightId;
};

export const getMeetingTabs = (tabs) =>
	tabs
		.map((tab) => ({
			detection: detectMeetingFromTab(tab),
			tab,
		}))
		.filter((entry) => entry.detection !== null)
		.sort((left, right) => compareMeetingTabs(left.tab, right.tab));

export const getMeetingSignalPayload = (tabs) => {
	const [preferredMeetingTab] = getMeetingTabs(tabs);

	if (!preferredMeetingTab) {
		return {
			active: false,
			detectedAt: Date.now(),
			providerId: null,
			sourceName: null,
			tabId: null,
			tabTitle: null,
			url: null,
			urlHost: null,
		};
	}

	return preferredMeetingTab.detection;
};

export const getTrackedMeetingTabIds = (tabs) =>
	new Set(
		getMeetingTabs(tabs)
			.map(({ tab }) => tab.id)
			.filter((tabId) => typeof tabId === "number"),
	);

export { isSupportedMeetingUrl };
