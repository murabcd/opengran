import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { openai } from "@ai-sdk/openai";
import {
	consumeStream,
	convertToModelMessages,
	createIdGenerator,
	generateText,
	Output,
	streamText,
	validateUIMessages,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../convex/_generated/api.js";
import {
	buildChatSystemPrompt,
	buildEnhancedNotePrompt,
	CHAT_TITLE_SYSTEM_PROMPT,
	ENHANCED_NOTE_SYSTEM_PROMPT,
} from "../../../packages/ai/src/prompts.mjs";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const webDistDir = resolve(runtimeDir, "../../web/dist");

const chatModels = [
	{ id: "auto", model: "gpt-5.4" },
	{ id: "gpt-5.4", model: "gpt-5.4" },
	{ id: "gpt-5.4-mini", model: "gpt-5.4-mini" },
	{ id: "gpt-5.4-nano", model: "gpt-5.4-nano" },
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
const CHAT_TITLE_MODEL = "gpt-5.4-nano";
const preferredExtensionBridgePorts = Array.from(
	{ length: 20 },
	(_value, index) => 42831 + index,
);
const generateMessageId = createIdGenerator({
	prefix: "msg",
	size: 16,
});
const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024;
/** @typedef {{ end?: number, speaker?: string, start?: number, text?: string }} DiarizedTranscriptSegment */
const structuredNoteSchema = z.object({
	title: z.string().min(1),
	overview: z.array(z.string()),
	sections: z
		.array(
			z.object({
				title: z.string().min(1),
				items: z.array(z.string()).min(1),
			}),
		)
		.min(1),
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
	const notes = await client.query(api.notes.getChatContext, {
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

const sanitizeGeneratedChatTitle = (value) => {
	const firstLine = value.split("\n")[0] ?? "";
	const normalized = clampWhitespace(
		firstLine
			.replace(/^[#*`"'\s]+/, "")
			.replace(/^(title|chat title)\s*:\s*/i, "")
			.replace(/["'`]+$/g, ""),
	);

	return normalized ? truncate(normalized, MAX_CHAT_TITLE_LENGTH) : "New chat";
};

const generateChatTitle = async (message) => {
	const messageText = getMessageText(message);

	if (!messageText) {
		return "New chat";
	}

	try {
		const { text } = await generateText({
			model: openai(CHAT_TITLE_MODEL),
			system: CHAT_TITLE_SYSTEM_PROMPT,
			prompt: messageText,
		});

		return sanitizeGeneratedChatTitle(text);
	} catch (error) {
		console.error("Failed to generate chat title", error);
		return getChatTitleFromMessage(message);
	}
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

const setExtensionBridgeHeaders = (response) => {
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type");
	response.setHeader("Cache-Control", "no-store");
};

const createFormDataRequest = (request) =>
	new Request("http://127.0.0.1/api/refine-transcript-audio", {
		method: request.method,
		headers: new Headers(
			Object.entries(request.headers).flatMap(([key, value]) => {
				if (value == null) {
					return [];
				}

				return Array.isArray(value)
					? value.map((entry) => [key, entry])
					: [[key, value]];
			}),
		),
		body:
			request.method === "GET" || request.method === "HEAD"
				? undefined
				: Readable.toWeb(request),
		duplex: "half",
	});

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
	const storedChat =
		convexClient && id
			? await convexClient
					.query(api.chats.getSession, { chatId: id })
					.catch(() => null)
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
	const shouldGenerateChatTitle = Boolean(
		convexClient && id && lastUserMessage && !storedChat,
	);
	const titlePromise = shouldGenerateChatTitle
		? generateChatTitle(lastUserMessage)
		: null;

	if (convexClient && id && lastUserMessage) {
		try {
			await convexClient.mutation(api.chats.saveMessage, {
				chatId: id,
				title: storedChat ? undefined : "New chat",
				preview: getChatPreviewFromMessage(lastUserMessage),
				model: selectedModel.model,
				message: toStoredMessage(lastUserMessage),
			});
		} catch (error) {
			console.error("Failed to persist user chat message", error);
		}
	}

	if (convexClient && id && titlePromise) {
		void titlePromise
			.then(async (title) => {
				await convexClient.mutation(api.chats.updateTitle, {
					chatId: id,
					title,
				});
			})
			.catch((error) => {
				console.error("Failed to persist generated chat title", error);
			});
	}

	const notesContext = await getNotesContext({
		convexToken,
		mentions,
		selectedSourceIds,
	});
	const systemPrompt = buildChatSystemPrompt({
		notesContext,
		webSearchEnabled,
	});

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

const handleRealtimeTranscriptionSessionRequest = async (request, response) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const { lang } = await readJsonBody(request);
	const language = lang?.trim().toLowerCase();

	const sessionResponse = await fetch(
		"https://api.openai.com/v1/realtime/client_secrets",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				expires_after: {
					anchor: "created_at",
					seconds: 600,
				},
				session: {
					type: "transcription",
					audio: {
						input: {
							noise_reduction: {
								type: "near_field",
							},
							turn_detection: {
								type: "server_vad",
								threshold: 0.5,
								prefix_padding_ms: 300,
								silence_duration_ms: 200,
							},
							transcription: {
								model: "gpt-4o-transcribe",
								...(language ? { language } : {}),
							},
						},
					},
				},
			}),
		},
	);

	const payload = await sessionResponse.json().catch(() => ({}));

	if (!sessionResponse.ok) {
		sendJson(response, sessionResponse.status, {
			error:
				payload?.error?.message ||
				"Failed to create realtime transcription session.",
		});
		return;
	}

	const clientSecret = payload?.value ?? payload?.client_secret?.value;
	const expiresAt =
		payload?.expires_at ?? payload?.client_secret?.expires_at ?? null;

	if (!clientSecret) {
		sendJson(response, 500, {
			error: "OpenAI did not return a client secret.",
		});
		return;
	}

	sendJson(response, 200, {
		clientSecret,
		expiresAt,
	});
};

const handleEnhanceNoteRequest = async (request, response) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const {
		title = "",
		rawNotes = "",
		transcript = "",
		noteText = "",
	} = await readJsonBody(request);

	const trimmedTranscript = transcript.trim();
	const trimmedNoteText = noteText.trim();

	if (!trimmedTranscript && !trimmedNoteText) {
		sendJson(response, 400, {
			error: "Transcript or note text is required.",
		});
		return;
	}

	const { output } = await generateText({
		model: openai("gpt-5.4-mini"),
		system: ENHANCED_NOTE_SYSTEM_PROMPT,
		output: Output.object({
			schema: structuredNoteSchema,
		}),
		prompt: buildEnhancedNotePrompt({
			title,
			rawNotes,
			transcript: trimmedTranscript,
			noteText: trimmedNoteText,
		}),
	});

	sendJson(response, 200, {
		note: output,
	});
};

const handleRefineTranscriptAudioRequest = async (request, response) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const formData = await createFormDataRequest(request).formData();
	const audioValue = formData.get("audio");
	const langValue = formData.get("lang");
	const language =
		typeof langValue === "string" && langValue.trim()
			? langValue.trim().toLowerCase()
			: null;

	if (!(audioValue instanceof File)) {
		sendJson(response, 400, {
			error: "Audio file is required.",
		});
		return;
	}

	if (audioValue.size === 0) {
		sendJson(response, 400, {
			error: "Audio file is empty.",
		});
		return;
	}

	if (audioValue.size > MAX_AUDIO_FILE_SIZE_BYTES) {
		sendJson(response, 413, {
			error: "Audio file exceeds the 25 MB transcription limit.",
		});
		return;
	}

	const openAiFormData = new FormData();
	openAiFormData.append(
		"file",
		audioValue,
		audioValue.name || "system-audio.webm",
	);
	openAiFormData.append("model", "gpt-4o-transcribe-diarize");
	openAiFormData.append("response_format", "diarized_json");
	openAiFormData.append("chunking_strategy", "auto");
	if (language) {
		openAiFormData.append("language", language);
	}

	const transcriptionResponse = await fetch(
		"https://api.openai.com/v1/audio/transcriptions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			},
			body: openAiFormData,
		},
	);
	const payload =
		/** @type {{ error?: { message?: string }, segments?: DiarizedTranscriptSegment[], text?: string }} */ (
			await transcriptionResponse.json().catch(() => ({}))
		);

	if (!transcriptionResponse.ok || !payload?.text?.trim()) {
		sendJson(
			response,
			transcriptionResponse.ok ? 502 : transcriptionResponse.status,
			{
				error:
					payload?.error?.message ||
					"Failed to refine the system audio transcript.",
			},
		);
		return;
	}

	sendJson(response, 200, {
		segments: Array.isArray(payload?.segments)
			? payload.segments
					.filter(
						(segment) =>
							typeof segment.speaker === "string" &&
							typeof segment.text === "string" &&
							typeof segment.start === "number" &&
							typeof segment.end === "number",
					)
					.map((segment) => ({
						speaker: segment.speaker,
						text: segment.text.trim(),
						start: segment.start,
						end: segment.end,
					}))
			: [],
		text: payload.text.trim(),
	});
};

const resolveAssetPath = (requestPath, distDir, basePath = "/") => {
	const normalizedBasePath =
		basePath === "/" ? "/" : `/${basePath.replace(/^\/+|\/+$/g, "")}`;
	const relativePath =
		normalizedBasePath === "/"
			? requestPath
			: requestPath.startsWith(normalizedBasePath)
				? requestPath.slice(normalizedBasePath.length) || "/"
				: requestPath;
	const normalizedPath =
		relativePath === "/"
			? "index.html"
			: normalize(relativePath)
					.replace(/^[/\\]+/, "")
					.replace(/^(\.\.[/\\])+/, "");
	const candidatePath = join(distDir, normalizedPath);
	const safePath = resolve(candidatePath);

	if (!safePath.startsWith(distDir)) {
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

const serveStaticAsset = async (request, response, options = {}) => {
	const {
		distDir = webDistDir,
		basePath = "/",
		missingBundleMessage = "Desktop renderer bundle is missing.",
	} = options;

	if (!existsSync(distDir)) {
		sendJson(response, 500, {
			error: missingBundleMessage,
		});
		return;
	}

	const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
	const assetPath = resolveAssetPath(requestUrl.pathname, distDir, basePath);

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

	serveFile(response, join(distDir, "index.html"));
};

export const startLocalServer = async ({
	onAuthCallback,
	onBrowserMeetingSignal,
} = {}) => {
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

		if (request.url?.split("?")[0] === "/api/realtime-transcription-session") {
			if (request.method !== "POST") {
				response.statusCode = 405;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ error: "Method not allowed." }));
				return;
			}

			void handleRealtimeTranscriptionSessionRequest(request, response).catch(
				(error) => {
					const message =
						error instanceof Error ? error.message : "Unexpected server error.";
					sendJson(response, 500, { error: message });
				},
			);
			return;
		}

		if (request.url?.split("?")[0] === "/api/enhance-note") {
			if (request.method !== "POST") {
				response.statusCode = 405;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ error: "Method not allowed." }));
				return;
			}

			void handleEnhanceNoteRequest(request, response).catch((error) => {
				const message =
					error instanceof Error ? error.message : "Unexpected server error.";
				sendJson(response, 500, { error: message });
			});
			return;
		}

		if (request.url?.split("?")[0] === "/api/refine-transcript-audio") {
			if (request.method !== "POST") {
				response.statusCode = 405;
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ error: "Method not allowed." }));
				return;
			}

			void handleRefineTranscriptAudioRequest(request, response).catch(
				(error) => {
					const message =
						error instanceof Error ? error.message : "Unexpected server error.";
					sendJson(response, 500, { error: message });
				},
			);
			return;
		}

		if (requestUrl.pathname === "/api/browser-meeting-bridge-info") {
			setExtensionBridgeHeaders(response);

			if (request.method === "OPTIONS") {
				response.statusCode = 204;
				response.end();
				return;
			}

			if (request.method !== "GET") {
				sendJson(response, 405, { error: "Method not allowed." });
				return;
			}

			sendJson(response, 200, {
				app: "OpenGran",
				bridge: "browser-meeting",
				version: 1,
			});
			return;
		}

		if (requestUrl.pathname === "/api/browser-meeting-signal") {
			setExtensionBridgeHeaders(response);

			if (request.method === "OPTIONS") {
				response.statusCode = 204;
				response.end();
				return;
			}

			if (request.method !== "POST") {
				sendJson(response, 405, { error: "Method not allowed." });
				return;
			}

			void readJsonBody(request)
				.then(async (payload) => {
					await onBrowserMeetingSignal?.(payload);
					sendJson(response, 200, { ok: true });
				})
				.catch((error) => {
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

	let lastListenError = null;

	for (const port of preferredExtensionBridgePorts) {
		try {
			await new Promise((resolvePromise, rejectPromise) => {
				server.once("error", rejectPromise);
				server.listen(port, "127.0.0.1", () => {
					server.off("error", rejectPromise);
					resolvePromise();
				});
			});
			lastListenError = null;
			break;
		} catch (error) {
			server.removeAllListeners("error");
			lastListenError = error;
		}
	}

	if (lastListenError !== null && !server.listening) {
		await new Promise((resolvePromise, rejectPromise) => {
			server.once("error", rejectPromise);
			server.listen(0, "127.0.0.1", () => {
				server.off("error", rejectPromise);
				resolvePromise();
			});
		});
	}

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
