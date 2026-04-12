import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import {
	consumeStream,
	createIdGenerator,
	generateText,
	type InferUITools,
	pipeAgentUIStreamToResponse,
	stepCountIs,
	ToolLoopAgent,
	type ToolSet,
	tool,
	type UIMessage,
	validateUIMessages,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	buildChatTitlePrompt,
	deriveFallbackChatTitle,
	finalizeGeneratedChatTitle,
} from "../../../packages/ai/src/chat-titles.mjs";
import {
	buildChatSystemPrompt,
	CHAT_TITLE_SYSTEM_PROMPT,
} from "../../../packages/ai/src/prompts.mjs";
import { findChatModel, getChatModel } from "../src/lib/ai/models";
import { getJiraIssue, searchJiraIssues } from "./jira";
import { getTrackerIssue, searchTrackerIssues } from "./tracker";

type ChatRequestBody = {
	id?: string;
	workspaceId?: string | null;
	trigger?: "submit-message" | "regenerate-message";
	messageId?: string;
	message?: UIMessage;
	messages?: UIMessage[];
	model?: string;
	webSearchEnabled?: boolean;
	appsEnabled?: boolean;
	mentions?: string[];
	selectedSourceIds?: string[];
	convexToken?: string | null;
	recipeSlug?: string | null;
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
	workspaceId,
}: Pick<
	ChatRequestBody,
	"convexToken" | "selectedSourceIds" | "workspaceId"
>) => {
	if (!convexToken || !workspaceId) {
		return [];
	}

	const allSelectedSourceIds = selectedSourceIds ?? [];
	const sourceIds = getSelectedAppSourceIds({ selectedSourceIds });
	const client = new ConvexHttpClient(getConvexUrl(), { auth: convexToken });

	if (allSelectedSourceIds.length === 0) {
		return await client.query(api.appConnections.getAllForChat, {
			workspaceId: workspaceId as Id<"workspaces">,
		});
	}

	if (sourceIds.length === 0) {
		return [];
	}

	return await client.query(api.appConnections.getSelectedForChat, {
		workspaceId: workspaceId as Id<"workspaces">,
		sourceIds,
	});
};

const getSelectedRecipe = async ({
	convexToken,
	recipeSlug,
	workspaceId,
}: Pick<ChatRequestBody, "convexToken" | "recipeSlug" | "workspaceId">) => {
	if (!convexToken || !recipeSlug || !workspaceId) {
		return null;
	}

	const client = new ConvexHttpClient(getConvexUrl(), { auth: convexToken });
	const recipes = await client.query(api.recipes.list, {
		workspaceId: workspaceId as Id<"workspaces">,
	});

	return recipes.find((recipe) => recipe.slug === recipeSlug) ?? null;
};

const getRecipeContext = (
	selectedRecipe:
		| {
				slug: string;
				name: string;
				prompt: string;
		  }
		| null
		| undefined,
) => {
	if (!selectedRecipe) {
		return "";
	}

	return [
		"A recipe is selected for this note chat.",
		"Treat the selected recipe as the active task framing for the conversation.",
		"Treat the attached note and any other provided note context as the source material to work from.",
		"If the user's request is ambiguous, interpret it through the selected recipe first.",
		"If the user explicitly asks for something else, follow the user's latest instruction instead.",
		"If there is not enough source material to complete the recipe well, ask a focused follow-up question.",
		`Selected recipe: ${selectedRecipe.name}`,
		`Recipe prompt:\n${selectedRecipe.prompt.trim()}`,
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

const generateChatTitle = async ({
	userMessage,
	assistantMessage,
}: {
	userMessage: UIMessage;
	assistantMessage?: UIMessage;
}) => {
	const userText = getMessageText(userMessage);
	const assistantText = assistantMessage
		? getMessageText(assistantMessage)
		: "";

	if (!userText) {
		return "Quick chat";
	}

	try {
		const { text } = await generateText({
			model: openai(CHAT_TITLE_MODEL),
			system: CHAT_TITLE_SYSTEM_PROMPT,
			prompt: buildChatTitlePrompt({
				userText,
				assistantText,
			}),
		});

		return finalizeGeneratedChatTitle({
			generatedTitle: text,
			userText,
			maxLength: MAX_CHAT_TITLE_LENGTH,
		});
	} catch (error) {
		console.error("Failed to generate chat title", error);
		return deriveFallbackChatTitle({
			userText,
			maxLength: MAX_CHAT_TITLE_LENGTH,
		});
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
		recipeSlug,
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
	const storedChatMessages =
		convexClient && id && resolvedWorkspaceId
			? await convexClient
					.query(api.chats.getMessages, {
						workspaceId: resolvedWorkspaceId,
						chatId: id,
					})
					.catch(() => [])
			: [];
	const editedMessageId = body.messageId ?? message?.id;
	const editedMessageIndex = editedMessageId
		? storedChatMessages.findIndex(
				(storedMessage) => storedMessage.id === editedMessageId,
			)
		: -1;
	const baseStoredMessages =
		editedMessageIndex >= 0
			? storedChatMessages.slice(0, editedMessageIndex)
			: storedChatMessages;
	const chatMessages = await validateUIMessages({
		messages:
			message && convexClient && id && resolvedWorkspaceId
				? [...fromStoredMessages(baseStoredMessages), message]
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
		convexClient &&
			id &&
			lastUserMessage &&
			(!storedChat || storedChat.title === "New chat"),
	);
	if (
		convexClient &&
		id &&
		resolvedWorkspaceId &&
		body.trigger === "submit-message" &&
		body.messageId &&
		editedMessageIndex >= 0
	) {
		try {
			await convexClient.mutation(api.chats.truncateFromMessage, {
				workspaceId: resolvedWorkspaceId,
				chatId: id,
				messageId: body.messageId,
			});
		} catch (error) {
			console.error("Failed to truncate edited chat message branch", error);
		}
	}
	if (
		convexClient &&
		id &&
		resolvedWorkspaceId &&
		body.trigger === "regenerate-message" &&
		body.messageId
	) {
		try {
			await convexClient.mutation(api.chats.truncateFromMessage, {
				workspaceId: resolvedWorkspaceId,
				chatId: id,
				messageId: body.messageId,
			});
		} catch (error) {
			console.error(
				"Failed to truncate regenerated chat message branch",
				error,
			);
		}
	}
	if (convexClient && id && resolvedWorkspaceId && lastUserMessage) {
		try {
			await convexClient.mutation(api.chats.saveMessage, {
				workspaceId: resolvedWorkspaceId,
				chatId: id,
				noteId: resolvedNoteId ?? undefined,
				preview: getChatPreviewFromMessage(lastUserMessage),
				model: resolvedModel.model,
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
	const selectedRecipe = await getSelectedRecipe({
		convexToken,
		recipeSlug,
		workspaceId: resolvedWorkspaceId,
	});
	const recipeContext = getRecipeContext(selectedRecipe);
	const userProfileContext = convexClient
		? await convexClient
				.query(api.userPreferences.getAiProfileContext, {})
				.catch(() => null)
		: null;
	const selectedAppConnections = appsEnabled
		? await getSelectedAppConnections({
				convexToken,
				selectedSourceIds,
				workspaceId,
			})
		: [];
	const trackerConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "yandex-tracker",
		) ?? null;
	const jiraConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "jira",
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
	const jiraTools = jiraConnection
		? {
				jira_search: tool({
					description:
						"Search the selected Jira connection for project history, tickets, tasks, comments, assignees, status, and technical context when the request could plausibly be answered from Jira.",
					inputSchema: z.object({
						query: z.string().min(1),
						limit: z.number().int().min(1).max(10).optional(),
					}),
					execute: async ({ query, limit }) =>
						await searchJiraIssues(jiraConnection, query, limit ?? 5),
				}),
				jira_get_issue: tool({
					description:
						"Fetch a specific Jira issue by key when the user mentions a ticket like PROJ-123 or clearly refers to a known issue key.",
					inputSchema: z.object({
						issueKey: z.string().min(1),
					}),
					execute: async ({ issueKey }) =>
						await getJiraIssue(jiraConnection, issueKey),
				}),
			}
		: {};
	const systemPrompt = `${buildChatSystemPrompt({
		notesContext,
		attachedNoteContext,
		recipeContext,
		userProfileContext: userProfileContext ?? undefined,
		webSearchEnabled,
	})}${
		trackerConnection
			? `\n\nThe selected app source for this chat is Yandex Tracker (${trackerConnection.displayName}). Treat it as the preferred source for project history, integrations, tickets, tasks, comments, assignees, and status. If the user's request could be answered from Tracker, search Tracker first before saying the context is unavailable.`
			: ""
	}${
		jiraConnection
			? `\n\nThe selected app source for this chat is Jira (${jiraConnection.displayName}). Treat it as the preferred source for project history, tickets, tasks, comments, assignees, and status. If the user's request could be answered from Jira, search Jira first before saying the context is unavailable.`
			: ""
	}`;
	const enabledTools: ToolSet = {};

	if (webSearchEnabled) {
		enabledTools.web_search = openai.tools.webSearch({
			searchContextSize: "medium",
			userLocation: {
				type: "approximate",
				country: "US",
			},
		});
	}

	Object.assign(enabledTools, trackerTools, jiraTools);

	const agent = new ToolLoopAgent({
		model: openai(resolvedModel.model),
		instructions: systemPrompt,
		tools: Object.keys(enabledTools).length > 0 ? enabledTools : undefined,
		stopWhen: Object.keys(enabledTools).length > 0 ? stepCountIs(5) : undefined,
	});
	const agentMessages = chatMessages as unknown as UIMessage<
		unknown,
		never,
		InferUITools<typeof enabledTools>
	>[];

	await pipeAgentUIStreamToResponse({
		response,
		agent,
		uiMessages: agentMessages,
		originalMessages: agentMessages,
		generateMessageId,
		consumeSseStream: consumeStream,
		sendSources: true,
		onFinish: async ({ responseMessage }) => {
			if (!convexClient || !id || !resolvedWorkspaceId) {
				return;
			}

			try {
				const generatedChatTitle =
					shouldGenerateChatTitle && lastUserMessage
						? await generateChatTitle({
								userMessage: lastUserMessage,
								assistantMessage: responseMessage,
							})
						: undefined;
				await convexClient.mutation(api.chats.saveMessage, {
					workspaceId: resolvedWorkspaceId,
					chatId: id,
					noteId: resolvedNoteId ?? undefined,
					title: generatedChatTitle,
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
