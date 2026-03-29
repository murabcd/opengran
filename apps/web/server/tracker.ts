type YandexTrackerConnection = {
	sourceId: string;
	provider: "yandex-tracker";
	displayName: string;
	orgType: "x-org-id" | "x-cloud-org-id";
	orgId: string;
	token: string;
};

type TrackerIssue = {
	key: string;
	summary: string;
	status?: string;
	assignee?: string;
	url: string;
};

type TrackerIssueRecord = {
	key?: unknown;
	summary?: unknown;
	status?: { display?: unknown; key?: unknown } | unknown;
	assignee?: { display?: unknown; login?: unknown } | unknown;
	self?: unknown;
};

const TRACKER_API_BASE_URL =
	process.env.TRACKER_API_BASE_URL ?? "https://api.tracker.yandex.net";
const TRACKER_HOST_BASE_URL =
	process.env.TRACKER_HOST_BASE_URL ?? "https://tracker.yandex.ru";

const getTrackerOrgHeader = (
	orgType: YandexTrackerConnection["orgType"],
): "X-Org-Id" | "X-Cloud-Org-Id" =>
	orgType === "x-cloud-org-id" ? "X-Cloud-Org-Id" : "X-Org-Id";

const buildTrackerUrl = (
	baseUrl: string,
	pathname: string,
	query?: Record<string, string>,
) => {
	const url = new URL(pathname, baseUrl);

	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value) {
				url.searchParams.set(key, value);
			}
		}
	}

	return url;
};

const trackerHeaders = (connection: YandexTrackerConnection) => ({
	Authorization: `OAuth ${connection.token}`,
	[getTrackerOrgHeader(connection.orgType)]: connection.orgId,
});

const toIssueUrl = (key: string) =>
	buildTrackerUrl(
		TRACKER_HOST_BASE_URL,
		`/issue/${encodeURIComponent(key)}`,
	).toString();

const normalizeIssue = (issue: TrackerIssueRecord): TrackerIssue | null => {
	if (!issue.key || typeof issue.key !== "string") {
		return null;
	}

	const status =
		issue.status && typeof issue.status === "object" && issue.status !== null
			? "display" in issue.status && typeof issue.status.display === "string"
				? issue.status.display
				: "key" in issue.status && typeof issue.status.key === "string"
					? issue.status.key
					: undefined
			: undefined;
	const assignee =
		issue.assignee &&
		typeof issue.assignee === "object" &&
		issue.assignee !== null
			? "display" in issue.assignee &&
				typeof issue.assignee.display === "string"
				? issue.assignee.display
				: "login" in issue.assignee && typeof issue.assignee.login === "string"
					? issue.assignee.login
					: undefined
			: undefined;

	return {
		key: issue.key,
		summary:
			typeof issue.summary === "string" && issue.summary.trim()
				? issue.summary
				: issue.key,
		status,
		assignee,
		url: toIssueUrl(issue.key),
	};
};

const trackerRequest = async <T>(
	connection: YandexTrackerConnection,
	method: "GET" | "POST",
	pathname: string,
	options: {
		query?: Record<string, string>;
		body?: unknown;
	} = {},
) => {
	const response = await fetch(
		buildTrackerUrl(TRACKER_API_BASE_URL, pathname, options.query),
		{
			method,
			headers: {
				...trackerHeaders(connection),
				...(options.body ? { "Content-Type": "application/json" } : null),
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
		},
	);

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		throw new Error(
			responseText.trim()
				? `Tracker request failed: ${responseText.trim()}`
				: `Tracker request failed (${response.status}).`,
		);
	}

	return (await response.json()) as T;
};

export const searchTrackerIssues = async (
	connection: YandexTrackerConnection,
	query: string,
	limit = 5,
) => {
	const issues = await trackerRequest<TrackerIssueRecord[]>(
		connection,
		"POST",
		"/v3/issues/_search",
		{
			query: {
				perPage: String(limit),
			},
			body: {
				query,
			},
		},
	);
	const normalizedIssues = issues
		.map(normalizeIssue)
		.filter((issue): issue is TrackerIssue => Boolean(issue));

	return {
		connection: connection.displayName,
		issues: normalizedIssues,
		sources: normalizedIssues.map((issue) => ({
			type: "url" as const,
			url: issue.url,
			title: issue.key,
		})),
	};
};

export const getTrackerIssue = async (
	connection: YandexTrackerConnection,
	issueKey: string,
) => {
	const issue = normalizeIssue(
		await trackerRequest<TrackerIssueRecord>(
			connection,
			"GET",
			`/v3/issues/${encodeURIComponent(issueKey)}`,
		),
	);

	if (!issue) {
		throw new Error("Tracker issue was not found.");
	}

	return {
		connection: connection.displayName,
		issue,
		sources: [
			{
				type: "url" as const,
				url: issue.url,
				title: issue.key,
			},
		],
	};
};

export type { YandexTrackerConnection };
