import {
	buildRemoteMcpTools,
	validateRemoteMcpConnection,
} from "./remote-mcp-tools.mjs";

export const DEFAULT_JIRA_MCP_ENDPOINT = "https://mcp.atlassian.com/v1/mcp";

export const validateJiraMcpConnection = async (connection) =>
	await validateRemoteMcpConnection({
		provider: "jira-mcp",
		toolPrefix: "jira",
		displayName: "Jira",
		...connection,
	});

export const buildJiraMcpTools = async (connection) =>
	await buildRemoteMcpTools({
		...connection,
		toolPrefix: "jira",
	});
