import {
	getToolsFromContext,
	PostHogAgentToolkit,
} from "@posthog/agent-toolkit";
import { tool } from "ai";

const POSTHOG_READONLY_TOOL_NAMES = new Set([
	"dashboard-get",
	"dashboards-get-all",
	"docs-search",
	"error-details",
	"list-errors",
	"experiment-get",
	"experiment-get-all",
	"experiment-results-get",
	"feature-flag-get-all",
	"feature-flag-get-definition",
	"get-llm-total-costs-for-project",
	"insight-get",
	"insight-query",
	"insights-get-all",
	"organization-details-get",
	"organizations-get",
	"projects-get",
	"properties-list",
	"query-generate-hogql-from-question",
	"query-run",
	"survey-get",
	"surveys-get-all",
	"surveys-global-stats",
	"survey-stats",
	"event-definitions-list",
]);

const buildPostHogUrl = (baseUrl, pathname, query) => {
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

const readString = (value) =>
	typeof value === "string"
		? value.trim() || null
		: typeof value === "number"
			? String(value)
			: null;

const isRecord = (value) =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonIfPossible = (value) => {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
};

const parseToolkitResult = (value) => {
	if (!isRecord(value) || !Array.isArray(value.content)) {
		return value;
	}

	const textParts = value.content
		.map((part) =>
			isRecord(part) && typeof part.text === "string" ? part.text : null,
		)
		.filter(Boolean);

	if (textParts.length === 0) {
		return value;
	}

	if (textParts.length === 1) {
		return parseJsonIfPossible(textParts[0]);
	}

	return textParts.map(parseJsonIfPossible);
};

const toInsightUrl = (connection, value) => {
	if (!isRecord(value)) {
		return null;
	}

	const shortId = readString(value.short_id);
	const id = readString(value.id);
	const slug = shortId ?? id;

	if (!slug) {
		return null;
	}

	return buildPostHogUrl(
		connection.baseUrl,
		`/project/${encodeURIComponent(connection.projectId)}/insights/${encodeURIComponent(slug)}`,
	).toString();
};

const toFeatureFlagUrl = (connection, value) => {
	if (!isRecord(value)) {
		return null;
	}

	const id = readString(value.id);

	if (!id) {
		return null;
	}

	return buildPostHogUrl(
		connection.baseUrl,
		`/project/${encodeURIComponent(connection.projectId)}/feature_flags/${encodeURIComponent(id)}`,
	).toString();
};

const enrichToolkitResult = (connection, toolName, value) => {
	if (toolName === "insight-get" && isRecord(value)) {
		return {
			...value,
			url:
				readString(value.url) ?? toInsightUrl(connection, value) ?? undefined,
		};
	}

	if (toolName === "insights-get-all" && Array.isArray(value)) {
		return value.map((item) =>
			isRecord(item)
				? {
						...item,
						url:
							readString(item.url) ??
							toInsightUrl(connection, item) ??
							undefined,
					}
				: item,
		);
	}

	if (
		toolName === "insight-query" &&
		isRecord(value) &&
		isRecord(value.insight)
	) {
		return {
			...value,
			insight: {
				...value.insight,
				url:
					readString(value.insight.url) ??
					toInsightUrl(connection, value.insight) ??
					undefined,
			},
		};
	}

	if (toolName === "feature-flag-get-definition" && isRecord(value)) {
		return {
			...value,
			url:
				readString(value.url) ??
				toFeatureFlagUrl(connection, value) ??
				undefined,
		};
	}

	if (toolName === "feature-flag-get-all" && Array.isArray(value)) {
		return value.map((item) =>
			isRecord(item)
				? {
						...item,
						url:
							readString(item.url) ??
							toFeatureFlagUrl(connection, item) ??
							undefined,
					}
				: item,
		);
	}

	return value;
};

const getSourceTitle = (value, url) =>
	readString(value.title) ??
	readString(value.name) ??
	readString(value.key) ??
	readString(value.short_id) ??
	readString(value.id) ??
	(() => {
		try {
			return new URL(url).hostname.replace(/^www\./, "");
		} catch {
			return url;
		}
	})();

const collectSources = (value) => {
	const sources = [];
	const seen = new Set();

	const addSource = (url, title) => {
		const key = `${url}::${title}`;

		if (seen.has(key)) {
			return;
		}

		seen.add(key);
		sources.push({
			type: "url",
			url,
			title,
		});
	};

	const visit = (node) => {
		if (Array.isArray(node)) {
			for (const item of node) {
				visit(item);
			}
			return;
		}

		if (!isRecord(node)) {
			return;
		}

		const url = readString(node.url);

		if (url && /^https?:\/\//.test(url)) {
			addSource(url, getSourceTitle(node, url));
		}

		for (const child of Object.values(node)) {
			visit(child);
		}
	};

	visit(value);
	return sources;
};

const toLocalToolName = (toolName) =>
	`posthog_${toolName.replaceAll("-", "_")}`;

const buildToolResult = (connection, toolName, value) => {
	const result = enrichToolkitResult(
		connection,
		toolName,
		parseToolkitResult(value),
	);

	return {
		connection: connection.projectName,
		result,
		sources: collectSources(result),
	};
};

const pinProject = async (context, connection) => {
	await context.cache.set("projectId", connection.projectId);
};

const createToolkit = (connection) =>
	new PostHogAgentToolkit({
		posthogApiToken: connection.token,
		posthogApiBaseUrl: connection.baseUrl,
	});

const wrapToolkitTool = (connection, context, posthogTool) =>
	tool({
		description: posthogTool.description,
		inputSchema: posthogTool.schema,
		execute: async (input) => {
			await pinProject(context, connection);
			const value = await posthogTool.handler(context, input);
			return buildToolResult(connection, posthogTool.name, value);
		},
	});

export const buildPostHogTools = async (connection) => {
	const toolkit = createToolkit(connection);
	const context = toolkit.getContext();

	await pinProject(context, connection);

	const toolkitTools = (await getToolsFromContext(context)).filter((toolDef) =>
		POSTHOG_READONLY_TOOL_NAMES.has(toolDef.name),
	);

	return Object.fromEntries(
		toolkitTools.map((posthogTool) => [
			toLocalToolName(posthogTool.name),
			wrapToolkitTool(connection, context, posthogTool),
		]),
	);
};
