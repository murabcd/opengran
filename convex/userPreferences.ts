import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const userPreferencesValidator = v.object({
	transcriptionLanguage: v.union(v.string(), v.null()),
	jobTitle: v.union(v.string(), v.null()),
	companyName: v.union(v.string(), v.null()),
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

export const get = query({
	args: {},
	returns: userPreferencesValidator,
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const preferences = await getUserPreferencesRecord(
			ctx,
			identity.tokenIdentifier,
		);

		return {
			transcriptionLanguage: preferences?.transcriptionLanguage ?? null,
			jobTitle: preferences?.jobTitle ?? null,
			companyName: preferences?.companyName ?? null,
		};
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
					: existing?.transcriptionLanguage ?? null,
			jobTitle:
				args.jobTitle !== undefined ? args.jobTitle : existing?.jobTitle ?? null,
			companyName:
				args.companyName !== undefined
					? args.companyName
					: existing?.companyName ?? null,
		};

		if (existing) {
			await ctx.db.patch(existing._id, {
				transcriptionLanguage: nextPreferences.transcriptionLanguage,
				jobTitle: nextPreferences.jobTitle,
				companyName: nextPreferences.companyName,
				updatedAt: now,
			});

			return nextPreferences;
		}

		await ctx.db.insert("userPreferences", {
			ownerTokenIdentifier: identity.tokenIdentifier,
			transcriptionLanguage: nextPreferences.transcriptionLanguage,
			jobTitle: nextPreferences.jobTitle,
			companyName: nextPreferences.companyName,
			createdAt: now,
			updatedAt: now,
		});

		return nextPreferences;
	},
});
