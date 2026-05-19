import {
	buildRemoteMcpTools,
	validateRemoteMcpConnection,
} from "./remote-mcp-tools.mjs";

export const DEFAULT_ZOOM_MCP_ENDPOINT =
	"https://mcp.zoom.us/mcp/zoom/streamable";

export const validateZoomMcpConnection = async (connection) =>
	await validateRemoteMcpConnection({
		provider: "zoom",
		displayName: "Zoom",
		includeOAuthClientIdHeader: true,
		...connection,
	});

export const buildZoomMcpTools = async (connection) =>
	await buildRemoteMcpTools({
		...connection,
		includeOAuthClientIdHeader: true,
	});
