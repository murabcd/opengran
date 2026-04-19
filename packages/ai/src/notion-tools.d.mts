import type { ToolSet } from "ai";

export type NotionToolConnection = {
	sourceId: string;
	provider: "notion";
	displayName: string;
	token: string;
};

export type NotionSearchResult = {
	id: string;
	object: "page" | "data_source";
	title: string;
	url?: string | null;
	lastEditedTime?: string | null;
};

export declare function searchNotion(
	connection: NotionToolConnection,
	query: string,
	limit?: number,
): Promise<{
	connection: string;
	results: NotionSearchResult[];
	sources: Array<{
		type: "url";
		url: string;
		title: string;
	}>;
}>;

export declare function fetchNotionItem(
	connection: NotionToolConnection,
	idOrUrl: string,
): Promise<{
	connection: string;
	object: "page" | "data_source" | "database";
	sources: Array<{
		type: "url";
		url: string;
		title: string;
	}>;
}>;

export declare function buildNotionTools(
	connection: NotionToolConnection,
): ToolSet;
