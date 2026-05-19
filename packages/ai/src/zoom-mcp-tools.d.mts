import type { ToolSet } from "ai";

export declare const DEFAULT_ZOOM_MCP_ENDPOINT: string;

export type ZoomMcpToolConnection = {
	sourceId: string;
	provider: "zoom";
	displayName: string;
	baseUrl: string;
	env?: Record<string, string>;
	oauthClientId?: string;
	oauthAccessToken: string;
};

export declare function validateZoomMcpConnection(
	connection: Pick<
		ZoomMcpToolConnection,
		"baseUrl" | "env" | "oauthClientId" | "oauthAccessToken"
	>,
): Promise<unknown[]>;

export declare function buildZoomMcpTools(
	connection: ZoomMcpToolConnection,
): Promise<ToolSet>;
