import { tool } from "ai";
import { z } from "zod";

export const buildGoogleCalendarTools = ({ listEvents, searchEvents }) => ({
	google_calendar_list_events: tool({
		description:
			"List upcoming Google Calendar events from the connected Google account. Use this for meeting schedules, upcoming availability, and calendar context.",
		inputSchema: z.object({
			limit: z.number().int().min(1).max(25).optional(),
			meetingsOnly: z.boolean().optional(),
		}),
		execute: async ({ limit, meetingsOnly }) =>
			await listEvents({ limit, meetingsOnly }),
	}),
	google_calendar_search_events: tool({
		description:
			"Search Google Calendar events by title, calendar name, location, or meeting URL when the user asks about a specific meeting, date, or event.",
		inputSchema: z.object({
			query: z.string().min(1),
			limit: z.number().int().min(1).max(25).optional(),
			meetingsOnly: z.boolean().optional(),
		}),
		execute: async ({ query, limit, meetingsOnly }) =>
			await searchEvents({ query, limit, meetingsOnly }),
	}),
});

export const buildYandexCalendarTools = ({ listEvents, searchEvents }) => ({
	yandex_calendar_list_events: tool({
		description:
			"List upcoming Yandex Calendar events from the connected Yandex account. Use this for schedules, upcoming meetings, and calendar context.",
		inputSchema: z.object({
			limit: z.number().int().min(1).max(25).optional(),
			meetingsOnly: z.boolean().optional(),
		}),
		execute: async ({ limit, meetingsOnly }) =>
			await listEvents({ limit, meetingsOnly }),
	}),
	yandex_calendar_search_events: tool({
		description:
			"Search Yandex Calendar events by title, calendar name, location, or meeting URL when the user asks about a specific meeting, date, or event.",
		inputSchema: z.object({
			query: z.string().min(1),
			limit: z.number().int().min(1).max(25).optional(),
			meetingsOnly: z.boolean().optional(),
		}),
		execute: async ({ query, limit, meetingsOnly }) =>
			await searchEvents({ query, limit, meetingsOnly }),
	}),
});

export const buildGoogleDriveTools = ({ searchFiles, getFile }) => ({
	google_drive_search_files: tool({
		description:
			"Search the connected Google Drive for documents, files, spreadsheets, and presentations by name or indexed content.",
		inputSchema: z.object({
			query: z.string().min(1),
			limit: z.number().int().min(1).max(10).optional(),
		}),
		execute: async ({ query, limit }) => await searchFiles({ query, limit }),
	}),
	google_drive_get_file: tool({
		description:
			"Fetch metadata and a text excerpt for a specific Google Drive file by file ID when the user has already identified the file to inspect.",
		inputSchema: z.object({
			fileId: z.string().min(1),
		}),
		execute: async ({ fileId }) => await getFile({ fileId }),
	}),
});
