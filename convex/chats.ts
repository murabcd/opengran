import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const chatRoleValidator = v.union(
	v.literal("system"),
	v.literal("user"),
	v.literal("assistant"),
);

const chatFields = {
	_id: v.id("chats"),
	_creationTime: v.number(),
	ownerTokenIdentifier: v.string(),
	workspaceId: v.id("workspaces"),
	authorName: v.optional(v.string()),
	chatId: v.string(),
	noteId: v.optional(v.id("notes")),
	title: v.string(),
	preview: v.string(),
	model: v.optional(v.string()),
	isArchived: v.boolean(),
	archivedAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
	lastMessageAt: v.number(),
};

const chatValidator = v.object(chatFields);

const chatMessageFields = {
	_id: v.id("chatMessages"),
	_creationTime: v.number(),
	chatId: v.id("chats"),
	ownerTokenIdentifier: v.string(),
	messageId: v.string(),
	role: chatRoleValidator,
	partsJson: v.string(),
	metadataJson: v.optional(v.string()),
	text: v.string(),
	createdAt: v.number(),
};

const chatMessageValidator = v.object(chatMessageFields);

const storedUiMessageValidator = v.object({
	id: v.string(),
	role: chatRoleValidator,
	partsJson: v.string(),
	metadataJson: v.optional(v.string()),
	text: v.string(),
	createdAt: v.number(),
});

const removeAllChatsResultValidator = v.object({
	deletedCount: v.number(),
	hasMore: v.boolean(),
});

const MAX_CHAT_PREVIEW_LENGTH = 180;
const MAX_CHAT_TITLE_LENGTH = 80;
const MAX_RETURNED_CHATS = 100;
const MAX_RETURNED_CHAT_MESSAGES = 200;
const REMOVE_CHAT_MESSAGES_BATCH_SIZE = 100;
const REMOVE_ALL_CHATS_BATCH_SIZE = 25;
const NOTE_CHAT_BATCH_SIZE = 25;

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access chats.",
		});
	}

	return identity;
};

const requireTokenIdentifier = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await requireIdentity(ctx);

	return identity.tokenIdentifier;
};

const requireOwnedWorkspace = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => {
	const workspace = await ctx.db.get(workspaceId);

	if (!workspace || workspace.ownerTokenIdentifier !== ownerTokenIdentifier) {
		throw new ConvexError({
			code: "WORKSPACE_NOT_FOUND",
			message: "Workspace not found.",
		});
	}

	return workspace;
};

const getAuthorName = (identity: Awaited<ReturnType<typeof requireIdentity>>) =>
	identity.name?.trim() || identity.email?.trim() || "Unknown user";

const clampWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength: number) =>
	value.length > maxLength
		? `${value.slice(0, maxLength - 1).trimEnd()}…`
		: value;

const toSentenceCase = (value: string) => {
	if (!value) {
		return value;
	}

	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
};

const normalizeChatTitle = (value: string | undefined) => {
	const normalized = clampWhitespace(value ?? "");

	return normalized
		? truncate(toSentenceCase(normalized), MAX_CHAT_TITLE_LENGTH)
		: "New chat";
};

const normalizeChatPreview = (value: string | undefined) =>
	truncate(clampWhitespace(value ?? ""), MAX_CHAT_PREVIEW_LENGTH);

const getOwnedChatById = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
	chatId: string,
) =>
	await ctx.db
		.query("chats")
		.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_chatId", (q) =>
			q
				.eq("ownerTokenIdentifier", ownerTokenIdentifier)
				.eq("workspaceId", workspaceId)
				.eq("chatId", chatId),
		)
		.unique();

const requireOwnedNoteId = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
	noteId: Id<"notes">,
) => {
	const note = await ctx.db.get(noteId);

	if (
		!note ||
		note.ownerTokenIdentifier !== ownerTokenIdentifier ||
		note.workspaceId !== workspaceId
	) {
		throw new ConvexError({
			code: "NOTE_NOT_FOUND",
			message: "Note not found.",
		});
	}

	return note;
};

const shouldReplaceChatTitle = (
	chat: Doc<"chats"> | null,
	nextTitle: string,
) => {
	if (!chat) {
		return true;
	}

	if (chat.title === "New chat") {
		return true;
	}

	return clampWhitespace(chat.title).length === 0 && nextTitle !== "New chat";
};

const deleteChatMessageBatch = async (
	ctx: MutationCtx,
	chatId: Doc<"chats">["_id"],
) => {
	const messages = await ctx.db
		.query("chatMessages")
		.withIndex("by_chatId_and_createdAt", (q) => q.eq("chatId", chatId))
		.take(REMOVE_CHAT_MESSAGES_BATCH_SIZE);

	await Promise.all(messages.map((message) => ctx.db.delete(message._id)));

	return {
		deletedCount: messages.length,
		hasMore: messages.length === REMOVE_CHAT_MESSAGES_BATCH_SIZE,
	};
};

const deleteChatBatch = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
) => {
	const chats = await ctx.db
		.query("chats")
		.withIndex("by_ownerTokenIdentifier_and_updatedAt", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
		)
		.take(REMOVE_ALL_CHATS_BATCH_SIZE);

	await Promise.all(
		chats.map((chat) =>
			ctx.scheduler.runAfter(0, internal.chats.removeMessagesAndDeleteChat, {
				chatId: chat._id,
			}),
		),
	);

	return {
		deletedCount: chats.length,
		hasMore: chats.length === REMOVE_ALL_CHATS_BATCH_SIZE,
	};
};

const getNoteChatsByArchiveState = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
	noteId: Id<"notes">,
	isArchived: boolean,
) =>
	await ctx.db
		.query("chats")
		.withIndex("by_owner_ws_note_chat_arch_upd", (q) =>
			q
				.eq("ownerTokenIdentifier", ownerTokenIdentifier)
				.eq("workspaceId", workspaceId)
				.eq("noteId", noteId)
				.eq("isArchived", isArchived),
		)
		.take(NOTE_CHAT_BATCH_SIZE);

const getNoteChats = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
	noteId: Id<"notes">,
) =>
	await ctx.db
		.query("chats")
		.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_noteId_and_chatId", (q) =>
			q
				.eq("ownerTokenIdentifier", ownerTokenIdentifier)
				.eq("workspaceId", workspaceId)
				.eq("noteId", noteId),
		)
		.take(NOTE_CHAT_BATCH_SIZE);

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(chatValidator),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);

		return await ctx.db
			.query("chats")
			.withIndex(
				"by_owner_ws_chat_arch_upd",
				(q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId)
					.eq("isArchived", false),
			)
			.order("desc")
			.take(MAX_RETURNED_CHATS);
	},
});

export const listArchived = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(chatValidator),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);

		return await ctx.db
			.query("chats")
			.withIndex(
				"by_owner_ws_chat_arch_upd",
				(q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId)
					.eq("isArchived", true),
			)
			.order("desc")
			.take(MAX_RETURNED_CHATS);
	},
});

export const listForNote = query({
	args: {
		workspaceId: v.id("workspaces"),
		noteId: v.id("notes"),
	},
	returns: v.array(chatValidator),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		await requireOwnedNoteId(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			args.noteId,
		);

		return await ctx.db
			.query("chats")
			.withIndex(
				"by_owner_ws_note_chat_arch_upd",
				(q) =>
					q
						.eq("ownerTokenIdentifier", ownerTokenIdentifier)
						.eq("workspaceId", args.workspaceId)
						.eq("noteId", args.noteId)
						.eq("isArchived", false),
			)
			.order("desc")
			.take(MAX_RETURNED_CHATS);
	},
});

export const getSession = query({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
	},
	returns: v.union(chatValidator, v.null()),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			clampWhitespace(args.chatId),
		);

		if (!chat || chat.isArchived) {
			return null;
		}

		return chat;
	},
});

export const getMessages = query({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
	},
	returns: v.array(storedUiMessageValidator),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			args.chatId,
		);

		if (!chat) {
			return [];
		}

		if (chat.isArchived) {
			return [];
		}

		const messages = await ctx.db
			.query("chatMessages")
			.withIndex("by_chatId_and_createdAt", (q) => q.eq("chatId", chat._id))
			.order("desc")
			.take(MAX_RETURNED_CHAT_MESSAGES);

		return messages.reverse().map((message) => ({
			id: message.messageId,
			role: message.role,
			partsJson: message.partsJson,
			metadataJson: message.metadataJson,
			text: message.text,
			createdAt: message.createdAt,
		}));
	},
});

export const removeMessagesAndDeleteChat = internalMutation({
	args: {
		chatId: v.id("chats"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await deleteChatMessageBatch(ctx, args.chatId);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(
				0,
				internal.chats.removeMessagesAndDeleteChat,
				{
					chatId: args.chatId,
				},
			);
			return null;
		}

		const chat = await ctx.db.get(args.chatId);

		if (chat) {
			await ctx.db.delete(args.chatId);
		}

		return null;
	},
});

export const archiveForNote = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		noteId: v.id("notes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const chats = await getNoteChatsByArchiveState(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
			args.noteId,
			false,
		);
		const timestamp = Date.now();

		await Promise.all(
			chats.map((chat) =>
				ctx.db.patch(chat._id, {
					isArchived: true,
					archivedAt: timestamp,
					updatedAt: timestamp,
				}),
			),
		);

		if (chats.length === NOTE_CHAT_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.chats.archiveForNote, args);
		}

		return null;
	},
});

export const restoreForNote = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		noteId: v.id("notes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const chats = await getNoteChatsByArchiveState(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
			args.noteId,
			true,
		);
		const timestamp = Date.now();

		await Promise.all(
			chats.map((chat) =>
				ctx.db.patch(chat._id, {
					isArchived: false,
					archivedAt: undefined,
					updatedAt: timestamp,
				}),
			),
		);

		if (chats.length === NOTE_CHAT_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.chats.restoreForNote, args);
		}

		return null;
	},
});

export const removeForNote = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		noteId: v.id("notes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const chats = await getNoteChats(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
			args.noteId,
		);

		await Promise.all(
			chats.map(async (chat) => {
				await ctx.db.delete(chat._id);

				const result = await deleteChatMessageBatch(ctx, chat._id);

				if (result.hasMore) {
					await ctx.scheduler.runAfter(
						0,
						internal.chats.removeMessagesAndDeleteChat,
						{
							chatId: chat._id,
						},
					);
				}
			}),
		);

		if (chats.length === NOTE_CHAT_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.chats.removeForNote, args);
		}

		return null;
	},
});

export const saveMessage = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
		noteId: v.optional(v.id("notes")),
		title: v.optional(v.string()),
		preview: v.optional(v.string()),
		model: v.optional(v.string()),
		message: v.object({
			id: v.string(),
			role: chatRoleValidator,
			partsJson: v.string(),
			metadataJson: v.optional(v.string()),
			text: v.string(),
			createdAt: v.number(),
		}),
	},
	returns: v.object({
		chat: chatValidator,
		message: chatMessageValidator,
	}),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const authorName = getAuthorName(identity);
		const now = Date.now();
		const normalizedTitle = normalizeChatTitle(args.title);
		const normalizedPreview = normalizeChatPreview(
			args.preview ?? args.message.text,
		);
		const messageCreatedAt = args.message.createdAt || now;
		const storedChatId = clampWhitespace(args.chatId);
		const storedNoteId = args.noteId ?? undefined;
		const storedMessageId =
			clampWhitespace(args.message.id) ||
			`msg-${now}-${Math.random().toString(36).slice(2, 10)}`;

		if (storedNoteId) {
			await requireOwnedNoteId(
				ctx,
				ownerTokenIdentifier,
				args.workspaceId,
				storedNoteId,
			);
		}

		const existingChat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			storedChatId,
		);

		const chatId =
			existingChat?._id ??
			(await ctx.db.insert("chats", {
				ownerTokenIdentifier,
				workspaceId: args.workspaceId,
				authorName,
				chatId: storedChatId,
				noteId: storedNoteId,
				title: normalizedTitle,
				preview: normalizedPreview,
				model: args.model,
				isArchived: false,
				archivedAt: undefined,
				createdAt: now,
				updatedAt: now,
				lastMessageAt: messageCreatedAt,
			}));

		if (existingChat) {
			const nextTitle = shouldReplaceChatTitle(existingChat, normalizedTitle)
				? normalizedTitle
				: existingChat.title;

			await ctx.db.patch(existingChat._id, {
				chatId: storedChatId,
				noteId: existingChat.noteId ?? storedNoteId,
				authorName: existingChat.authorName ?? authorName,
				workspaceId: args.workspaceId,
				title: nextTitle,
				preview: normalizedPreview,
				model: args.model ?? existingChat.model,
				isArchived: false,
				archivedAt: undefined,
				updatedAt: now,
				lastMessageAt: messageCreatedAt,
			});
		}

		const existingMessage = await ctx.db
			.query("chatMessages")
			.withIndex("by_chatId_and_messageId", (q) =>
				q.eq("chatId", chatId).eq("messageId", storedMessageId),
			)
			.unique();

		const messageId =
			existingMessage?._id ??
			(await ctx.db.insert("chatMessages", {
				chatId,
				ownerTokenIdentifier,
				messageId: storedMessageId,
				role: args.message.role,
				partsJson: args.message.partsJson,
				metadataJson: args.message.metadataJson,
				text: args.message.text,
				createdAt: messageCreatedAt,
			}));

		if (existingMessage) {
			await ctx.db.patch(existingMessage._id, {
				role: args.message.role,
				partsJson: args.message.partsJson,
				metadataJson: args.message.metadataJson,
				text: args.message.text,
				createdAt: messageCreatedAt,
			});
		}

		const [chat, message] = await Promise.all([
			ctx.db.get(chatId),
			ctx.db.get(messageId),
		]);

		if (!chat || !message) {
			throw new ConvexError({
				code: "CHAT_SAVE_FAILED",
				message: "Failed to save chat message.",
			});
		}

		return {
			chat,
			message,
		};
	},
});

export const updateTitle = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
		title: v.string(),
	},
	returns: v.object({
		title: v.string(),
	}),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			clampWhitespace(args.chatId),
		);

		if (!chat || chat.isArchived) {
			throw new ConvexError({
				code: "CHAT_NOT_FOUND",
				message: "Chat not found.",
			});
		}

		const normalizedTitle = normalizeChatTitle(args.title);
		const nextTitle = shouldReplaceChatTitle(chat, normalizedTitle)
			? normalizedTitle
			: chat.title;

		if (nextTitle !== chat.title) {
			await ctx.db.patch(chat._id, {
				title: nextTitle,
				updatedAt: Date.now(),
			});
		}

		return {
			title: nextTitle,
		};
	},
});

export const setModel = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
		model: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			clampWhitespace(args.chatId),
		);

		if (!chat) {
			return null;
		}

		await ctx.db.patch(chat._id, {
			model: clampWhitespace(args.model) || chat.model,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const moveToTrash = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			args.chatId,
		);

		if (!chat) {
			return null;
		}

		await ctx.db.patch(chat._id, {
			isArchived: true,
			archivedAt: Date.now(),
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const restore = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			args.chatId,
		);

		if (!chat) {
			return null;
		}

		await ctx.db.patch(chat._id, {
			isArchived: false,
			archivedAt: undefined,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const remove = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chat = await getOwnedChatById(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			args.chatId,
		);

		if (!chat) {
			return null;
		}

		const result = await deleteChatMessageBatch(ctx, chat._id);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(
				0,
				internal.chats.removeMessagesAndDeleteChat,
				{
					chatId: chat._id,
				},
			);
			return null;
		}

		await ctx.db.delete(chat._id);

		return null;
	},
});

export const removeAll = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: removeAllChatsResultValidator,
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const chats = await ctx.db
			.query("chats")
			.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId),
			)
			.take(REMOVE_ALL_CHATS_BATCH_SIZE);

		await Promise.all(
			chats.map((chat) =>
				ctx.scheduler.runAfter(0, internal.chats.removeMessagesAndDeleteChat, {
					chatId: chat._id,
				}),
			),
		);

		if (chats.length === REMOVE_ALL_CHATS_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.chats.removeAllForWorkspace, {
				ownerTokenIdentifier,
				workspaceId: args.workspaceId,
			});
		}

		return {
			deletedCount: chats.length,
			hasMore: chats.length === REMOVE_ALL_CHATS_BATCH_SIZE,
		};
	},
});

export const removeAllForWorkspace = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const chats = await ctx.db
			.query("chats")
			.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId),
			)
			.take(REMOVE_ALL_CHATS_BATCH_SIZE);

		await Promise.all(
			chats.map((chat) =>
				ctx.scheduler.runAfter(0, internal.chats.removeMessagesAndDeleteChat, {
					chatId: chat._id,
				}),
			),
		);

		if (chats.length === REMOVE_ALL_CHATS_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.chats.removeAllForWorkspace, {
				ownerTokenIdentifier: args.ownerTokenIdentifier,
				workspaceId: args.workspaceId,
			});
		}

		return null;
	},
});

export const removeAllForOwner = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const chats = await deleteChatBatch(ctx, args.ownerTokenIdentifier);

		if (chats.hasMore) {
			await ctx.scheduler.runAfter(0, internal.chats.removeAllForOwner, {
				ownerTokenIdentifier: args.ownerTokenIdentifier,
			});
		}

		return null;
	},
});
