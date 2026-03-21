import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import {
	consumeStream,
	convertToModelMessages,
	createIdGenerator,
	streamText,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { fallbackChatModel, resolveChatModel } from "../src/lib/ai/models";

const BASE_SYSTEM_PROMPT = [
	"You are OpenGran AI, a concise assistant for meeting notes and chat.",
	"Answer clearly and directly.",
	"If the user asks about meetings or notes that are not available in context, say that you do not have that context yet.",
].join(" ");

type ChatRequestBody = {
	id?: string;
	message?: UIMessage;
	messages?: UIMessage[];
	model?: string;
	webSearchEnabled?: boolean;
	mentions?: string[];
	selectedSourceIds?: string[];
	convexToken?: string | null;
};

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

const getReferencedNoteIds = ({
	mentions,
	selectedSourceIds,
}: Pick<ChatRequestBody, "mentions" | "selectedSourceIds">) =>
	[...(mentions ?? []), ...(selectedSourceIds ?? [])].filter(
		(value, index, values) => value && values.indexOf(value) === index,
	);

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

const clampWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength: number) =>
	value.length > maxLength
		? `${value.slice(0, maxLength - 1).trimEnd()}…`
		: value;

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
	const lastUserMessage = message
		? message
		: [...chatMessages]
				.reverse()
				.find((currentMessage) => currentMessage.role === "user");

	if (convexClient && id && lastUserMessage) {
		try {
			await convexClient.mutation(api.chats.saveMessage, {
				chatId: id,
				title: getChatTitleFromMessage(lastUserMessage),
				preview: getChatPreviewFromMessage(lastUserMessage),
				model: selectedModel?.model ?? fallbackChatModel.model,
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
		model: openai(selectedModel?.model ?? fallbackChatModel.model),
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
					model: selectedModel?.model ?? fallbackChatModel.model,
					message: toStoredMessage(responseMessage),
				});
			} catch (error) {
				console.error("Failed to persist assistant chat message", error);
			}
		},
		onError: () => "Something went wrong.",
	});
};
