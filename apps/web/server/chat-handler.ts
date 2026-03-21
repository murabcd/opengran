import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { fallbackChatModel, resolveChatModel } from "../src/lib/ai/models";

const BASE_SYSTEM_PROMPT = [
	"You are OpenGran AI, a concise assistant for meeting notes and chat.",
	"Answer clearly and directly.",
	"If the user asks about meetings or notes that are not available in context, say that you do not have that context yet.",
].join(" ");

type ChatRequestBody = {
	messages?: UIMessage[];
	model?: string;
	webSearchEnabled?: boolean;
	mentions?: string[];
	selectedSourceIds?: string[];
	convexToken?: string | null;
};

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
