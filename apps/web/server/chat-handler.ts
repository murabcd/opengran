import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import {
	consumeStream,
	createIdGenerator,
	generateText,
	pipeAgentUIStreamToResponse,
	stepCountIs,
	ToolLoopAgent,
	tool,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	buildChatSystemPrompt,
	CHAT_TITLE_SYSTEM_PROMPT,
} from "../../../packages/ai/src/prompts.mjs";
import { findChatModel, getChatModel } from "../src/lib/ai/models";
import { getTrackerIssue, searchTrackerIssues } from "./tracker";

type ChatRequestBody = {
	id?: string;
	workspaceId?: string | null;
	message?: UIMessage;
	messages?: UIMessage[];
	model?: string;
	webSearchEnabled?: boolean;
	appsEnabled?: boolean;
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
const APP_SOURCE_PREFIX = "app:";
const WORKSPACE_SOURCE_PREFIX = "workspace:";
const CHAT_TITLE_MODEL = getChatModel("gpt-5.4-nano").model;
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
	[
		...(mentions ?? []),
		...((selectedSourceIds ?? []).filter(
			(value) =>
				!value.startsWith(APP_SOURCE_PREFIX) &&
				!value.startsWith(WORKSPACE_SOURCE_PREFIX),
		) as string[]),
	]
		.filter(
			(value, index, values): value is string =>
				Boolean(value) && values.indexOf(value) === index,
		)
		.map((value) => value as Id<"notes">);

const getSelectedAppSourceIds = ({
	selectedSourceIds,
}: Pick<ChatRequestBody, "selectedSourceIds">) =>
	(selectedSourceIds ?? []).filter((value) =>
		value.startsWith(APP_SOURCE_PREFIX),
	);

const hasWorkspaceSourceSelected = ({
	selectedSourceIds,
}: Pick<ChatRequestBody, "selectedSourceIds">) =>
	(selectedSourceIds ?? []).some((value) =>
		value.startsWith(WORKSPACE_SOURCE_PREFIX),
	);

const getNotesContext = async ({
	convexToken,
	mentions,
	selectedSourceIds,
	workspaceId,
}: Pick<
	ChatRequestBody,
	"convexToken" | "mentions" | "selectedSourceIds" | "workspaceId"
>) => {
	if (!convexToken || !workspaceId) {
		return "";
	}

	const noteIds = getReferencedNoteIds({ mentions, selectedSourceIds });
	const client = new ConvexHttpClient(getConvexUrl(), { auth: convexToken });
	const shouldUseWorkspaceScope =
		noteIds.length === 0 &&
		((selectedSourceIds ?? []).length === 0 ||
			hasWorkspaceSourceSelected({ selectedSourceIds }));
	const notes =
		noteIds.length > 0
			? await client.query(api.notes.getChatContext, {
					workspaceId: workspaceId as Id<"workspaces">,
					ids: noteIds,
				})
			: shouldUseWorkspaceScope
				? await client.query(api.notes.getWorkspaceChatContext, {
						workspaceId: workspaceId as Id<"workspaces">,
					})
				: [];

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

const getSelectedAppConnections = async ({
	convexToken,
	selectedSourceIds,
}: Pick<ChatRequestBody, "convexToken" | "selectedSourceIds">) => {
	if (!convexToken) {
		return [];
	}

	const allSelectedSourceIds = selectedSourceIds ?? [];
	const sourceIds = getSelectedAppSourceIds({ selectedSourceIds });
	const client = new ConvexHttpClient(getConvexUrl(), { auth: convexToken });

	if (allSelectedSourceIds.length === 0) {
		return await client.query(api.appConnections.getAllForChat, {});
	}

	if (sourceIds.length === 0) {
		return [];
	}

	return await client.query(api.appConnections.getSelectedForChat, {
		sourceIds,
	});
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
	workspaceId,
}: {
	client: ConvexHttpClient;
	noteId: Id<"notes">;
	workspaceId: Id<"workspaces">;
}) => {
	const notes = await client.query(api.notes.getChatContext, {
		workspaceId,
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
		workspaceId,
		webSearchEnabled = false,
		appsEnabled = true,
		mentions,
		selectedSourceIds,
		convexToken,
		noteContext,
	} = await readJsonBody(request);

	const resolvedWorkspaceId =
		(workspaceId as Id<"workspaces"> | null | undefined) ?? null;

	if (!Array.isArray(messages)) {
		sendJson(response, 400, {
			error: "Invalid chat payload.",
		});
		return;
	}

	if (convexToken && !resolvedWorkspaceId) {
		sendJson(response, 400, {
			error: "workspaceId is required.",
		});
		return;
	}

	const convexClient =
		convexToken && id
			? new ConvexHttpClient(getConvexUrl(), { auth: convexToken })
			: null;
	const storedChat =
		convexClient && id && resolvedWorkspaceId
			? await convexClient
					.query(api.chats.getSession, {
						workspaceId: resolvedWorkspaceId,
						chatId: id,
					})
					.catch(() => null)
			: null;
	const requestedModel = model ?? storedChat?.model ?? null;

	if (!requestedModel) {
		sendJson(response, 400, {
			error: "model is required.",
		});
		return;
	}

	const resolvedModel = findChatModel(requestedModel);

	if (!resolvedModel) {
		sendJson(response, 400, {
			error: `Unsupported model: ${requestedModel}.`,
		});
		return;
	}

	const resolvedNoteId =
		(noteContext?.noteId as Id<"notes"> | null | undefined) ??
		storedChat?.noteId ??
		null;
	const chatMessages = await validateUIMessages({
		messages:
			message && convexClient && id && resolvedWorkspaceId
				? [
						...fromStoredMessages(
							await convexClient.query(api.chats.getMessages, {
								workspaceId: resolvedWorkspaceId,
								chatId: id,
							}),
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

	if (convexClient && id && resolvedWorkspaceId && lastUserMessage) {
		try {
			await convexClient.mutation(api.chats.saveMessage, {
				workspaceId: resolvedWorkspaceId,
				chatId: id,
				noteId: resolvedNoteId ?? undefined,
				title: storedChat ? undefined : "New chat",
				preview: getChatPreviewFromMessage(lastUserMessage),
				model: resolvedModel.model,
				message: toStoredMessage(lastUserMessage),
			});
		} catch (error) {
			console.error("Failed to persist user chat message", error);
		}
	}

	if (convexClient && id && resolvedWorkspaceId && titlePromise) {
		void titlePromise
			.then(async (title) => {
				await convexClient.mutation(api.chats.updateTitle, {
					workspaceId: resolvedWorkspaceId,
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
		workspaceId,
	});
	const attachedNoteContext =
		convexClient && resolvedNoteId && resolvedWorkspaceId
			? await getStoredNoteContext({
					client: convexClient,
					noteId: resolvedNoteId,
					workspaceId: resolvedWorkspaceId,
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
	const selectedAppConnections = appsEnabled
		? await getSelectedAppConnections({
				convexToken,
				selectedSourceIds,
			})
		: [];
	const trackerConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "yandex-tracker",
		) ?? null;
	const trackerTools = trackerConnection
		? {
				yandex_tracker_search: tool({
					description:
						"Search the selected Yandex Tracker connection for project history, integrations, tickets, tasks, queues, comments, assignees, and status. Use this before saying context is unavailable when the request could plausibly be answered from Tracker.",
					inputSchema: z.object({
						query: z.string().min(1),
						limit: z.number().int().min(1).max(10).optional(),
					}),
					execute: async ({ query, limit }) =>
						await searchTrackerIssues(trackerConnection, query, limit ?? 5),
				}),
				yandex_tracker_get_issue: tool({
					description:
						"Fetch a specific Yandex Tracker issue by key when the user mentions a ticket like PROJ-123 or clearly refers to a known issue key.",
					inputSchema: z.object({
						issueKey: z.string().min(1),
					}),
					execute: async ({ issueKey }) =>
						await getTrackerIssue(trackerConnection, issueKey),
				}),
			}
		: {};
	const systemPrompt = `${buildChatSystemPrompt({
		notesContext,
		attachedNoteContext,
		webSearchEnabled,
	})}${
		trackerConnection
			? `\n\nThe selected app source for this chat is Yandex Tracker (${trackerConnection.displayName}). Treat it as the preferred source for project history, integrations, tickets, tasks, comments, assignees, and status. If the user's request could be answered from Tracker, search Tracker first before saying the context is unavailable.`
			: ""
	}`;
	const enabledTools = {
		...(webSearchEnabled
			? {
					web_search: openai.tools.webSearch({
						searchContextSize: "medium",
						userLocation: {
							type: "approximate",
							country: "US",
						},
					}),
				}
			: {}),
		...trackerTools,
	};

	const agent = new ToolLoopAgent({
		model: openai(resolvedModel.model),
		instructions: systemPrompt,
		tools: Object.keys(enabledTools).length > 0 ? enabledTools : undefined,
		stopWhen: Object.keys(enabledTools).length > 0 ? stepCountIs(5) : undefined,
	});

	await pipeAgentUIStreamToResponse({
		response,
		agent,
		uiMessages: chatMessages,
		originalMessages: chatMessages,
		generateMessageId,
		consumeSseStream: consumeStream,
		sendSources: true,
		onFinish: async ({ responseMessage }) => {
			if (!convexClient || !id || !resolvedWorkspaceId) {
				return;
			}

			try {
				await convexClient.mutation(api.chats.saveMessage, {
					workspaceId: resolvedWorkspaceId,
					chatId: id,
					noteId: resolvedNoteId ?? undefined,
					preview: getChatPreviewFromMessage(responseMessage),
					model: resolvedModel.model,
					message: toStoredMessage(responseMessage),
				});
			} catch (error) {
				console.error("Failed to persist assistant chat message", error);
			}
		},
		onError: () => "Something went wrong.",
	});
};
