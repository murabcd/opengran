import { listYandexUpcomingEvents } from "../../../convex/yandexCalendar.ts";
import { buildJiraTools } from "./jira-tools.mjs";
import { buildNotionTools } from "./notion-tools.mjs";
import {
	buildGoogleCalendarTools,
	buildGoogleDriveTools,
	buildYandexCalendarTools,
} from "./productivity-tools.mjs";
import { buildTrackerTools } from "./tracker-tools.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const CALENDAR_LOOKAHEAD_MS = 30 * DAY_MS;

const normalizeCalendarEvents = (
	events,
	{ limit, meetingsOnly, query } = {},
) => {
	const normalizedQuery =
		typeof query === "string" ? query.trim().toLowerCase() : "";

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

const defaultYandexCalendarAdapter = (connection) => ({
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
});

export const buildConnectedAppTools = async (connections, adapters = {}) => {
	const tools = {};

	for (const connection of connections) {
		if (connection.provider === "jira") {
			Object.assign(tools, buildJiraTools(connection));
		}

		if (connection.provider === "notion") {
			Object.assign(tools, buildNotionTools(connection));
		}

		if (connection.provider === "posthog" && adapters.posthog) {
			Object.assign(tools, await adapters.posthog.buildTools(connection));
		}

		if (connection.provider === "google-calendar" && adapters.googleCalendar) {
			Object.assign(tools, buildGoogleCalendarTools(adapters.googleCalendar));
		}

		if (connection.provider === "google-drive" && adapters.googleDrive) {
			Object.assign(tools, buildGoogleDriveTools(adapters.googleDrive));
		}

		if (connection.provider === "yandex-calendar") {
			Object.assign(
				tools,
				buildYandexCalendarTools({
					...defaultYandexCalendarAdapter(connection),
					...adapters.yandexCalendar,
				}),
			);
		}

		if (connection.provider === "yandex-tracker") {
			Object.assign(tools, buildTrackerTools(connection));
		}
	}

	return tools;
};
