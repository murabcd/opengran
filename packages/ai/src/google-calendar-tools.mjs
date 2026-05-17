import { z } from "zod";
import { buildAiToolSet, defineAiTool } from "./ai-tool-definition.mjs";
import { toolUiMetadata } from "./tool-ui-metadata.mjs";

export const buildGoogleCalendarToolDefinitions = ({
	listEvents,
	searchEvents,
}) => [
	defineAiTool({
		name: "google_calendar_list_events",
		description:
			"List upcoming Google Calendar events from the connected Google account. Use this for meeting schedules, upcoming availability, and calendar context.",
		inputSchema: z.object({
			limit: z.number().int().min(1).max(25).optional(),
			meetingsOnly: z.boolean().optional(),
		}),
		policy: {
			access: "read",
			capability: "read",
			provider: "google-calendar",
			requiresConnection: true,
		},
		ui: toolUiMetadata.google_calendar_list_events,
		execute: async ({ limit, meetingsOnly }) =>
			await listEvents({ limit, meetingsOnly }),
	}),
	defineAiTool({
		name: "google_calendar_search_events",
		description:
			"Search Google Calendar events by title, calendar name, location, or meeting URL when the user asks about a specific meeting, date, or event.",
		inputSchema: z.object({
			query: z.string().min(1),
			limit: z.number().int().min(1).max(25).optional(),
			meetingsOnly: z.boolean().optional(),
		}),
		policy: {
			access: "read",
			capability: "search",
			provider: "google-calendar",
			requiresConnection: true,
		},
		ui: toolUiMetadata.google_calendar_search_events,
		execute: async ({ query, limit, meetingsOnly }) =>
			await searchEvents({ query, limit, meetingsOnly }),
	}),
];

export const buildGoogleCalendarTools = (args) =>
	buildAiToolSet(buildGoogleCalendarToolDefinitions(args));
