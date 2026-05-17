import type { ToolSet } from "ai";
import type { AiToolDefinition } from "./ai-tool-definition.mjs";

type GoogleCalendarToolInvoker = (args: {
	query?: string;
	limit?: number;
	meetingsOnly?: boolean;
}) => Promise<unknown>;

export declare function buildGoogleCalendarTools(args: {
	listEvents: GoogleCalendarToolInvoker;
	searchEvents: GoogleCalendarToolInvoker;
}): ToolSet;

export declare function buildGoogleCalendarToolDefinitions(args: {
	listEvents: GoogleCalendarToolInvoker;
	searchEvents: GoogleCalendarToolInvoker;
}): AiToolDefinition[];
