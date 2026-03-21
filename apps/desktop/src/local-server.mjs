import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import {
	consumeStream,
	convertToModelMessages,
	createIdGenerator,
	streamText,
	validateUIMessages,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api.js";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const webDistDir = resolve(runtimeDir, "../../web/dist");
const BASE_SYSTEM_PROMPT = [
	"You are OpenGran AI, a concise assistant for meeting notes and chat.",
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
const MAX_CHAT_PREVIEW_LENGTH = 180;
const MAX_CHAT_TITLE_LENGTH = 80;
const generateMessageId = createIdGenerator({
	prefix: "msg",
	size: 16,
});

const getConvexUrl = () => {
	const value = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;

	if (!value) {
		throw new Error("CONVEX_URL is not configured.");
	}

	return value;
};

const getReferencedNoteIds = ({ mentions, selectedSourceIds }) =>
	[...(mentions ?? []), ...(selectedSourceIds ?? [])].filter(
		(value, index, values) => value && values.indexOf(value) === index,
	);

const getNotesContext = async ({
	convexToken,
	mentions,
	selectedSourceIds,
}) => {
	if (!convexToken) {
		return "";
	}

	const noteIds = getReferencedNoteIds({ mentions, selectedSourceIds });

	if (noteIds.length === 0) {
		return "";
	}

	const client = new ConvexHttpClient(getConvexUrl(), { auth: convexToken });
	const notes = await client.query(api.quickNotes.getChatContext, {
		ids: noteIds,
	});

	if (notes.length === 0) {
		return "";
	}

	return [
		"Attached notes are available below. Use them when they are relevant to the user's request.",
		...notes.map((note, index) =>
			[
				`Note ${index + 1}: ${note.title}`,
				note.searchableText || "(empty note)",
			].join("\n"),
		),
	].join("\n\n");
};

const clampWhitespace = (value) => value.replace(/\s+/g, " ").trim();

const truncate = (value, maxLength) =>
	value.length > maxLength
		? `${value.slice(0, maxLength - 1).trimEnd()}…`
		: value;

const getMessageText = (message) =>
	clampWhitespace(
		message.parts
			.filter(
				(part) =>
					part.type === "text" &&
					typeof part.text === "string" &&
					part.text.length > 0,
			)
			.map((part) => part.text)
			.join("\n\n"),
	);

const getChatTitleFromMessage = (message) => {
	const text = getMessageText(message);

	return text ? truncate(text, MAX_CHAT_TITLE_LENGTH) : "New chat";
};

const getChatPreviewFromMessage = (message) =>
	truncate(getMessageText(message), MAX_CHAT_PREVIEW_LENGTH);

const toStoredMessage = (message) => ({
	id: message.id || generateMessageId(),
	role: message.role,
	partsJson: JSON.stringify(message.parts),
	metadataJson:
		message.metadata === undefined
			? undefined
			: JSON.stringify(message.metadata),
	text: getMessageText(message),
	createdAt: Date.now(),
});

const fromStoredMessages = (messages) =>
	messages.map((message) => ({
		id: message.id,
		role: message.role,
		metadata:
			message.metadataJson === undefined
				? undefined
				: JSON.parse(message.metadataJson),
		parts: JSON.parse(message.partsJson),
	}));

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
		id,
		message,
		messages = [],
		model,
		webSearchEnabled = false,
		mentions,
		selectedSourceIds,
		convexToken,
	} = await readJsonBody(request);

	if (!Array.isArray(messages)) {
		sendJson(response, 400, {
			error: "Invalid chat payload.",
		});
		return;
	}

	const selectedModel = resolveChatModel(model);
	const convexClient =
		convexToken && id
			? new ConvexHttpClient(getConvexUrl(), { auth: convexToken })
			: null;
	const chatMessages = await validateUIMessages({
		messages:
			message && convexClient && id
				? [
						...fromStoredMessages(
							await convexClient.query(api.chats.getMessages, { chatId: id }),
						),
						message,
					]
				: message
					? [message]
					: messages,
	});
	const lastUserMessage =
		message ??
		[...chatMessages]
			.reverse()
			.find((currentMessage) => currentMessage.role === "user");

	if (convexClient && id && lastUserMessage) {
		try {
			await convexClient.mutation(api.chats.saveMessage, {
				chatId: id,
				title: getChatTitleFromMessage(lastUserMessage),
				preview: getChatPreviewFromMessage(lastUserMessage),
				model: selectedModel.model,
				message: toStoredMessage(lastUserMessage),
			});
		} catch (error) {
			console.error("Failed to persist user chat message", error);
		}
	}

	const notesContext = await getNotesContext({
		convexToken,
		mentions,
		selectedSourceIds,
	});
	const systemPrompt = webSearchEnabled
		? [
				BASE_SYSTEM_PROMPT,
				notesContext,
				"Web search is enabled.",
				"Use web search when the answer would benefit from up-to-date or verifiable information.",
				"When you use web search, rely on the tool results instead of making up citations.",
			].join(" ")
		: [BASE_SYSTEM_PROMPT, notesContext].filter(Boolean).join(" ");

	const result = streamText({
		model: openai(selectedModel.model),
		system: systemPrompt,
		messages: await convertToModelMessages(chatMessages),
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
		originalMessages: chatMessages,
		generateMessageId,
		consumeSseStream: consumeStream,
		onFinish: async ({ responseMessage }) => {
			if (!convexClient || !id) {
				return;
			}

			try {
				await convexClient.mutation(api.chats.saveMessage, {
					chatId: id,
					preview: getChatPreviewFromMessage(responseMessage),
					model: selectedModel.model,
					message: toStoredMessage(responseMessage),
				});
			} catch (error) {
				console.error("Failed to persist assistant chat message", error);
			}
		},
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

export const startLocalServer = async ({ onAuthCallback } = {}) => {
	const server = createServer((request, response) => {
		const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

		if (requestUrl.pathname === "/auth/callback") {
			void Promise.resolve(onAuthCallback?.(requestUrl.toString()))
				.then(() => {
					response.statusCode = 200;
					response.setHeader("Content-Type", "text/html; charset=utf-8");
					response.end(`<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>OpenGran</title>
	</head>
	<body style="margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0a0a;color:#fafafa;display:grid;place-items:center;min-height:100vh;">
		<div style="text-align:center;padding:24px;">
			<p style="margin:0 0 8px;font-size:18px;font-weight:600;">Authentication complete</p>
			<p style="margin:0;color:#a1a1aa;">You can close this window and return to OpenGran.</p>
		</div>
	</body>
</html>`);
				})
				.catch((error) => {
					const message =
						error instanceof Error ? error.message : "Authentication failed.";
					response.statusCode = 500;
					response.setHeader("Content-Type", "text/plain; charset=utf-8");
					response.end(message);
				});
			return;
		}

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
