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
	type UIMessage,
	validateUIMessages,
} from "ai";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
	buildChatTitlePrompt,
	deriveFallbackChatTitle,
	finalizeGeneratedChatTitle,
} from "../../../packages/ai/src/chat-titles.mjs";
import {
	buildGoogleCalendarTools,
	buildGoogleDriveTools,
	buildYandexCalendarTools,
} from "../../../packages/ai/src/productivity-tools.mjs";
import {
	buildChatSystemPrompt,
	CHAT_TITLE_SYSTEM_PROMPT,
} from "../../../packages/ai/src/prompts.mjs";
import { findChatModel, getChatModel } from "../src/lib/ai/models";
import { buildJiraTools } from "./jira";
import { buildPostHogTools } from "./posthog";
import { buildTrackerTools } from "./tracker";

type ChatRequestBody = {
	id?: string;
	workspaceId?: string | null;
	trigger?: "submit-message" | "regenerate-message";
	messageId?: string;
	message?: UIMessage;
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
	const googleSources = await client
		.action(api.googleTools.listAvailableSources, {})
		.catch(() => []);

	if (allSelectedSourceIds.length === 0) {
		const connections = await client.query(api.appConnections.getAllForChat, {
			workspaceId: workspaceId as Id<"workspaces">,
		});
		return [...connections, ...googleSources];
	}

	if (sourceIds.length === 0) {
		return googleSources.filter((source) =>
			allSelectedSourceIds.includes(source.id),
		);
	}

	const [connections] = await Promise.all([
		client.query(api.appConnections.getSelectedForChat, {
			workspaceId: workspaceId as Id<"workspaces">,
			sourceIds,
		}),
	]);

	return [
		...connections,
		...googleSources.filter((source) =>
			allSelectedSourceIds.includes(source.id),
		),
	];
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
		trigger,
		messageId,
		message,
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

	if (!message) {
		sendJson(response, 400, {
			error: "message is required.",
		});
		return;
	}

	if (!convexToken || !resolvedWorkspaceId) {
		sendJson(response, 400, {
			error: "convexToken and workspaceId are required.",
		});
		return;
	}

	const convexClient = id
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
					.query(api.chats.getMessagesSnapshot, {
						workspaceId: resolvedWorkspaceId,
						chatId: id,
					})
					.catch(() => [])
			: [];
	const editedMessageId = messageId ?? message?.id;
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
			convexClient && id
				? [...fromStoredMessages(baseStoredMessages), message]
				: [message],
	});
	const lastUserMessage =
		message.role === "user"
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
		trigger === "submit-message" &&
		messageId &&
		editedMessageIndex >= 0
	) {
		try {
			await convexClient.mutation(api.chats.truncateFromMessage, {
				workspaceId: resolvedWorkspaceId,
				chatId: id,
				messageId,
			});
		} catch (error) {
			console.error("Failed to truncate edited chat message branch", error);
		}
	}
	if (
		convexClient &&
		id &&
		resolvedWorkspaceId &&
		trigger === "regenerate-message" &&
		messageId
	) {
		try {
			await convexClient.mutation(api.chats.truncateFromMessage, {
				workspaceId: resolvedWorkspaceId,
				chatId: id,
				messageId,
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
	const yandexCalendarConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "yandex-calendar",
		) ?? null;
	const jiraConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "jira",
		) ?? null;
	const googleCalendarConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "google-calendar",
		) ?? null;
	const googleDriveConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "google-drive",
		) ?? null;
	const posthogConnection =
		selectedAppConnections.find(
			(connection) => connection.provider === "posthog",
		) ?? null;
	const trackerTools = trackerConnection
		? buildTrackerTools(trackerConnection)
		: {};
	const googleCalendarTools =
		googleCalendarConnection && convexClient && resolvedWorkspaceId
			? buildGoogleCalendarTools({
					listEvents: async ({ limit, meetingsOnly }) =>
						await convexClient.action(
							api.calendar.listGoogleCalendarEventsForTool,
							{
								workspaceId: resolvedWorkspaceId,
								...(typeof limit === "number" ? { limit } : {}),
								...(typeof meetingsOnly === "boolean" ? { meetingsOnly } : {}),
							},
						),
					searchEvents: async ({ query, limit, meetingsOnly }) =>
						await convexClient.action(
							api.calendar.searchGoogleCalendarEventsForTool,
							{
								workspaceId: resolvedWorkspaceId,
								query: query ?? "",
								...(typeof limit === "number" ? { limit } : {}),
								...(typeof meetingsOnly === "boolean" ? { meetingsOnly } : {}),
							},
						),
				})
			: {};
	const yandexCalendarTools =
		yandexCalendarConnection && convexClient && resolvedWorkspaceId
			? buildYandexCalendarTools({
					listEvents: async ({ limit, meetingsOnly }) =>
						await convexClient.action(
							api.calendar.listYandexCalendarEventsForTool,
							{
								workspaceId: resolvedWorkspaceId,
								...(typeof limit === "number" ? { limit } : {}),
								...(typeof meetingsOnly === "boolean" ? { meetingsOnly } : {}),
							},
						),
					searchEvents: async ({ query, limit, meetingsOnly }) =>
						await convexClient.action(
							api.calendar.searchYandexCalendarEventsForTool,
							{
								workspaceId: resolvedWorkspaceId,
								query: query ?? "",
								...(typeof limit === "number" ? { limit } : {}),
								...(typeof meetingsOnly === "boolean" ? { meetingsOnly } : {}),
							},
						),
				})
			: {};
	const jiraTools = jiraConnection ? buildJiraTools(jiraConnection) : {};
	const googleDriveTools =
		googleDriveConnection && convexClient
			? buildGoogleDriveTools({
					searchFiles: async ({ query, limit }) =>
						await convexClient.action(
							api.googleTools.searchGoogleDriveFilesForTool,
							{
								query,
								...(typeof limit === "number" ? { limit } : {}),
							},
						),
					getFile: async ({ fileId }) =>
						await convexClient.action(
							api.googleTools.getGoogleDriveFileForTool,
							{
								fileId,
							},
						),
				})
			: {};
	const posthogTools = posthogConnection
		? await buildPostHogTools(posthogConnection)
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
		googleCalendarConnection
			? "\n\nThe selected app source for this chat is Google Calendar. Treat it as the preferred source for meeting schedules, event timing, attendee context, and calendar availability."
			: ""
	}${
		yandexCalendarConnection
			? "\n\nThe selected app source for this chat is Yandex Calendar. Treat it as the preferred source for meeting schedules, event timing, attendee context, and calendar availability."
			: ""
	}${
		jiraConnection
			? `\n\nThe selected app source for this chat is Jira (${jiraConnection.displayName}). Treat it as the preferred source for project history, tickets, tasks, comments, assignees, and status. If the user's request could be answered from Jira, search Jira first before saying the context is unavailable.`
			: ""
	}${
		googleDriveConnection
			? "\n\nThe selected app source for this chat is Google Drive. Treat it as the preferred source for connected Google docs, spreadsheets, presentations, and file metadata. Only read-only Drive tools are available in this chat."
			: ""
	}${
		posthogConnection
			? `\n\nThe selected app source for this chat is PostHog (${posthogConnection.projectName}). Treat it as the preferred source for product analytics, saved insights, dashboards, feature flags, experiments, errors, event schema, surveys, and queryable product usage context. Only read-only PostHog tools are available in this chat. If the user's request could plausibly be answered from PostHog, use the PostHog tools before saying the context is unavailable.`
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

	Object.assign(
		enabledTools,
		trackerTools,
		googleCalendarTools,
		yandexCalendarTools,
		jiraTools,
		googleDriveTools,
		posthogTools,
	);

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
