import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import {
	consumeStream,
	convertToModelMessages,
	createIdGenerator,
	generateText,
	streamText,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	buildChatSystemPrompt,
	CHAT_TITLE_SYSTEM_PROMPT,
} from "../../../packages/ai/src/prompts.mjs";
import { fallbackChatModel, resolveChatModel } from "../src/lib/ai/models";

type ChatRequestBody = {
	id?: string;
	message?: UIMessage;
	messages?: UIMessage[];
	model?: string;
	webSearchEnabled?: boolean;
	mentions?: string[];
	selectedSourceIds?: string[];
	convexToken?: string | null;
	noteContext?: {
		noteId?: string | null;
		title?: string;
		text?: string;
	};
};

const MAX_CHAT_PREVIEW_LENGTH = 180;
const MAX_CHAT_TITLE_LENGTH = 80;
const MAX_NOTE_CONTEXT_LENGTH = 16000;
const CHAT_TITLE_MODEL = resolveChatModel("gpt-5.4-nano").model;
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

const getReferencedNoteIds = ({
	mentions,
	selectedSourceIds,
}: Pick<ChatRequestBody, "mentions" | "selectedSourceIds">): Id<"notes">[] =>
	[...(mentions ?? []), ...(selectedSourceIds ?? [])]
		.filter(
			(value, index, values): value is string =>
				Boolean(value) && values.indexOf(value) === index,
		)
		.map((value) => value as Id<"notes">);

const getNotesContext = async ({
	convexToken,
	mentions,
	selectedSourceIds,
}: Pick<ChatRequestBody, "convexToken" | "mentions" | "selectedSourceIds">) => {
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

const clampWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength: number) =>
	value.length > maxLength
		? `${value.slice(0, maxLength - 1).trimEnd()}…`
		: value;

const clampNoteContext = (value: string) =>
	value.replace(/\r/g, "").trim().slice(0, MAX_NOTE_CONTEXT_LENGTH);

const getMessageText = (message: UIMessage) =>
	clampWhitespace(
		message.parts
			.filter(
				(
					part,
				): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
					part.type === "text" &&
					typeof part.text === "string" &&
					part.text.length > 0,
			)
			.map((part) => part.text)
			.join("\n\n"),
	);

const getChatTitleFromMessage = (message: UIMessage) => {
	const text = getMessageText(message);

	return text ? truncate(text, MAX_CHAT_TITLE_LENGTH) : "New chat";
};

const sanitizeGeneratedChatTitle = (value: string) => {
	const firstLine = value.split("\n")[0] ?? "";
	const normalized = clampWhitespace(
		firstLine
			.replace(/^[#*`"'\s]+/, "")
			.replace(/^(title|chat title)\s*:\s*/i, "")
			.replace(/["'`]+$/g, ""),
	);

	return normalized ? truncate(normalized, MAX_CHAT_TITLE_LENGTH) : "New chat";
};

const generateChatTitle = async (message: UIMessage) => {
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

const getChatPreviewFromMessage = (message: UIMessage) =>
	truncate(getMessageText(message), MAX_CHAT_PREVIEW_LENGTH);

const toStoredMessage = (message: UIMessage) => ({
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

const fromStoredMessages = (
	messages: Array<{
		id: string;
		role: "system" | "user" | "assistant";
		partsJson: string;
		metadataJson?: string;
	}>,
): UIMessage[] =>
	messages.map((message) => ({
		id: message.id,
		role: message.role,
		metadata: message.metadataJson
			? (JSON.parse(message.metadataJson) as UIMessage["metadata"])
			: undefined,
		parts: JSON.parse(message.partsJson) as UIMessage["parts"],
	}));

const readJsonBody = async (request: IncomingMessage) => {
	const chunks: Uint8Array[] = [];

	for await (const chunk of request) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");

	if (!rawBody) {
		return {};
	}

	return JSON.parse(rawBody) as ChatRequestBody;
};

const sendJson = (
	response: ServerResponse,
	statusCode: number,
	payload: Record<string, string>,
) => {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json");
	response.end(JSON.stringify(payload));
};

const getInlineNoteContext = ({
	title,
	text,
}: {
	title?: string;
	text?: string;
}) => {
	const noteTitle = title?.trim() ?? "";
	const noteText = clampNoteContext(text ?? "");

	if (!noteTitle && !noteText) {
		return "";
	}

	return [
		"The current note is attached below. Use it as the primary context for this chat.",
		noteTitle ? `Current note title: ${noteTitle}` : "",
		noteText
			? `Current note content:\n${noteText}`
			: "Current note content: (empty note)",
	]
		.filter(Boolean)
		.join("\n\n");
};

const getStoredNoteContext = async ({
	client,
	noteId,
}: {
	client: ConvexHttpClient;
	noteId: Id<"notes">;
}) => {
	const notes = await client.query(api.notes.getChatContext, {
		ids: [noteId],
	});
	const note = notes[0];

	if (!note) {
		return "";
	}

	return [
		"The current note is attached below. Use it as the primary context for this chat.",
		`Current note title: ${note.title}`,
		note.searchableText
			? `Current note content:\n${clampNoteContext(note.searchableText)}`
			: "Current note content: (empty note)",
	].join("\n\n");
};

export const handleChatRequest = async (
	request: IncomingMessage,
	response: ServerResponse,
) => {
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
		noteContext,
	} = await readJsonBody(request);

	if (!Array.isArray(messages)) {
		sendJson(response, 400, {
			error: "Invalid chat payload.",
		});
		return;
	}

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
	const resolvedModel = resolveChatModel(model ?? storedChat?.model);
	const resolvedNoteId =
		(noteContext?.noteId as Id<"notes"> | null | undefined) ??
		storedChat?.noteId ??
		null;
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
	const lastUserMessage = message
		? message
		: [...chatMessages]
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
				noteId: resolvedNoteId ?? undefined,
				title: storedChat ? undefined : "New chat",
				preview: getChatPreviewFromMessage(lastUserMessage),
				model: resolvedModel?.model ?? fallbackChatModel.model,
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
	const attachedNoteContext =
		convexClient && resolvedNoteId
			? await getStoredNoteContext({
					client: convexClient,
					noteId: resolvedNoteId,
				}).catch(() =>
					getInlineNoteContext({
						title: noteContext?.title,
						text: noteContext?.text,
					}),
				)
			: getInlineNoteContext({
					title: noteContext?.title,
					text: noteContext?.text,
				});
	const systemPrompt = buildChatSystemPrompt({
		notesContext,
		attachedNoteContext,
		webSearchEnabled,
	});

	const result = streamText({
		model: openai(resolvedModel?.model ?? fallbackChatModel.model),
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
					noteId: resolvedNoteId ?? undefined,
					preview: getChatPreviewFromMessage(responseMessage),
					model: resolvedModel?.model ?? fallbackChatModel.model,
					message: toStoredMessage(responseMessage),
				});
			} catch (error) {
				console.error("Failed to persist assistant chat message", error);
			}
		},
		onError: () => "Something went wrong.",
	});
};
