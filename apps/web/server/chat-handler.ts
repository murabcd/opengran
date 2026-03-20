import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
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
