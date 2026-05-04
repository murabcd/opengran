import type { ToolSet } from "ai";
import type { JiraToolConnection } from "./jira-tools.mjs";
import type { NotionToolConnection } from "./notion-tools.mjs";
import type { PostHogToolConnection } from "./posthog-tools.mjs";
import type { TrackerToolConnection } from "./tracker-tools.mjs";

export type YandexCalendarToolConnection = {
	sourceId: string;
	provider: "yandex-calendar";
	displayName: string;
	email: string;
	password: string;
	serverAddress: string;
	calendarHomePath: string;
};

export type GoogleCalendarToolConnection = {
	id: string;
	provider: "google-calendar";
	title: string;
	preview: string;
};

export type GoogleDriveToolConnection = {
	id: string;
	provider: "google-drive";
	title: string;
	preview: string;
};

export type ConnectedAppToolConnection =
	| JiraToolConnection
	| NotionToolConnection
	| PostHogToolConnection
	| TrackerToolConnection
	| YandexCalendarToolConnection
	| GoogleCalendarToolConnection
	| GoogleDriveToolConnection;

export type ConnectedAppToolAdapters = {
	googleCalendar?: {
		listEvents(args: {
			limit?: number;
			meetingsOnly?: boolean;
		}): Promise<unknown>;
		searchEvents(args: {
			query: string;
			limit?: number;
			meetingsOnly?: boolean;
		}): Promise<unknown>;
	};
	googleDrive?: {
		searchFiles(args: { query: string; limit?: number }): Promise<unknown>;
		getFile(args: { fileId: string }): Promise<unknown>;
	};
	yandexCalendar?: {
		listEvents(args: {
			limit?: number;
			meetingsOnly?: boolean;
		}): Promise<unknown>;
		searchEvents(args: {
			query: string;
			limit?: number;
			meetingsOnly?: boolean;
		}): Promise<unknown>;
	};
};

export declare function buildConnectedAppTools(
	connections: ConnectedAppToolConnection[],
	adapters?: ConnectedAppToolAdapters,
): Promise<ToolSet>;
