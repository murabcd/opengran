import { tool } from "ai";
import { z } from "zod";
import { buildJiraTools } from "./jira-tools.mjs";
import { buildNotionTools } from "./notion-tools.mjs";
import { buildYandexCalendarTools } from "./productivity-tools.mjs";
import { buildTrackerTools } from "./tracker-tools.mjs";
import { listYandexUpcomingEvents } from "../../../convex/yandexCalendar.ts";

const MAX_POSTHOG_RESULT_LENGTH = 12000;

const truncateResult = (value) => {
	const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);

	return text.length > MAX_POSTHOG_RESULT_LENGTH
		? `${text.slice(0, MAX_POSTHOG_RESULT_LENGTH - 1).trimEnd()}…`
		: text;
};

const buildPostHogUrl = (connection, pathname, query) => {
	const url = new URL(connection.baseUrl);
	const basePath = url.pathname.endsWith("/")
		? url.pathname.slice(0, -1)
		: url.pathname;
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

	url.pathname = `${basePath}${normalizedPath}`;
	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined && value !== null && value !== "") {
				url.searchParams.set(key, String(value));
			}
		}
	}
	return url;
};

const posthogRequest = async (connection, method, pathname, { body, query } = {}) => {
	const response = await fetch(buildPostHogUrl(connection, pathname, query), {
		method,
		headers: {
			Authorization: `Bearer ${connection.token}`,
			Accept: "application/json",
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		throw new Error(
			payload?.detail ||
				payload?.error ||
				payload?.message ||
				`PostHog request failed (${response.status}).`,
		);
	}

	return payload;
};

const buildPostHogTools = (connection) => ({
	posthog_run_hogql: tool({
		description:
			"Run a read-only HogQL query against the connected PostHog project.",
		inputSchema: z.object({
			query: z
				.string()
				.min(1)
				.describe("A read-only HogQL query, usually starting with SELECT."),
		}),
		execute: async ({ query }) => {
			const trimmedQuery = query.trim();

			if (!/^select\b/i.test(trimmedQuery)) {
				throw new Error("Only read-only SELECT HogQL queries are allowed.");
			}

			const result = await posthogRequest(
				connection,
				"POST",
				`/api/projects/${encodeURIComponent(connection.projectId)}/query/`,
				{
					body: {
						query: {
							kind: "HogQLQuery",
							query: trimmedQuery,
						},
					},
				},
			);

			return {
				connection: connection.projectName,
				result: truncateResult(result),
			};
		},
	}),
	posthog_list_insights: tool({
		description:
			"List recent insights from the connected PostHog project with names and IDs.",
		inputSchema: z.object({
			limit: z.number().int().min(1).max(20).default(10),
		}),
		execute: async ({ limit }) => {
			const result = await posthogRequest(
				connection,
				"GET",
				`/api/projects/${encodeURIComponent(connection.projectId)}/insights/`,
				{ query: { limit } },
			);

			return {
				connection: connection.projectName,
				result: truncateResult(result),
			};
		},
	}),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_LOOKAHEAD_MS = 30 * DAY_MS;

const normalizeCalendarEvents = (events, { limit, meetingsOnly, query } = {}) => {
	const normalizedQuery = typeof query === "string" ? query.trim().toLowerCase() : "";

	return events
		.filter((event) => {
			if (meetingsOnly && !event.isMeeting) {
				return false;
			}

			if (!normalizedQuery) {
				return true;
			}

			return [
				event.title,
				event.calendarName,
				event.location,
				event.meetingUrl,
				event.description,
			]
				.filter(Boolean)
				.join(" ")
				.toLowerCase()
				.includes(normalizedQuery);
		})
		.slice(0, Math.max(1, Math.min(limit ?? 10, 25)));
};

const buildCalendarSources = (events) =>
	events
		.map((event) =>
			event.meetingUrl
				? {
						type: "url",
						url: event.meetingUrl,
						title: event.title || event.calendarName,
					}
				: null,
		)
		.filter(Boolean);

const fetchYandexCalendarEvents = async (connection, args = {}) => {
	const now = Date.now();
	const result = await listYandexUpcomingEvents({
		connection,
		now,
		timeMin: now,
		timeMax: now + CALENDAR_LOOKAHEAD_MS,
	});
	const events = normalizeCalendarEvents(result.events, args);

	return {
		connection: connection.displayName,
		events,
		sources: buildCalendarSources(events),
	};
};

export const buildConnectedAppTools = async (connections) => {
	const tools = {};

	for (const connection of connections) {
		if (connection.provider === "jira") {
			Object.assign(tools, buildJiraTools(connection));
		}

		if (connection.provider === "notion") {
			Object.assign(tools, buildNotionTools(connection));
		}

		if (connection.provider === "posthog") {
			Object.assign(tools, buildPostHogTools(connection));
		}

		if (connection.provider === "yandex-calendar") {
			Object.assign(
				tools,
				buildYandexCalendarTools({
					listEvents: async ({ limit, meetingsOnly }) =>
						await fetchYandexCalendarEvents(connection, {
							limit,
							meetingsOnly,
						}),
					searchEvents: async ({ query, limit, meetingsOnly }) =>
						await fetchYandexCalendarEvents(connection, {
							query,
							limit,
							meetingsOnly,
						}),
				}),
			);
		}

		if (connection.provider === "yandex-tracker") {
			Object.assign(tools, buildTrackerTools(connection));
		}
	}

	return tools;
};
