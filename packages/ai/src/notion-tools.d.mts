import type { ToolSet } from "ai";

export declare const DEFAULT_NOTION_MCP_ENDPOINT: string;

export type NotionMcpToolConnection = {
	sourceId: string;
	provider: "notion";
	displayName: string;
	baseUrl: string;
	env?: Record<string, string>;
	oauthClientId?: string;
	oauthAccessToken: string;
};

export declare function validateNotionMcpConnection(
	connection: Pick<
		NotionMcpToolConnection,
		"baseUrl" | "env" | "oauthClientId" | "oauthAccessToken"
	>,
): Promise<unknown[]>;

export declare function buildNotionTools(
	connection: NotionMcpToolConnection,
): Promise<ToolSet>;
