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

export type ConnectedAppToolConnection =
	| JiraToolConnection
	| NotionToolConnection
	| PostHogToolConnection
	| TrackerToolConnection
	| YandexCalendarToolConnection;

export declare function buildConnectedAppTools(
	connections: ConnectedAppToolConnection[],
): Promise<ToolSet>;
