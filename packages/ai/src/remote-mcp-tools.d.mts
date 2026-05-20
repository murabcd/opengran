import type { ToolSet } from "ai";

export type RemoteMcpToolConnection = {
	sourceId?: string;
	provider: string;
	displayName: string;
	baseUrl: string;
	toolPrefix?: string;
	env?: Record<string, string>;
	oauthClientId?: string;
	oauthAccessToken: string;
	includeOAuthClientIdHeader?: boolean;
};

export declare function validateRemoteMcpConnection(
	connection: RemoteMcpToolConnection,
): Promise<unknown[]>;

export declare function buildRemoteMcpTools(
	connection: RemoteMcpToolConnection,
): Promise<ToolSet>;
