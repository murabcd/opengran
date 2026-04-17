import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const userPreferencesValidator = v.object({
	transcriptionLanguage: v.union(v.string(), v.null()),
	jobTitle: v.union(v.string(), v.null()),
	companyName: v.union(v.string(), v.null()),
	avatarStorageId: v.union(v.id("_storage"), v.null()),
	avatarUrl: v.union(v.string(), v.null()),
});

const userAiProfileContextValidator = v.object({
	name: v.union(v.string(), v.null()),
	jobTitle: v.union(v.string(), v.null()),
	companyName: v.union(v.string(), v.null()),
});

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access user preferences.",
		});
	}

	return identity;
};

const getFirstName = (value: string | null | undefined) => {
	const trimmedValue = value?.trim() ?? "";

	if (!trimmedValue) {
		return null;
	}

	return trimmedValue.split(/\s+/u)[0] ?? null;
};

const getUserPreferencesRecord = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
) =>
	await ctx.db
		.query("userPreferences")
		.withIndex("by_ownerTokenIdentifier", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
		)
		.unique();

const toUserPreferencesResponse = async (
	ctx: QueryCtx | MutationCtx,
	preferences: Awaited<ReturnType<typeof getUserPreferencesRecord>>,
) => ({
	transcriptionLanguage: preferences?.transcriptionLanguage ?? null,
	jobTitle: preferences?.jobTitle ?? null,
	companyName: preferences?.companyName ?? null,
	avatarStorageId: preferences?.avatarStorageId ?? null,
	avatarUrl: preferences?.avatarStorageId
		? await ctx.storage.getUrl(preferences.avatarStorageId)
		: null,
});

export const get = query({
	args: {},
	returns: userPreferencesValidator,
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const preferences = await getUserPreferencesRecord(
			ctx,
			identity.tokenIdentifier,
		);

		return await toUserPreferencesResponse(ctx, preferences);
	},
});

export const getAiProfileContext = query({
	args: {},
	returns: userAiProfileContextValidator,
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const preferences = await getUserPreferencesRecord(
			ctx,
			identity.tokenIdentifier,
		);

		return {
			name: getFirstName(identity.name),
			jobTitle: preferences?.jobTitle ?? null,
			companyName: preferences?.companyName ?? null,
		};
	},
});

export const update = mutation({
	args: {
		transcriptionLanguage: v.optional(v.union(v.string(), v.null())),
		jobTitle: v.optional(v.union(v.string(), v.null())),
		companyName: v.optional(v.union(v.string(), v.null())),
		avatarStorageId: v.optional(v.union(v.id("_storage"), v.null())),
	},
	returns: userPreferencesValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const existing = await getUserPreferencesRecord(
			ctx,
			identity.tokenIdentifier,
		);
		const now = Date.now();
		const nextPreferences = {
			transcriptionLanguage:
				args.transcriptionLanguage !== undefined
					? args.transcriptionLanguage
					: (existing?.transcriptionLanguage ?? null),
			jobTitle:
				args.jobTitle !== undefined
					? args.jobTitle
					: (existing?.jobTitle ?? null),
			companyName:
				args.companyName !== undefined
					? args.companyName
					: (existing?.companyName ?? null),
			avatarStorageId:
				args.avatarStorageId !== undefined
					? args.avatarStorageId
					: (existing?.avatarStorageId ?? null),
		};

		if (existing) {
			if (
				nextPreferences.transcriptionLanguage ===
					existing.transcriptionLanguage &&
				nextPreferences.jobTitle === existing.jobTitle &&
				nextPreferences.companyName === existing.companyName &&
				(nextPreferences.avatarStorageId ?? undefined) ===
					existing.avatarStorageId
			) {
				return await toUserPreferencesResponse(ctx, existing);
			}

			if (
				existing.avatarStorageId &&
				existing.avatarStorageId !== nextPreferences.avatarStorageId
			) {
				await ctx.storage.delete(existing.avatarStorageId);
			}

			await ctx.db.patch(existing._id, {
				transcriptionLanguage: nextPreferences.transcriptionLanguage,
				jobTitle: nextPreferences.jobTitle,
				companyName: nextPreferences.companyName,
				avatarStorageId: nextPreferences.avatarStorageId ?? undefined,
				updatedAt: now,
			});

			return await toUserPreferencesResponse(ctx, {
				...existing,
				transcriptionLanguage: nextPreferences.transcriptionLanguage,
				jobTitle: nextPreferences.jobTitle,
				companyName: nextPreferences.companyName,
				avatarStorageId: nextPreferences.avatarStorageId ?? undefined,
				updatedAt: now,
			});
		}

		const preferenceId = await ctx.db.insert("userPreferences", {
			ownerTokenIdentifier: identity.tokenIdentifier,
			transcriptionLanguage: nextPreferences.transcriptionLanguage,
			jobTitle: nextPreferences.jobTitle,
			companyName: nextPreferences.companyName,
			avatarStorageId: nextPreferences.avatarStorageId ?? undefined,
			createdAt: now,
			updatedAt: now,
		});

		const inserted = await ctx.db.get(preferenceId);
		return await toUserPreferencesResponse(ctx, inserted);
	},
});

export const generateAvatarUploadUrl = mutation({
	args: {},
	returns: v.string(),
	handler: async (ctx) => {
		await requireIdentity(ctx);
		return await ctx.storage.generateUploadUrl();
	},
});

export const removeAllForOwner = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const preferences = await getUserPreferencesRecord(
			ctx,
			args.ownerTokenIdentifier,
		);

		if (!preferences) {
			return null;
		}

		if (preferences.avatarStorageId) {
			await ctx.storage.delete(preferences.avatarStorageId);
		}

		await ctx.db.delete(preferences._id);
		return null;
	},
});
