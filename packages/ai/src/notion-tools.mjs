import { tool } from "ai";
import { z } from "zod";

const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";
const MAX_MARKDOWN_LENGTH = 12000;
const MAX_ROW_COUNT = 10;
const MAX_SEARCH_RESULTS = 10;
const UUID_PATTERN =
	/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i;

const truncateText = (value, maxLength = MAX_MARKDOWN_LENGTH) => {
	if (typeof value !== "string") {
		return "";
	}

	return value.length > maxLength
		? `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
		: value;
};

const isRecord = (value) =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const notionHeaders = (token, hasBody = false) => ({
	Authorization: `Bearer ${token}`,
	Accept: "application/json",
	"Notion-Version": NOTION_API_VERSION,
	...(hasBody ? { "Content-Type": "application/json" } : {}),
});

const getErrorMessage = async (response, fallbackMessage) => {
	const payload = await response.json().catch(() => null);

	if (isRecord(payload) && typeof payload.message === "string") {
		return payload.message.trim() || fallbackMessage;
	}

	const responseText = await response.text().catch(() => "");

	return responseText.trim() || fallbackMessage;
};

const notionRequest = async (
	connection,
	method,
	pathname,
	{ body, query } = {},
) => {
	const normalizedPathname = pathname.replace(/^\/+/, "");
	const url = new URL(`${NOTION_API_BASE_URL}/${normalizedPathname}`);

	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value === undefined || value === null || value === "") {
				continue;
			}

			url.searchParams.set(key, String(value));
		}
	}

	const response = await fetch(url, {
		method,
		headers: notionHeaders(connection.token, body !== undefined),
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		throw new Error(
			await getErrorMessage(
				response,
				`Notion request failed (${response.status}).`,
			),
		);
	}

	return await response.json();
};

const isFetchFallbackError = (error) =>
	error instanceof Error &&
	/not found|could not find|validation_error|invalid uuid/i.test(error.message);

const normalizeNotionId = (value) => {
	const trimmedValue = value.trim();
	const match = trimmedValue.match(UUID_PATTERN);

	if (!match) {
		return null;
	}

	const normalized = match[0].replaceAll("-", "").toLowerCase();

	return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`;
};

const extractRichText = (value) => {
	if (!Array.isArray(value)) {
		return "";
	}

	return value
		.map((item) =>
			isRecord(item) && typeof item.plain_text === "string"
				? item.plain_text
				: "",
		)
		.join("")
		.trim();
};

const extractPageTitle = (page) => {
	if (!isRecord(page) || !isRecord(page.properties)) {
		return page?.id ?? "Untitled page";
	}

	for (const property of Object.values(page.properties)) {
		if (!isRecord(property) || property.type !== "title") {
			continue;
		}

		const title = extractRichText(property.title);

		if (title) {
			return title;
		}
	}

	return page.id ?? "Untitled page";
};

const extractDataSourceTitle = (dataSource) => {
	if (!isRecord(dataSource)) {
		return "Untitled database";
	}

	const title =
		extractRichText(dataSource.title) ||
		(typeof dataSource.name === "string" ? dataSource.name.trim() : "");

	return title || dataSource.id || "Untitled database";
};

const extractDatabaseTitle = (database) => {
	if (!isRecord(database)) {
		return "Untitled database";
	}

	const title =
		extractRichText(database.title) ||
		(typeof database.name === "string" ? database.name.trim() : "");

	return title || database.id || "Untitled database";
};

const summarizeFormulaValue = (formula) => {
	if (!isRecord(formula) || typeof formula.type !== "string") {
		return null;
	}

	switch (formula.type) {
		case "string":
			return formula.string ?? null;
		case "number":
			return formula.number ?? null;
		case "boolean":
			return formula.boolean ?? null;
		case "date":
			return summarizeDateValue(formula.date);
		default:
			return null;
	}
};

const summarizeDateValue = (date) => {
	if (!isRecord(date) || typeof date.start !== "string") {
		return null;
	}

	return typeof date.end === "string"
		? `${date.start} -> ${date.end}`
		: date.start;
};

const summarizeFiles = (files) => {
	if (!Array.isArray(files)) {
		return null;
	}

	const values = files
		.map((file) => {
			if (!isRecord(file)) {
				return null;
			}

			if (typeof file.name === "string" && file.name.trim()) {
				return file.name.trim();
			}

			if (isRecord(file.external) && typeof file.external.url === "string") {
				return file.external.url;
			}

			if (isRecord(file.file) && typeof file.file.url === "string") {
				return file.file.url;
			}

			return null;
		})
		.filter(Boolean)
		.slice(0, 5);

	return values.length > 0 ? values : null;
};

const summarizeRollupValue = (rollup) => {
	if (!isRecord(rollup) || typeof rollup.type !== "string") {
		return null;
	}

	switch (rollup.type) {
		case "number":
			return rollup.number ?? null;
		case "date":
			return summarizeDateValue(rollup.date);
		case "array":
			return Array.isArray(rollup.array)
				? truncateText(JSON.stringify(rollup.array.slice(0, 5)), 1000)
				: null;
		default:
			return null;
	}
};

const summarizeVerificationValue = (verification) => {
	if (!isRecord(verification)) {
		return null;
	}

	const state =
		typeof verification.state === "string" ? verification.state : null;
	const date =
		isRecord(verification.date) && typeof verification.date.start === "string"
			? verification.date.start
			: null;

	if (!state && !date) {
		return null;
	}

	return [state, date].filter(Boolean).join(" • ");
};

const summarizeUser = (value) => {
	if (!isRecord(value)) {
		return null;
	}

	if (typeof value.name === "string" && value.name.trim()) {
		return value.name.trim();
	}

	if (typeof value.id === "string" && value.id.trim()) {
		return value.id.trim();
	}

	return null;
};

const summarizePropertyValue = (property) => {
	if (!isRecord(property) || typeof property.type !== "string") {
		return null;
	}

	switch (property.type) {
		case "title":
			return extractRichText(property.title) || null;
		case "rich_text":
			return extractRichText(property.rich_text) || null;
		case "number":
			return property.number ?? null;
		case "checkbox":
			return typeof property.checkbox === "boolean" ? property.checkbox : null;
		case "select":
			return isRecord(property.select) ? (property.select.name ?? null) : null;
		case "multi_select":
			return Array.isArray(property.multi_select)
				? property.multi_select
						.map((item) => (isRecord(item) ? (item.name ?? null) : null))
						.filter(Boolean)
				: null;
		case "status":
			return isRecord(property.status) ? (property.status.name ?? null) : null;
		case "date":
			return summarizeDateValue(property.date);
		case "people":
			return Array.isArray(property.people)
				? property.people.map(summarizeUser).filter(Boolean).slice(0, 10)
				: null;
		case "relation":
			return Array.isArray(property.relation)
				? property.relation
						.map((item) => (isRecord(item) ? (item.id ?? null) : null))
						.filter(Boolean)
						.slice(0, 10)
				: null;
		case "url":
		case "email":
		case "phone_number":
			return property[property.type] ?? null;
		case "files":
			return summarizeFiles(property.files);
		case "formula":
			return summarizeFormulaValue(property.formula);
		case "rollup":
			return summarizeRollupValue(property.rollup);
		case "created_time":
		case "last_edited_time":
			return property[property.type] ?? null;
		case "created_by":
		case "last_edited_by":
			return summarizeUser(property[property.type]);
		case "unique_id":
			return isRecord(property.unique_id)
				? `${property.unique_id.prefix ?? ""}${property.unique_id.number ?? ""}`
				: null;
		case "verification":
			return summarizeVerificationValue(property.verification);
		default:
			return null;
	}
};

const summarizePageProperties = (page) => {
	if (!isRecord(page) || !isRecord(page.properties)) {
		return {};
	}

	const summary = {};

	for (const [name, property] of Object.entries(page.properties)) {
		const value = summarizePropertyValue(property);

		if (
			value === null ||
			value === undefined ||
			(Array.isArray(value) && value.length === 0) ||
			value === ""
		) {
			continue;
		}

		summary[name] = value;
	}

	return summary;
};

const toSource = (url, title) => ({
	type: "url",
	url,
	title,
});

const mapSearchResult = (result) => {
	if (!isRecord(result) || typeof result.object !== "string") {
		return null;
	}

	if (result.object === "page") {
		const title = extractPageTitle(result);
		return {
			id: result.id,
			object: "page",
			title,
			url: result.url,
			lastEditedTime: result.last_edited_time ?? null,
		};
	}

	if (result.object === "data_source") {
		const title = extractDataSourceTitle(result);
		return {
			id: result.id,
			object: "data_source",
			title,
			url: result.url,
			lastEditedTime: result.last_edited_time ?? null,
		};
	}

	return null;
};

export const searchNotion = async (connection, query, limit = 5) => {
	const normalizedLimit = Math.min(Math.max(limit, 1), MAX_SEARCH_RESULTS);
	const response = await notionRequest(connection, "POST", "/search", {
		body: {
			query: query.trim(),
			page_size: normalizedLimit,
			sort: {
				timestamp: "last_edited_time",
				direction: "descending",
			},
		},
	});
	const results = Array.isArray(response.results)
		? response.results.map(mapSearchResult).filter(Boolean)
		: [];

	return {
		connection: connection.displayName,
		results,
		sources: results
			.filter((item) => typeof item.url === "string" && item.url)
			.map((item) => toSource(item.url, item.title)),
	};
};

const fetchPage = async (connection, pageId) => {
	const [page, pageMarkdown] = await Promise.all([
		notionRequest(connection, "GET", `/pages/${encodeURIComponent(pageId)}`),
		notionRequest(
			connection,
			"GET",
			`/pages/${encodeURIComponent(pageId)}/markdown`,
		),
	]);
	const title = extractPageTitle(page);
	const markdown =
		isRecord(pageMarkdown) && typeof pageMarkdown.markdown === "string"
			? pageMarkdown.markdown
			: "";
	const url =
		isRecord(page) && typeof page.url === "string" && page.url
			? page.url
			: null;

	return {
		connection: connection.displayName,
		object: "page",
		page: {
			id: page.id,
			title,
			url,
			lastEditedTime: page.last_edited_time ?? null,
			properties: summarizePageProperties(page),
		},
		markdown: truncateText(markdown),
		markdownTruncated:
			markdown.length > MAX_MARKDOWN_LENGTH ||
			(Boolean(pageMarkdown?.truncated) &&
				typeof pageMarkdown?.truncated === "boolean"),
		unknownBlockIds:
			Array.isArray(pageMarkdown?.unknown_block_ids) &&
			pageMarkdown.unknown_block_ids.length > 0
				? pageMarkdown.unknown_block_ids.slice(0, 20)
				: [],
		sources: url ? [toSource(url, title)] : [],
	};
};

const fetchDataSource = async (connection, dataSourceId) => {
	const [dataSource, queryResult] = await Promise.all([
		notionRequest(
			connection,
			"GET",
			`/data_sources/${encodeURIComponent(dataSourceId)}`,
		),
		notionRequest(
			connection,
			"POST",
			`/data_sources/${encodeURIComponent(dataSourceId)}/query`,
			{
				body: {
					page_size: MAX_ROW_COUNT,
				},
			},
		),
	]);
	const title = extractDataSourceTitle(dataSource);
	const rows = Array.isArray(queryResult.results)
		? queryResult.results
				.filter((row) => isRecord(row) && row.object === "page")
				.map((row) => ({
					id: row.id,
					title: extractPageTitle(row),
					url: row.url ?? null,
					lastEditedTime: row.last_edited_time ?? null,
					properties: summarizePageProperties(row),
				}))
		: [];
	const properties =
		isRecord(dataSource.properties) && dataSource.properties
			? Object.fromEntries(
					Object.entries(dataSource.properties).map(([name, property]) => [
						name,
						isRecord(property) && typeof property.type === "string"
							? property.type
							: "unknown",
					]),
				)
			: {};
	const url =
		typeof dataSource.url === "string" && dataSource.url
			? dataSource.url
			: null;

	return {
		connection: connection.displayName,
		object: "data_source",
		dataSource: {
			id: dataSource.id,
			title,
			url,
			lastEditedTime: dataSource.last_edited_time ?? null,
			properties,
		},
		rows,
		hasMore:
			typeof queryResult.has_more === "boolean" ? queryResult.has_more : false,
		sources: [
			...(url ? [toSource(url, title)] : []),
			...rows
				.filter((row) => typeof row.url === "string" && row.url)
				.map((row) => toSource(row.url, row.title)),
		],
	};
};

const fetchDatabase = async (connection, databaseId) => {
	const database = await notionRequest(
		connection,
		"GET",
		`/databases/${encodeURIComponent(databaseId)}`,
	);
	const title = extractDatabaseTitle(database);
	const dataSources = Array.isArray(database.data_sources)
		? database.data_sources
				.map((dataSource) =>
					isRecord(dataSource)
						? {
								id: dataSource.id,
								name:
									typeof dataSource.name === "string" && dataSource.name.trim()
										? dataSource.name.trim()
										: dataSource.id,
							}
						: null,
				)
				.filter(Boolean)
		: [];
	const url =
		typeof database.url === "string" && database.url ? database.url : null;
	const primaryDataSource = dataSources[0]
		? await fetchDataSource(connection, dataSources[0].id).catch(() => null)
		: null;

	return {
		connection: connection.displayName,
		object: "database",
		database: {
			id: database.id,
			title,
			url,
			lastEditedTime: database.last_edited_time ?? null,
			dataSources,
		},
		primaryDataSource,
		sources: url ? [toSource(url, title)] : [],
	};
};

export const fetchNotionItem = async (connection, idOrUrl) => {
	const normalizedId = normalizeNotionId(idOrUrl);

	if (!normalizedId) {
		throw new Error(
			"Notion fetch expects a Notion page, database, or data source ID or URL.",
		);
	}

	try {
		return await fetchPage(connection, normalizedId);
	} catch (error) {
		if (!isFetchFallbackError(error)) {
			throw error;
		}
	}

	try {
		return await fetchDataSource(connection, normalizedId);
	} catch (error) {
		if (!isFetchFallbackError(error)) {
			throw error;
		}
	}

	try {
		return await fetchDatabase(connection, normalizedId);
	} catch (_error) {
		throw new Error(
			"Notion page, database, or data source was not found or is not shared with the integration.",
		);
	}
};

export const buildNotionTools = (connection) => ({
	notion_search: tool({
		description:
			"Search the connected Notion workspace for pages and databases by title when the user's request could plausibly be answered from Notion.",
		inputSchema: z.object({
			query: z.string().min(1),
			limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
		}),
		execute: async ({ query, limit }) =>
			await searchNotion(connection, query, limit ?? 5),
	}),
	notion_fetch: tool({
		description:
			"Fetch a specific Notion page, database, or data source by URL or ID. Use this when the user shares a Notion link or clearly points to a known page or database.",
		inputSchema: z.object({
			idOrUrl: z.string().min(1),
		}),
		execute: async ({ idOrUrl }) => await fetchNotionItem(connection, idOrUrl),
	}),
});
