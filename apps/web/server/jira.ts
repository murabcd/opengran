type JiraConnection = {
	sourceId: string;
	provider: "jira";
	displayName: string;
	baseUrl: string;
	email: string;
	token: string;
};

type JiraIssue = {
	key: string;
	summary: string;
	description?: string;
	status?: string;
	assignee?: string;
	url: string;
};

type JiraIssueRecord = {
	key?: unknown;
	fields?: {
		summary?: unknown;
		description?: unknown;
		status?: { name?: unknown } | unknown;
		assignee?: { displayName?: unknown } | unknown;
	} | null;
};

type JiraSearchResponse = {
	issues?: JiraIssueRecord[] | null;
};

const buildJiraUrl = (
	baseUrl: string,
	pathname: string,
	query?: Record<string, string>,
) => {
	const url = new URL(baseUrl);
	const basePath = url.pathname.endsWith("/")
		? url.pathname.slice(0, -1)
		: url.pathname;
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

	url.pathname = `${basePath}${normalizedPath}`;

	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value) {
				url.searchParams.set(key, value);
			}
		}
	}

	return url;
};

const jiraHeaders = (connection: JiraConnection) => ({
	Authorization: `Basic ${Buffer.from(`${connection.email}:${connection.token}`).toString("base64")}`,
	Accept: "application/json",
});

const toIssueUrl = (connection: JiraConnection, key: string) =>
	buildJiraUrl(
		connection.baseUrl,
		`/browse/${encodeURIComponent(key)}`,
	).toString();

const extractJiraText = (value: unknown, limit = 8000): string => {
	const parts: string[] = [];

	const push = (text: string) => {
		if (!text || parts.join("").length >= limit) {
			return;
		}

		parts.push(text);
	};

	const walk = (node: unknown) => {
		if (!node || parts.join("").length >= limit) {
			return;
		}

		if (typeof node === "string") {
			push(node);
			return;
		}

		if (Array.isArray(node)) {
			for (const item of node) {
				walk(item);
			}
			return;
		}

		if (typeof node !== "object") {
			return;
		}

		const record = node as Record<string, unknown>;

		if (typeof record.text === "string") {
			push(record.text);
		}

		if (Array.isArray(record.content)) {
			for (const item of record.content) {
				walk(item);
			}
		}
	};

	walk(value);

	return parts.join("").trim().slice(0, limit);
};

const normalizeIssue = (
	connection: JiraConnection,
	issue: JiraIssueRecord,
): JiraIssue | null => {
	if (!issue.key || typeof issue.key !== "string") {
		return null;
	}

	const fields =
		issue.fields && typeof issue.fields === "object" ? issue.fields : null;
	const summary =
		typeof fields?.summary === "string" && fields.summary.trim()
			? fields.summary
			: issue.key;
	const description = extractJiraText(fields?.description);
	const status =
		fields?.status && typeof fields.status === "object"
			? "name" in fields.status && typeof fields.status.name === "string"
				? fields.status.name
				: undefined
			: undefined;
	const assignee =
		fields?.assignee && typeof fields.assignee === "object"
			? "displayName" in fields.assignee &&
				typeof fields.assignee.displayName === "string"
				? fields.assignee.displayName
				: undefined
			: undefined;

	return {
		key: issue.key,
		summary,
		description: description || undefined,
		status,
		assignee,
		url: toIssueUrl(connection, issue.key),
	};
};

const jiraRequest = async <T>(
	connection: JiraConnection,
	method: "GET" | "POST",
	pathname: string,
	options: {
		query?: Record<string, string>;
		body?: unknown;
	} = {},
) => {
	const response = await fetch(
		buildJiraUrl(connection.baseUrl, pathname, options.query),
		{
			method,
			headers: {
				...jiraHeaders(connection),
				...(options.body ? { "Content-Type": "application/json" } : null),
			},
			body: options.body ? JSON.stringify(options.body) : undefined,
		},
	);

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		throw new Error(
			responseText.trim()
				? `Jira request failed: ${responseText.trim()}`
				: `Jira request failed (${response.status}).`,
		);
	}

	return (await response.json()) as T;
};

const buildJiraSearchJql = (query: string) => {
	const normalizedQuery = query.trim();
	const issueKeyMatch = normalizedQuery.match(/\b[A-Z][A-Z0-9]+-\d+\b/);
	const issueKeyClause = issueKeyMatch ? `key = "${issueKeyMatch[0]}"` : null;
	const terms = normalizedQuery
		.replaceAll(/["']/g, " ")
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean)
		.slice(0, 8);
	const textClause =
		terms.length === 0
			? null
			: terms.length === 1
				? `text ~ "${terms[0]}"`
				: `(${terms.map((term) => `text ~ "${term}"`).join(" OR ")})`;

	if (issueKeyClause && textClause) {
		return `(${issueKeyClause} OR ${textClause}) ORDER BY updated DESC`;
	}

	if (issueKeyClause || textClause) {
		return `${issueKeyClause ?? textClause}`.replace(/^order by/i, "ORDER BY");
	}

	throw new Error("Jira search query is empty.");
};

export const searchJiraIssues = async (
	connection: JiraConnection,
	query: string,
	limit = 5,
) => {
	const response = await jiraRequest<JiraSearchResponse>(
		connection,
		"POST",
		"/rest/api/3/search/jql",
		{
			body: {
				jql: buildJiraSearchJql(query),
				maxResults: limit,
				fields: ["summary", "description", "status", "assignee"],
			},
		},
	);
	const normalizedIssues = (response.issues ?? [])
		.map((issue) => normalizeIssue(connection, issue))
		.filter((issue): issue is JiraIssue => Boolean(issue));

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

export const getJiraIssue = async (
	connection: JiraConnection,
	issueKey: string,
) => {
	const issue = normalizeIssue(
		connection,
		await jiraRequest<JiraIssueRecord>(
			connection,
			"GET",
			`/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
			{
				query: {
					fields: "summary,description,status,assignee",
				},
			},
		),
	);

	if (!issue) {
		throw new Error("Jira issue was not found.");
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
