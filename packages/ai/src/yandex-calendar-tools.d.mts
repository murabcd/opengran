import type { ToolSet } from "ai";
import type { AiToolDefinition } from "./ai-tool-definition.mjs";

type YandexCalendarToolInvoker = (args: {
	query?: string;
	limit?: number;
	meetingsOnly?: boolean;
}) => Promise<unknown>;

export declare function buildYandexCalendarTools(args: {
	listEvents: YandexCalendarToolInvoker;
	searchEvents: YandexCalendarToolInvoker;
}): ToolSet;

export declare function buildYandexCalendarToolDefinitions(args: {
	listEvents: YandexCalendarToolInvoker;
	searchEvents: YandexCalendarToolInvoker;
}): AiToolDefinition[];
