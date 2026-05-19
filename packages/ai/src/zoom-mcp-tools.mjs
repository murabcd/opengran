import { createMCPClient } from "@ai-sdk/mcp";

export const DEFAULT_ZOOM_MCP_ENDPOINT =
	"https://mcp.zoom.us/mcp/zoom/streamable";

const withZoomMcpClient = async (connection, callback) => {
	const headers = {};

	for (const [key, value] of Object.entries(connection.env ?? {})) {
		if (key && value) {
			headers[key] = value;
		}
	}

	if (connection.oauthAccessToken) {
		headers.Authorization = `Bearer ${connection.oauthAccessToken}`;
	}

	if (connection.oauthClientId) {
		headers["X-Client-ID"] = connection.oauthClientId;
	}

	const client = await createMCPClient({
		transport: {
			type: "http",
			url: connection.baseUrl,
			...(Object.keys(headers).length > 0 ? { headers } : {}),
			redirect: "error",
		},
		clientName: "opengran",
		version: "0.0.1",
	});

	try {
		return await callback(client);
	} finally {
		await client.close();
	}
};

const normalizeToolName = (toolName) =>
	`zoom_${toolName
		.trim()
		.replace(/[^a-zA-Z0-9_-]+/g, "_")
		.replace(/^_+|_+$/g, "")}`;

const makeUniqueToolName = (toolName, tools) => {
	const normalizedName = normalizeToolName(toolName);
	const baseName = normalizedName || "zoom_tool";
	let candidateName = baseName;
	let suffix = 2;

	while (candidateName in tools) {
		candidateName = `${baseName}_${suffix}`;
		suffix += 1;
	}

	return candidateName;
};

const executeZoomMcpTool = async (connection, definition, args, options) =>
	await withZoomMcpClient(connection, async (client) => {
		const tools = client.toolsFromDefinitions({ tools: [definition] });
		const tool = tools[definition.name];

		if (!tool?.execute) {
			throw new Error(`Zoom MCP tool "${definition.name}" is unavailable.`);
		}

		return await tool.execute(args, options);
	});

export const validateZoomMcpConnection = async (connection) =>
	await withZoomMcpClient(connection, async (client) => {
		const result = await client.listTools();
		return Array.isArray(result?.tools) ? result.tools : [];
	});

export const buildZoomMcpTools = async (connection) =>
	await withZoomMcpClient(connection, async (client) => {
		const definitions = await client.listTools();
		const discoveredTools = client.toolsFromDefinitions(definitions);
		const tools = {};

		for (const definition of definitions.tools) {
			const discoveredTool = discoveredTools[definition.name];

			if (!discoveredTool) {
				continue;
			}

			const toolName = makeUniqueToolName(definition.name, tools);

			tools[toolName] = {
				...discoveredTool,
				description: discoveredTool.description ?? definition.description,
				metadata: {
					...(discoveredTool.metadata ?? {}),
					provider: "zoom",
					source: "mcp",
					mcpToolName: definition.name,
				},
				execute: async (args, options) =>
					await executeZoomMcpTool(connection, definition, args, options),
			};
		}

		return tools;
	});
