import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const quickNoteFields = {
	_id: v.id("quickNotes"),
	_creationTime: v.number(),
	ownerTokenIdentifier: v.string(),
	authorName: v.optional(v.string()),
	title: v.string(),
	content: v.string(),
	searchableText: v.string(),
	isArchived: v.boolean(),
	archivedAt: v.optional(v.number()),
	createdAt: v.number(),
	updatedAt: v.number(),
};

const quickNoteValidator = v.object(quickNoteFields);

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

const requireTokenIdentifier = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await requireIdentity(ctx);

	return identity.tokenIdentifier;
};

export const getLatest = query({
	args: {},
	returns: v.union(quickNoteValidator, v.null()),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);

		return await ctx.db
			.query("quickNotes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", false),
			)
			.order("desc")
			.first();
	},
});

export const list = query({
	args: {},
	returns: v.array(quickNoteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);

		return await ctx.db
			.query("quickNotes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", false),
			)
			.order("desc")
			.take(100);
	},
});

export const listArchived = query({
	args: {},
	returns: v.array(quickNoteValidator),
	handler: async (ctx) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);

		return await ctx.db
			.query("quickNotes")
			.withIndex("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("isArchived", true),
			)
			.order("desc")
			.take(100);
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

		return note;
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
			const existing = await ctx.db.get(args.id);

			if (!existing) {
				throw new ConvexError({
					code: "NOTE_NOT_FOUND",
					message: "Quick note not found.",
				});
			}

			if (existing.ownerTokenIdentifier !== ownerTokenIdentifier) {
				throw new ConvexError({
					code: "UNAUTHORIZED",
					message: "You do not have access to this quick note.",
				});
			}

			await ctx.db.patch(args.id, {
				authorName: existing.authorName ?? authorName,
				title: args.title,
				content: args.content,
				searchableText: args.searchableText,
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
			isArchived: false,
			archivedAt: undefined,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const moveToTrash = mutation({
	args: {
		id: v.id("quickNotes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const existing = await ctx.db.get(args.id);

		if (!existing) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Quick note not found.",
			});
		}

		if (existing.ownerTokenIdentifier !== ownerTokenIdentifier) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You do not have access to this quick note.",
			});
		}

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
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const existing = await ctx.db.get(args.id);

		if (!existing) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Quick note not found.",
			});
		}

		if (existing.ownerTokenIdentifier !== ownerTokenIdentifier) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You do not have access to this quick note.",
			});
		}

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
		const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
		const existing = await ctx.db.get(args.id);

		if (!existing) {
			throw new ConvexError({
				code: "NOTE_NOT_FOUND",
				message: "Quick note not found.",
			});
		}

		if (existing.ownerTokenIdentifier !== ownerTokenIdentifier) {
			throw new ConvexError({
				code: "UNAUTHORIZED",
				message: "You do not have access to this quick note.",
			});
		}

		await ctx.db.delete(args.id);

		return null;
	},
});
