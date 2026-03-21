import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const noteVisibilityValidator = v.union(
	v.literal("private"),
	v.literal("public"),
);

const quickNoteFields = {
	_id: v.id("quickNotes"),
	_creationTime: v.number(),
	ownerTokenIdentifier: v.string(),
	authorName: v.optional(v.string()),
	title: v.string(),
	content: v.string(),
	searchableText: v.string(),
	visibility: noteVisibilityValidator,
	shareId: v.optional(v.string()),
	sharedAt: v.optional(v.number()),
	isArchived: v.boolean(),
	archivedAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
};

const quickNoteValidator = v.object(quickNoteFields);

const sharedQuickNoteValidator = v.object({
	...quickNoteFields,
	isOwner: v.boolean(),
});

const quickNoteChatContextValidator = v.object({
	id: v.id("quickNotes"),
	title: v.string(),
	searchableText: v.string(),
});

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access quick notes.",
		});
	}

	return identity;
};

const getAuthorName = (identity: Awaited<ReturnType<typeof requireIdentity>>) =>
	identity.name?.trim() || identity.email?.trim() || "Unknown user";

const normalizeQuickNote = (note: Doc<"quickNotes">) => ({
	...note,
	visibility: note.visibility ?? "private",
});

const requireTokenIdentifier = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await requireIdentity(ctx);

	return identity.tokenIdentifier;
};

const requireOwnedNote = async (
	ctx: QueryCtx | MutationCtx,
	id: Doc<"quickNotes">["_id"],
) => {
	const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
	const note = await ctx.db.get(id);

	if (!note) {
		throw new ConvexError({
			code: "NOTE_NOT_FOUND",
			message: "Quick note not found.",
		});
	}

	if (note.ownerTokenIdentifier !== ownerTokenIdentifier) {
		throw new ConvexError({
			code: "UNAUTHORIZED",
			message: "You do not have access to this quick note.",
		});
	}

	return note;
};

const createShareId = () => crypto.randomUUID().replaceAll("-", "");

export const getLatest = query({
	args: {},
	returns: v.union(quickNoteValidator, v.null()),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const note = await ctx.db
			.query("quickNotes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", false),
			)
			.order("desc")
			.first();

		return note ? normalizeQuickNote(note) : null;
	},
});

export const list = query({
	args: {},
	returns: v.array(quickNoteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const notes = await ctx.db
			.query("quickNotes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", false),
			)
			.order("desc")
			.take(100);

		return notes.map(normalizeQuickNote);
	},
});

export const listShared = query({
	args: {},
	returns: v.array(quickNoteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const notes = await ctx.db
			.query("quickNotes")
			.withIndex("by_owner_visibility_archived_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("visibility", "public")
					.eq("isArchived", false),
			)
			.order("desc")
			.take(100);

		return notes.map(normalizeQuickNote);
	},
});

export const listArchived = query({
	args: {},
	returns: v.array(quickNoteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const notes = await ctx.db
			.query("quickNotes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", true),
			)
			.order("desc")
			.take(100);

		return notes.map(normalizeQuickNote);
	},
});

export const get = query({
	args: {
		id: v.id("quickNotes"),
	},
	returns: v.union(quickNoteValidator, v.null()),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const note = await ctx.db.get(args.id);

		if (
			!note ||
			note.ownerTokenIdentifier !== ownerTokenIdentifier ||
			note.isArchived
		) {
			return null;
		}

		return normalizeQuickNote(note);
	},
});

export const getChatContext = query({
	args: {
		ids: v.array(v.id("quickNotes")),
	},
	returns: v.array(quickNoteChatContextValidator),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const uniqueIds = [...new Set(args.ids)].slice(0, 20);
		const notes = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));

		return notes.flatMap((note) => {
			if (
				!note ||
				note.isArchived ||
				note.ownerTokenIdentifier !== ownerTokenIdentifier
			) {
				return [];
			}

			return [
				{
					id: note._id,
					title: note.title.trim() || "New note",
					searchableText: note.searchableText.trim(),
				},
			];
		});
	},
});

export const getShared = query({
	args: {
		shareId: v.string(),
	},
	returns: v.union(sharedQuickNoteValidator, v.null()),
	handler: async (ctx, args) => {
		const note = await ctx.db
			.query("quickNotes")
			.withIndex("by_shareId", (q) => q.eq("shareId", args.shareId))
			.unique();

		if (!note || note.isArchived) {
			return null;
		}

		const normalizedNote = normalizeQuickNote(note);

		const identity = await ctx.auth.getUserIdentity();
		const isOwner =
			identity?.tokenIdentifier === normalizedNote.ownerTokenIdentifier;

		if (normalizedNote.visibility !== "public" && !isOwner) {
			return null;
		}

		return {
			...normalizedNote,
			isOwner,
		};
	},
});

export const create = mutation({
	args: {},
	returns: v.id("quickNotes"),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const now = Date.now();

		return await ctx.db.insert("quickNotes", {
			ownerTokenIdentifier,
			authorName: getAuthorName(identity),
			title: "New note",
			content: JSON.stringify({
				type: "doc",
				content: [{ type: "paragraph" }],
			}),
			searchableText: "",
			visibility: "private",
			shareId: undefined,
			sharedAt: undefined,
			isArchived: false,
			archivedAt: undefined,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const save = mutation({
	args: {
		id: v.optional(v.id("quickNotes")),
		title: v.string(),
		content: v.string(),
		searchableText: v.string(),
	},
	returns: v.id("quickNotes"),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const authorName = getAuthorName(identity);
		const now = Date.now();

		if (args.id) {
			const existing = await requireOwnedNote(ctx, args.id);

			await ctx.db.patch(args.id, {
				authorName: existing.authorName ?? authorName,
				title: args.title,
				content: args.content,
				searchableText: args.searchableText,
				visibility: existing.visibility ?? "private",
				shareId: existing.shareId,
				sharedAt: existing.sharedAt,
				isArchived: false,
				archivedAt: undefined,
				updatedAt: now,
			});

			return args.id;
		}

		return await ctx.db.insert("quickNotes", {
			ownerTokenIdentifier,
			authorName,
			title: args.title,
			content: args.content,
			searchableText: args.searchableText,
			visibility: "private",
			shareId: undefined,
			sharedAt: undefined,
			isArchived: false,
			archivedAt: undefined,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const updateVisibility = mutation({
	args: {
		id: v.id("quickNotes"),
		visibility: noteVisibilityValidator,
	},
	returns: v.object({
		visibility: noteVisibilityValidator,
		shareId: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const note = await requireOwnedNote(ctx, args.id);

		if (note.isArchived) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Quick note not found.",
			});
		}

		const shareId =
			args.visibility === "public"
				? (note.shareId ?? createShareId())
				: note.shareId;

		await ctx.db.patch(args.id, {
			visibility: args.visibility,
			shareId,
			sharedAt: args.visibility === "public" ? Date.now() : note.sharedAt,
			updatedAt: Date.now(),
		});

		return {
			visibility: args.visibility,
			shareId,
		};
	},
});

export const ensureShareId = mutation({
	args: {
		id: v.id("quickNotes"),
	},
	returns: v.object({
		shareId: v.string(),
	}),
	handler: async (ctx, args) => {
		const note = await requireOwnedNote(ctx, args.id);

		if (note.isArchived) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Quick note not found.",
			});
		}

		const shareId = note.shareId ?? createShareId();

		if (!note.shareId) {
			await ctx.db.patch(args.id, {
				shareId,
				updatedAt: Date.now(),
			});
		}

		return { shareId };
	},
});

export const moveToTrash = mutation({
	args: {
		id: v.id("quickNotes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedNote(ctx, args.id);

		await ctx.db.patch(args.id, {
			isArchived: true,
			archivedAt: Date.now(),
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const restore = mutation({
	args: {
		id: v.id("quickNotes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedNote(ctx, args.id);

		await ctx.db.patch(args.id, {
			isArchived: false,
			archivedAt: undefined,
			updatedAt: Date.now(),
		});

		return null;
	},
});

export const remove = mutation({
	args: {
		id: v.id("quickNotes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedNote(ctx, args.id);
		await ctx.db.delete(args.id);

		return null;
	},
});
