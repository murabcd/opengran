import {
	buildRemoteMcpTools,
	validateRemoteMcpConnection,
} from "./remote-mcp-tools.mjs";

export const DEFAULT_POSTHOG_MCP_ENDPOINT = "https://mcp.posthog.com/mcp";

export const validatePostHogMcpConnection = async (connection) =>
	await validateRemoteMcpConnection({
		provider: "posthog",
		displayName: "PostHog",
		...connection,
	});

export const buildPostHogTools = async (connection) =>
	await buildRemoteMcpTools(connection);
