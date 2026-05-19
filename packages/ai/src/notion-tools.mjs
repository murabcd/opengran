import {
	buildRemoteMcpTools,
	validateRemoteMcpConnection,
} from "./remote-mcp-tools.mjs";

export const DEFAULT_NOTION_MCP_ENDPOINT = "https://mcp.notion.com/mcp";

export const validateNotionMcpConnection = async (connection) =>
	await validateRemoteMcpConnection({
		provider: "notion",
		displayName: "Notion",
		...connection,
	});

export const buildNotionTools = async (connection) =>
	await buildRemoteMcpTools(connection);
