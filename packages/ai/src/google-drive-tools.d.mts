import type { ToolSet } from "ai";
import type { AiToolDefinition } from "./ai-tool-definition.mjs";

type GoogleDriveSearchInvoker = (args: {
	query: string;
	limit?: number;
}) => Promise<unknown>;

type GoogleDriveGetInvoker = (args: { fileId: string }) => Promise<unknown>;

export declare function buildGoogleDriveTools(args: {
	searchFiles: GoogleDriveSearchInvoker;
	getFile: GoogleDriveGetInvoker;
}): ToolSet;

export declare function buildGoogleDriveToolDefinitions(args: {
	searchFiles: GoogleDriveSearchInvoker;
	getFile: GoogleDriveGetInvoker;
}): AiToolDefinition[];
