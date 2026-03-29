import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const noteVisibilityValidator = v.union(
	v.literal("private"),
	v.literal("public"),
);

const noteFields = {
	_id: v.id("notes"),
	_creationTime: v.number(),
	ownerTokenIdentifier: v.string(),
	authorName: v.optional(v.string()),
	isStarred: v.optional(v.boolean()),
	title: v.string(),
	templateSlug: v.optional(v.string()),
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

const noteValidator = v.object(noteFields);

const sharedNoteValidator = v.object({
	...noteFields,
	isOwner: v.boolean(),
});

const noteChatContextValidator = v.object({
	id: v.id("notes"),
	title: v.string(),
	searchableText: v.string(),
});

const removeAllNotesResultValidator = v.object({
	deletedCount: v.number(),
	hasMore: v.boolean(),
});

const REMOVE_ALL_NOTES_BATCH_SIZE = 100;
const DEFAULT_NOTE_TEMPLATE_SLUG = "enhanced";

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access notes.",
		});
	}

	return identity;
};

const getAuthorName = (identity: Awaited<ReturnType<typeof requireIdentity>>) =>
	identity.name?.trim() || identity.email?.trim() || "Unknown user";

const normalizeNote = (note: Doc<"notes">) => ({
	...note,
	isStarred: note.isStarred ?? false,
	templateSlug: note.templateSlug ?? DEFAULT_NOTE_TEMPLATE_SLUG,
	visibility: note.visibility ?? "private",
});

const requireTokenIdentifier = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await requireIdentity(ctx);

	return identity.tokenIdentifier;
};

const requireOwnedNote = async (
	ctx: QueryCtx | MutationCtx,
	id: Doc<"notes">["_id"],
) => {
	const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
	const note = await ctx.db.get(id);

	if (!note) {
		throw new ConvexError({
			code: "NOTE_NOT_FOUND",
			message: "Note not found.",
		});
	}

	if (note.ownerTokenIdentifier !== ownerTokenIdentifier) {
		throw new ConvexError({
			code: "UNAUTHORIZED",
			message: "You do not have access to this note.",
		});
	}

	return note;
};

const createShareId = () => crypto.randomUUID().replaceAll("-", "");

const deleteNoteBatch = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
) => {
	const notes = await ctx.db
		.query("notes")
		.withIndex("by_ownerTokenIdentifier_and_updatedAt", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
		)
		.take(REMOVE_ALL_NOTES_BATCH_SIZE);

	await Promise.all(notes.map((note) => ctx.db.delete(note._id)));

	return {
		deletedCount: notes.length,
		hasMore: notes.length === REMOVE_ALL_NOTES_BATCH_SIZE,
	};
};

export const getLatest = query({
	args: {},
	returns: v.union(noteValidator, v.null()),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const note = await ctx.db
			.query("notes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", false),
			)
			.order("desc")
			.first();

		return note ? normalizeNote(note) : null;
	},
});

export const list = query({
	args: {},
	returns: v.array(noteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const notes = await ctx.db
			.query("notes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", false),
			)
			.order("desc")
			.take(100);

		return notes.map(normalizeNote);
	},
});

export const listShared = query({
	args: {},
	returns: v.array(noteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const notes = await ctx.db
			.query("notes")
			.withIndex("by_owner_visibility_archived_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("visibility", "public")
					.eq("isArchived", false),
			)
			.order("desc")
			.take(100);

		return notes.map(normalizeNote);
	},
});

export const listArchived = query({
	args: {},
	returns: v.array(noteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const notes = await ctx.db
			.query("notes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", true),
			)
			.order("desc")
			.take(100);

		return notes.map(normalizeNote);
	},
});

export const get = query({
	args: {
		id: v.id("notes"),
	},
	returns: v.union(noteValidator, v.null()),
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

		return normalizeNote(note);
	},
});

export const getChatContext = query({
	args: {
		ids: v.array(v.id("notes")),
	},
	returns: v.array(noteChatContextValidator),
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
	returns: v.union(sharedNoteValidator, v.null()),
	handler: async (ctx, args) => {
		const note = await ctx.db
			.query("notes")
			.withIndex("by_shareId", (q) => q.eq("shareId", args.shareId))
			.unique();

		if (!note || note.isArchived) {
			return null;
		}

		const normalizedNote = normalizeNote(note);

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
	returns: v.id("notes"),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const now = Date.now();

		return await ctx.db.insert("notes", {
			ownerTokenIdentifier,
			authorName: getAuthorName(identity),
			isStarred: false,
			title: "New note",
			templateSlug: DEFAULT_NOTE_TEMPLATE_SLUG,
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
		id: v.optional(v.id("notes")),
		title: v.string(),
		content: v.string(),
		searchableText: v.string(),
	},
	returns: v.id("notes"),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const authorName = getAuthorName(identity);
		const now = Date.now();

		if (args.id) {
			const existing = await requireOwnedNote(ctx, args.id);

			await ctx.db.patch(args.id, {
				authorName: existing.authorName ?? authorName,
				isStarred: existing.isStarred ?? false,
				title: args.title,
				content: args.content,
				searchableText: args.searchableText,
				visibility: existing.visibility ?? "private",
				templateSlug: existing.templateSlug,
				shareId: existing.shareId,
				sharedAt: existing.sharedAt,
				isArchived: false,
				archivedAt: undefined,
				updatedAt: now,
			});

			return args.id;
		}

		return await ctx.db.insert("notes", {
			ownerTokenIdentifier,
			authorName,
			isStarred: false,
			title: args.title,
			templateSlug: DEFAULT_NOTE_TEMPLATE_SLUG,
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

export const setTemplate = mutation({
	args: {
		id: v.id("notes"),
		templateSlug: v.union(v.string(), v.null()),
	},
	returns: v.object({
		templateSlug: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const note = await requireOwnedNote(ctx, args.id);

		if (note.isArchived) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Note not found.",
			});
		}

		await ctx.db.patch(args.id, {
			templateSlug: args.templateSlug ?? undefined,
		});

		return {
			templateSlug: args.templateSlug,
		};
	},
});

export const rename = mutation({
	args: {
		id: v.id("notes"),
		title: v.string(),
	},
	returns: v.object({
		title: v.string(),
	}),
	handler: async (ctx, args) => {
		const note = await requireOwnedNote(ctx, args.id);

		if (note.isArchived) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Note not found.",
			});
		}

		const title = args.title.trim() || "New note";

		await ctx.db.patch(args.id, {
			title,
			updatedAt: Date.now(),
		});

		return { title };
	},
});

export const toggleStar = mutation({
	args: {
		id: v.id("notes"),
	},
	returns: v.object({
		isStarred: v.boolean(),
	}),
	handler: async (ctx, args) => {
		const note = await requireOwnedNote(ctx, args.id);

		if (note.isArchived) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Note not found.",
			});
		}

		const isStarred = !(note.isStarred ?? false);

		await ctx.db.patch(args.id, {
			isStarred,
			updatedAt: Date.now(),
		});

		return {
			isStarred,
		};
	},
});

export const updateVisibility = mutation({
	args: {
		id: v.id("notes"),
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
				message: "Note not found.",
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
		id: v.id("notes"),
	},
	returns: v.object({
		shareId: v.string(),
	}),
	handler: async (ctx, args) => {
		const note = await requireOwnedNote(ctx, args.id);

		if (note.isArchived) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Note not found.",
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
		id: v.id("notes"),
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
		id: v.id("notes"),
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
		id: v.id("notes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const note = await requireOwnedNote(ctx, args.id);
		await ctx.scheduler.runAfter(0, internal.transcriptSessions.removeForNote, {
			noteId: args.id,
			ownerTokenIdentifier: note.ownerTokenIdentifier,
		});
		await ctx.db.delete(args.id);

		return null;
	},
});

export const removeAllForOwner = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await deleteNoteBatch(ctx, args.ownerTokenIdentifier);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(0, internal.notes.removeAllForOwner, {
				ownerTokenIdentifier: args.ownerTokenIdentifier,
			});
		} else {
			await ctx.scheduler.runAfter(
				0,
				internal.transcriptSessions.removeAllForOwner,
				{
					ownerTokenIdentifier: args.ownerTokenIdentifier,
				},
			);
		}

		return null;
	},
});

export const removeAll = mutation({
	args: {},
	returns: removeAllNotesResultValidator,
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const result = await deleteNoteBatch(ctx, ownerTokenIdentifier);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(0, internal.notes.removeAllForOwner, {
				ownerTokenIdentifier,
			});
		} else {
			await ctx.scheduler.runAfter(
				0,
				internal.transcriptSessions.removeAllForOwner,
				{
					ownerTokenIdentifier,
				},
			);
		}

		return result;
	},
});
