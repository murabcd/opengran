import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const inboxItemProviderValidator = v.literal("jira");
const inboxItemKindValidator = v.literal("jira-mention");
const inboxViewValidator = v.union(
	v.literal("all"),
	v.literal("unread"),
	v.literal("archived"),
);

const inboxItemValidator = v.object({
	_id: v.id("inboxItems"),
	provider: inboxItemProviderValidator,
	kind: inboxItemKindValidator,
	issueKey: v.string(),
	issueSummary: v.optional(v.string()),
	title: v.string(),
	preview: v.string(),
	url: v.string(),
	actorDisplayName: v.optional(v.string()),
	actorAvatarUrl: v.optional(v.string()),
	occurredAt: v.number(),
	isRead: v.boolean(),
	readAt: v.optional(v.number()),
});

const REMOVE_ALL_INBOX_ITEMS_BATCH_SIZE = 100;
const BULK_INBOX_ITEMS_BATCH_SIZE = 100;

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access inbox items.",
		});
	}

	return identity;
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

const getInboxItemByExternalId = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
	externalId: string,
) =>
	await ctx.db
		.query("inboxItems")
		.withIndex(
			"by_owner_ws_provider_externalId",
			(q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("workspaceId", workspaceId)
					.eq("provider", "jira")
					.eq("externalId", externalId),
		)
		.unique();

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
		view: v.optional(inboxViewValidator),
	},
	returns: v.array(inboxItemValidator),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);

		const view = args.view ?? "all";

		const items =
			view === "archived"
				? await ctx.db
						.query("inboxItems")
						.withIndex(
							"by_owner_ws_arch_occurredAt",
							(q) =>
								q
									.eq("ownerTokenIdentifier", identity.tokenIdentifier)
									.eq("workspaceId", args.workspaceId)
									.eq("isArchived", true),
						)
						.order("desc")
						.take(50)
				: view === "unread"
					? await ctx.db
							.query("inboxItems")
							.withIndex(
								"by_owner_ws_arch_read_occurredAt",
								(q) =>
									q
										.eq("ownerTokenIdentifier", identity.tokenIdentifier)
										.eq("workspaceId", args.workspaceId)
										.eq("isArchived", false)
										.eq("isRead", false),
							)
							.order("desc")
							.take(50)
					: await ctx.db
							.query("inboxItems")
							.withIndex(
								"by_owner_ws_arch_occurredAt",
								(q) =>
									q
										.eq("ownerTokenIdentifier", identity.tokenIdentifier)
										.eq("workspaceId", args.workspaceId)
										.eq("isArchived", false),
							)
							.order("desc")
							.take(50);

		return items.map((item) => ({
			_id: item._id,
			provider: item.provider,
			kind: item.kind,
			issueKey: item.issueKey,
			issueSummary: item.issueSummary,
			title: item.title,
			preview: item.preview,
			url: item.url,
			actorDisplayName: item.actorDisplayName,
			actorAvatarUrl: item.actorAvatarUrl,
			occurredAt: item.occurredAt,
			isRead: item.isRead,
			readAt: item.readAt,
		}));
	},
});

export const markRead = mutation({
	args: {
		itemId: v.id("inboxItems"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const item = await ctx.db.get(args.itemId);

		if (!item || item.ownerTokenIdentifier !== identity.tokenIdentifier) {
			throw new ConvexError({
				code: "INBOX_ITEM_NOT_FOUND",
				message: "Inbox item not found.",
			});
		}

		if (item.isRead) {
			return null;
		}

		await ctx.db.patch(item._id, {
			isRead: true,
			readAt: Date.now(),
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const markAllRead = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(ctx, identity.tokenIdentifier, args.workspaceId);

		await ctx.runMutation(internal.inboxItems.markAllReadForWorkspace, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
		});
		return null;
	},
});

export const archiveRead = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(ctx, identity.tokenIdentifier, args.workspaceId);

		await ctx.runMutation(internal.inboxItems.archiveReadForWorkspace, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
		});
		return null;
	},
});

export const clearArchived = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(ctx, identity.tokenIdentifier, args.workspaceId);

		await ctx.runMutation(internal.inboxItems.clearArchivedForWorkspace, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
		});
		return null;
	},
});

export const markAllReadForWorkspace = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const items = await ctx.db
			.query("inboxItems")
			.withIndex("by_owner_ws_arch_read_occurredAt", (q) =>
				q
					.eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId)
					.eq("isArchived", false)
					.eq("isRead", false),
			)
			.take(BULK_INBOX_ITEMS_BATCH_SIZE);

		if (items.length === 0) {
			return null;
		}

		const now = Date.now();
		await Promise.all(
			items.map((item) =>
				ctx.db.patch(item._id, {
					isRead: true,
					readAt: now,
					updatedAt: now,
				}),
			),
		);

		if (items.length === BULK_INBOX_ITEMS_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.inboxItems.markAllReadForWorkspace, {
				ownerTokenIdentifier: args.ownerTokenIdentifier,
				workspaceId: args.workspaceId,
			});
		}

		return null;
	},
});

export const archiveReadForWorkspace = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const items = await ctx.db
			.query("inboxItems")
			.withIndex("by_owner_ws_arch_read_occurredAt", (q) =>
				q
					.eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId)
					.eq("isArchived", false)
					.eq("isRead", true),
			)
			.take(BULK_INBOX_ITEMS_BATCH_SIZE);

		if (items.length === 0) {
			return null;
		}

		const now = Date.now();
		await Promise.all(
			items.map((item) =>
				ctx.db.patch(item._id, {
					isArchived: true,
					archivedAt: now,
					updatedAt: now,
				}),
			),
		);

		if (items.length === BULK_INBOX_ITEMS_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.inboxItems.archiveReadForWorkspace, {
				ownerTokenIdentifier: args.ownerTokenIdentifier,
				workspaceId: args.workspaceId,
			});
		}

		return null;
	},
});

export const clearArchivedForWorkspace = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const items = await ctx.db
			.query("inboxItems")
			.withIndex("by_owner_ws_arch_occurredAt", (q) =>
				q
					.eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId)
					.eq("isArchived", true),
			)
			.take(BULK_INBOX_ITEMS_BATCH_SIZE);

		if (items.length === 0) {
			return null;
		}

		await Promise.all(items.map((item) => ctx.db.delete(item._id)));

		if (items.length === BULK_INBOX_ITEMS_BATCH_SIZE) {
			await ctx.scheduler.runAfter(
				0,
				internal.inboxItems.clearArchivedForWorkspace,
				{
					ownerTokenIdentifier: args.ownerTokenIdentifier,
					workspaceId: args.workspaceId,
				},
			);
		}

		return null;
	},
});

export const upsertJiraMention = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		externalId: v.string(),
		issueKey: v.string(),
		issueSummary: v.optional(v.string()),
		title: v.string(),
		preview: v.string(),
		url: v.string(),
		actorDisplayName: v.optional(v.string()),
		actorAvatarUrl: v.optional(v.string()),
		occurredAt: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const existing = await getInboxItemByExternalId(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
			args.externalId,
		);
		const now = Date.now();

		if (existing) {
			await ctx.db.patch(existing._id, {
				issueKey: args.issueKey,
				issueSummary: args.issueSummary,
				title: args.title,
				preview: args.preview,
				url: args.url,
				occurredAt: args.occurredAt,
				isRead: false,
				readAt: undefined,
				isArchived: false,
				archivedAt: undefined,
				updatedAt: now,
				actorDisplayName: args.actorDisplayName,
				actorAvatarUrl: args.actorAvatarUrl,
			});

			return null;
		}

		await ctx.db.insert("inboxItems", {
			ownerTokenIdentifier: args.ownerTokenIdentifier,
			workspaceId: args.workspaceId,
			provider: "jira",
			kind: "jira-mention",
			externalId: args.externalId,
			issueKey: args.issueKey,
			...(args.issueSummary ? { issueSummary: args.issueSummary } : {}),
			title: args.title,
			preview: args.preview,
			url: args.url,
			occurredAt: args.occurredAt,
			isRead: false,
			isArchived: false,
			...(args.actorDisplayName
				? { actorDisplayName: args.actorDisplayName }
				: {}),
			...(args.actorAvatarUrl ? { actorAvatarUrl: args.actorAvatarUrl } : {}),
			createdAt: now,
			updatedAt: now,
		});

		return null;
	},
});

export const removeJiraMention = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		externalId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const existing = await getInboxItemByExternalId(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
			args.externalId,
		);

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		return null;
	},
});

const deleteInboxItemsBatchForWorkspace = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => {
	const items = await ctx.db
		.query("inboxItems")
		.withIndex("by_owner_ws_upd", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("workspaceId", workspaceId),
		)
		.take(REMOVE_ALL_INBOX_ITEMS_BATCH_SIZE);

	await Promise.all(items.map((item) => ctx.db.delete(item._id)));

	return {
		deletedCount: items.length,
		hasMore: items.length === REMOVE_ALL_INBOX_ITEMS_BATCH_SIZE,
	};
};

const deleteInboxItemsBatchForOwner = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
) => {
	const items = await ctx.db
		.query("inboxItems")
		.withIndex("by_owner_upd", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
		)
		.take(REMOVE_ALL_INBOX_ITEMS_BATCH_SIZE);

	await Promise.all(items.map((item) => ctx.db.delete(item._id)));

	return {
		deletedCount: items.length,
		hasMore: items.length === REMOVE_ALL_INBOX_ITEMS_BATCH_SIZE,
	};
};

export const removeAllForWorkspace = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await deleteInboxItemsBatchForWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(0, internal.inboxItems.removeAllForWorkspace, {
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
		const result = await deleteInboxItemsBatchForOwner(
			ctx,
			args.ownerTokenIdentifier,
		);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(0, internal.inboxItems.removeAllForOwner, {
				ownerTokenIdentifier: args.ownerTokenIdentifier,
			});
		}

		return null;
	},
});
