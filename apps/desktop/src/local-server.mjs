import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText } from "ai";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const webDistDir = resolve(runtimeDir, "../../web/dist");
const BASE_SYSTEM_PROMPT = [
	"You are OpenMeet AI, a concise assistant for meeting notes and chat.",
	"Answer clearly and directly.",
	"If the user asks about meetings or notes that are not available in context, say that you do not have that context yet.",
].join(" ");

const chatModels = [
	{ id: "auto", model: "gpt-5.4" },
	{ id: "gpt-5.4", model: "gpt-5.4" },
	{ id: "gpt-4.1", model: "gpt-4.1" },
	{ id: "gpt-4.1-mini", model: "gpt-4.1-mini" },
	{ id: "gpt-4.1-nano", model: "gpt-4.1-nano" },
];

const mimeTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".woff2": "font/woff2",
};

const fallbackChatModel = chatModels[0];

const resolveChatModel = (value) =>
	chatModels.find((model) => model.id === value || model.model === value) ??
	fallbackChatModel;

const readJsonBody = async (request) => {
	const chunks = [];

	for await (const chunk of request) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");

	if (!rawBody) {
		return {};
	}

	return JSON.parse(rawBody);
};

const sendJson = (response, statusCode, payload) => {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json");
	response.end(JSON.stringify(payload));
};

const handleChatRequest = async (request, response) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const {
		messages = [],
		model,
		webSearchEnabled = false,
	} = await readJsonBody(request);

	if (!Array.isArray(messages)) {
		sendJson(response, 400, {
			error: "Invalid chat payload.",
		});
		return;
	}

	const selectedModel = resolveChatModel(model);
	const systemPrompt = webSearchEnabled
		? [
				BASE_SYSTEM_PROMPT,
				"Web search is enabled.",
				"Use web search when the answer would benefit from up-to-date or verifiable information.",
				"When you use web search, rely on the tool results instead of making up citations.",
			].join(" ")
		: BASE_SYSTEM_PROMPT;

	const result = streamText({
		model: openai(selectedModel.model),
		system: systemPrompt,
		messages: await convertToModelMessages(messages),
		tools: webSearchEnabled
			? {
					web_search: openai.tools.webSearch({
						searchContextSize: "medium",
						userLocation: {
							type: "approximate",
							country: "US",
						},
					}),
				}
			: undefined,
	});

	result.pipeUIMessageStreamToResponse(response, {
		originalMessages: messages,
		onError: () => "Something went wrong.",
	});
};

const resolveAssetPath = (requestPath) => {
	const normalizedPath =
		requestPath === "/"
			? "index.html"
			: normalize(requestPath)
					.replace(/^[/\\]+/, "")
					.replace(/^(\.\.[/\\])+/, "");
	const candidatePath = join(webDistDir, normalizedPath);
	const safePath = resolve(candidatePath);

	if (!safePath.startsWith(webDistDir)) {
		return null;
	}

	return safePath;
};

const serveFile = (response, filePath) => {
	response.statusCode = 200;
	response.setHeader(
		"Content-Type",
		mimeTypes[extname(filePath)] ?? "application/octet-stream",
	);
	createReadStream(filePath).pipe(response);
};

const serveStaticAsset = async (request, response) => {
	if (!existsSync(webDistDir)) {
		sendJson(response, 500, {
			error:
				"Desktop renderer bundle is missing. Run `bun run build --filter=web` first.",
		});
		return;
	}

	const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
	const assetPath = resolveAssetPath(requestUrl.pathname);

	if (!assetPath) {
		response.statusCode = 403;
		response.end("Forbidden");
		return;
	}

	try {
		const assetStats = await stat(assetPath);
		if (assetStats.isFile()) {
			serveFile(response, assetPath);
			return;
		}
	} catch {}

	serveFile(response, join(webDistDir, "index.html"));
};

export const startLocalServer = async () => {
	const server = createServer((request, response) => {
		if (request.url?.split("?")[0] === "/api/chat") {
			if (request.method !== "POST") {
				response.statusCode = 405;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ error: "Method not allowed." }));
				return;
			}

			void handleChatRequest(request, response).catch((error) => {
				const message =
					error instanceof Error ? error.message : "Unexpected server error.";
				sendJson(response, 500, { error: message });
			});
			return;
		}

		if (request.method !== "GET" && request.method !== "HEAD") {
			response.statusCode = 405;
			response.end("Method not allowed");
			return;
		}

		void serveStaticAsset(request, response).catch((error) => {
			const message =
				error instanceof Error ? error.message : "Unexpected server error.";
			response.statusCode = 500;
			response.end(message);
		});
	});

	await new Promise((resolvePromise, rejectPromise) => {
		server.once("error", rejectPromise);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", rejectPromise);
			resolvePromise();
		});
	});

	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Local desktop server did not expose a TCP port.");
	}

	return {
		origin: `http://127.0.0.1:${address.port}`,
		close: () =>
			new Promise((resolvePromise, rejectPromise) => {
				server.close((error) => {
					if (error) {
						rejectPromise(error);
						return;
					}

					resolvePromise();
				});
			}),
	};
};
