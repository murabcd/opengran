import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
	quickNotes: defineTable({
		ownerTokenIdentifier: v.string(),
		authorName: v.optional(v.string()),
		title: v.string(),
		content: v.string(),
		searchableText: v.string(),
		isArchived: v.boolean(),
		archivedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_ownerTokenIdentifier_and_updatedAt", [
			"ownerTokenIdentifier",
			"updatedAt",
		])
		.index("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", [
			"ownerTokenIdentifier",
			"isArchived",
			"updatedAt",
		]),
});
