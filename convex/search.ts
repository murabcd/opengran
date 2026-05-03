import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireIdentity, requireOwnedWorkspace } from "./notes";

const MAX_RESULTS_PER_SOURCE = 20;
const MAX_RESULTS = 30;

const searchResultValidator = v.object({
	id: v.string(),
	kind: v.union(v.literal("note"), v.literal("chat")),
	title: v.string(),
	preview: v.optional(v.string()),
	updatedAt: v.number(),
});

type SearchResult = {
	id: string;
	kind: "note" | "chat";
	title: string;
	preview?: string;
	updatedAt: number;
};

export const command = query({
	args: {
		workspaceId: v.id("workspaces"),
		query: v.string(),
		titleOnly: v.optional(v.boolean()),
	},
	returns: v.array(searchResultValidator),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const queryText = args.query.trim();

		if (!queryText) {
			return [];
		}

		const [notesByTitle, notesByText, chatsByTitle, chatsByPreview] =
			await Promise.all([
				ctx.db
					.query("notes")
					.withSearchIndex("search_title", (q) =>
						q
							.search("title", queryText)
							.eq("ownerTokenIdentifier", ownerTokenIdentifier)
							.eq("workspaceId", args.workspaceId)
							.eq("isArchived", false),
					)
					.take(MAX_RESULTS_PER_SOURCE),
				args.titleOnly
					? []
					: ctx.db
							.query("notes")
							.withSearchIndex("search_text", (q) =>
								q
									.search("searchableText", queryText)
									.eq("ownerTokenIdentifier", ownerTokenIdentifier)
									.eq("workspaceId", args.workspaceId)
									.eq("isArchived", false),
							)
							.take(MAX_RESULTS_PER_SOURCE),
				ctx.db
					.query("chats")
					.withSearchIndex("search_title", (q) =>
						q
							.search("title", queryText)
							.eq("ownerTokenIdentifier", ownerTokenIdentifier)
							.eq("workspaceId", args.workspaceId)
							.eq("isArchived", false),
					)
					.take(MAX_RESULTS_PER_SOURCE),
				args.titleOnly
					? []
					: ctx.db
							.query("chats")
							.withSearchIndex("search_preview", (q) =>
								q
									.search("preview", queryText)
									.eq("ownerTokenIdentifier", ownerTokenIdentifier)
									.eq("workspaceId", args.workspaceId)
									.eq("isArchived", false),
							)
							.take(MAX_RESULTS_PER_SOURCE),
			]);

		const results = new Map<string, SearchResult>();

		for (const note of [...notesByTitle, ...notesByText]) {
			results.set(`note:${note._id}`, {
				id: note._id,
				kind: "note",
				title: note.title.trim() || "New note",
				preview: note.searchableText.trim() || undefined,
				updatedAt: note.updatedAt,
			});
		}

		for (const chat of [...chatsByTitle, ...chatsByPreview]) {
			results.set(`chat:${chat.chatId}`, {
				id: chat.chatId,
				kind: "chat",
				title: chat.title || "New chat",
				preview: chat.preview.trim() || undefined,
				updatedAt: chat.updatedAt,
			});
		}

		return [...results.values()]
			.sort((left, right) => right.updatedAt - left.updatedAt)
			.slice(0, MAX_RESULTS);
	},
});
