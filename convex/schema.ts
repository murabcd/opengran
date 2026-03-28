import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const workspaceRoleValidator = v.union(
	v.literal("startup-generalist"),
	v.literal("investing"),
	v.literal("recruiting"),
	v.literal("customer-facing"),
);

const transcriptSessionStatusValidator = v.union(
	v.literal("capturing"),
	v.literal("completed"),
	v.literal("failed"),
);

const transcriptRefinementStatusValidator = v.union(
	v.literal("idle"),
	v.literal("running"),
	v.literal("completed"),
	v.literal("failed"),
);

export default defineSchema({
	onboardingStates: defineTable({
		ownerTokenIdentifier: v.string(),
		hasSeenWelcomeCelebration: v.boolean(),
		hasCompletedDesktopPermissions: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_ownerTokenIdentifier", ["ownerTokenIdentifier"]),
	templates: defineTable({
		ownerTokenIdentifier: v.string(),
		slug: v.string(),
		name: v.string(),
		meetingContext: v.string(),
		sections: v.array(
			v.object({
				id: v.string(),
				title: v.string(),
				prompt: v.string(),
			}),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_ownerTokenIdentifier_and_createdAt", [
			"ownerTokenIdentifier",
			"createdAt",
		])
		.index("by_ownerTokenIdentifier_and_slug", [
			"ownerTokenIdentifier",
			"slug",
		]),
	workspaces: defineTable({
		ownerTokenIdentifier: v.string(),
		name: v.string(),
		normalizedName: v.string(),
		icon: v.optional(v.string()),
		role: workspaceRoleValidator,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_ownerTokenIdentifier_and_createdAt", [
			"ownerTokenIdentifier",
			"createdAt",
		])
		.index("by_ownerTokenIdentifier_and_normalizedName", [
			"ownerTokenIdentifier",
			"normalizedName",
		]),
	notes: defineTable({
		ownerTokenIdentifier: v.string(),
		authorName: v.optional(v.string()),
		title: v.string(),
		templateSlug: v.optional(v.string()),
		content: v.string(),
		searchableText: v.string(),
		visibility: v.union(v.literal("private"), v.literal("public")),
		shareId: v.optional(v.string()),
		sharedAt: v.optional(v.number()),
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
		])
		.index("by_owner_visibility_archived_updatedAt", [
			"ownerTokenIdentifier",
			"visibility",
			"isArchived",
			"updatedAt",
		])
		.index("by_shareId", ["shareId"]),
	chats: defineTable({
		ownerTokenIdentifier: v.string(),
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
	})
		.index("by_ownerTokenIdentifier_and_updatedAt", [
			"ownerTokenIdentifier",
			"updatedAt",
		])
		.index("by_ownerTokenIdentifier_and_isArchived_and_updatedAt", [
			"ownerTokenIdentifier",
			"isArchived",
			"updatedAt",
		])
		.index("by_ownerTokenIdentifier_and_noteId_and_isArchived_and_updatedAt", [
			"ownerTokenIdentifier",
			"noteId",
			"isArchived",
			"updatedAt",
		])
		.index("by_ownerTokenIdentifier_and_chatId", [
			"ownerTokenIdentifier",
			"chatId",
		])
		.index("by_ownerTokenIdentifier_and_noteId_and_chatId", [
			"ownerTokenIdentifier",
			"noteId",
			"chatId",
		]),
	chatMessages: defineTable({
		chatId: v.id("chats"),
		ownerTokenIdentifier: v.string(),
		messageId: v.string(),
		role: v.union(
			v.literal("system"),
			v.literal("user"),
			v.literal("assistant"),
		),
		partsJson: v.string(),
		metadataJson: v.optional(v.string()),
		text: v.string(),
		createdAt: v.number(),
	})
		.index("by_chatId_and_createdAt", ["chatId", "createdAt"])
		.index("by_chatId_and_messageId", ["chatId", "messageId"]),
	transcriptSessions: defineTable({
		ownerTokenIdentifier: v.string(),
		noteId: v.id("notes"),
		status: transcriptSessionStatusValidator,
		refinementStatus: transcriptRefinementStatusValidator,
		refinementError: v.optional(v.string()),
		systemAudioSourceMode: v.optional(
			v.union(
				v.literal("desktop-native"),
				v.literal("display-media"),
				v.literal("unsupported"),
			),
		),
		startedAt: v.number(),
		endedAt: v.optional(v.number()),
		finalTranscript: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		lastRefinedAt: v.optional(v.number()),
	})
		.index("by_ownerTokenIdentifier_and_noteId_and_updatedAt", [
			"ownerTokenIdentifier",
			"noteId",
			"updatedAt",
		])
		.index("by_ownerTokenIdentifier_and_updatedAt", [
			"ownerTokenIdentifier",
			"updatedAt",
		]),
	transcriptUtterances: defineTable({
		sessionId: v.id("transcriptSessions"),
		ownerTokenIdentifier: v.string(),
		noteId: v.id("notes"),
		utteranceId: v.string(),
		speaker: v.string(),
		source: v.union(v.literal("live"), v.literal("refined")),
		text: v.string(),
		startedAt: v.number(),
		endedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_sessionId_and_startedAt", ["sessionId", "startedAt"])
		.index("by_sessionId_and_utteranceId", ["sessionId", "utteranceId"])
		.index("by_ownerTokenIdentifier_and_noteId_and_startedAt", [
			"ownerTokenIdentifier",
			"noteId",
			"startedAt",
		]),
});
