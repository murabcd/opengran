import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const calendarPreferencesValidator = v.object({
	showGoogleCalendar: v.boolean(),
	showYandexCalendar: v.boolean(),
});

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access calendar preferences.",
		});
	}

	return identity;
};

const getCalendarPreferencesRecord = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
) =>
	await ctx.db
		.query("calendarPreferences")
		.withIndex("by_ownerTokenIdentifier", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
		)
		.unique();

export const get = query({
	args: {},
	returns: calendarPreferencesValidator,
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const preferences = await getCalendarPreferencesRecord(
			ctx,
			identity.tokenIdentifier,
		);

		return {
			showGoogleCalendar: preferences?.showGoogleCalendar ?? true,
			showYandexCalendar: preferences?.showYandexCalendar ?? true,
		};
	},
});

export const update = mutation({
	args: {
		showGoogleCalendar: v.boolean(),
		showYandexCalendar: v.boolean(),
	},
	returns: calendarPreferencesValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const existing = await getCalendarPreferencesRecord(
			ctx,
			identity.tokenIdentifier,
		);
		const now = Date.now();

		if (existing) {
			await ctx.db.patch(existing._id, {
				showGoogleCalendar: args.showGoogleCalendar,
				showYandexCalendar: args.showYandexCalendar,
				updatedAt: now,
			});

			return {
				showGoogleCalendar: args.showGoogleCalendar,
				showYandexCalendar: args.showYandexCalendar,
			};
		}

		await ctx.db.insert("calendarPreferences", {
			ownerTokenIdentifier: identity.tokenIdentifier,
			showGoogleCalendar: args.showGoogleCalendar,
			showYandexCalendar: args.showYandexCalendar,
			createdAt: now,
			updatedAt: now,
		});

		return {
			showGoogleCalendar: args.showGoogleCalendar,
			showYandexCalendar: args.showYandexCalendar,
		};
	},
});
