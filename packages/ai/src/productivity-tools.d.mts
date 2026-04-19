import type { ToolSet } from "ai";

type CalendarToolInvoker = (args: {
	query?: string;
	limit?: number;
	meetingsOnly?: boolean;
}) => Promise<unknown>;

type DriveSearchInvoker = (args: {
	query: string;
	limit?: number;
}) => Promise<unknown>;

type DriveGetInvoker = (args: { fileId: string }) => Promise<unknown>;

export declare function buildGoogleCalendarTools(args: {
	listEvents: CalendarToolInvoker;
	searchEvents: CalendarToolInvoker;
}): ToolSet;

export declare function buildYandexCalendarTools(args: {
	listEvents: CalendarToolInvoker;
	searchEvents: CalendarToolInvoker;
}): ToolSet;

export declare function buildGoogleDriveTools(args: {
	searchFiles: DriveSearchInvoker;
	getFile: DriveGetInvoker;
}): ToolSet;
