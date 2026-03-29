"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import {
	verifyYandexCalendarConnection,
	YANDEX_CALENDAR_SERVER_ADDRESS,
} from "./yandexCalendar";

const yandexTrackerOrgTypeValidator = v.union(
	v.literal("x-org-id"),
	v.literal("x-cloud-org-id"),
);

const yandexTrackerConnectionResultValidator = v.object({
	sourceId: v.string(),
	provider: v.literal("yandex-tracker"),
	status: v.union(v.literal("connected"), v.literal("disconnected")),
	displayName: v.string(),
	orgType: yandexTrackerOrgTypeValidator,
	orgId: v.string(),
});

const yandexCalendarConnectionResultValidator = v.object({
	sourceId: v.string(),
	provider: v.literal("yandex-calendar"),
	status: v.union(v.literal("connected"), v.literal("disconnected")),
	displayName: v.string(),
	email: v.string(),
	serverAddress: v.string(),
	calendarHomePath: v.string(),
});

type YandexTrackerConnectionResult = {
	sourceId: string;
	provider: "yandex-tracker";
	status: "connected" | "disconnected";
	displayName: string;
	orgType: "x-org-id" | "x-cloud-org-id";
	orgId: string;
};

type YandexCalendarConnectionResult = {
	sourceId: string;
	provider: "yandex-calendar";
	status: "connected" | "disconnected";
	displayName: string;
	email: string;
	serverAddress: string;
	calendarHomePath: string;
};

const TRACKER_API_BASE_URL =
	process.env.TRACKER_API_BASE_URL ?? "https://api.tracker.yandex.net";

const getTrackerHeaderName = (
	orgType: "x-org-id" | "x-cloud-org-id",
): "X-Org-Id" | "X-Cloud-Org-Id" =>
	orgType === "x-cloud-org-id" ? "X-Cloud-Org-Id" : "X-Org-Id";

const requireIdentity = async (ctx: ActionCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to connect app integrations.",
		});
	}

	return identity;
};

export const connectYandexTracker = action({
	args: {
		orgType: yandexTrackerOrgTypeValidator,
		orgId: v.string(),
		token: v.string(),
	},
	returns: yandexTrackerConnectionResultValidator,
	handler: async (ctx, args): Promise<YandexTrackerConnectionResult> => {
		const identity = await requireIdentity(ctx);
		const orgId = args.orgId.trim();
		const token = args.token.trim();

		if (!orgId || !token) {
			throw new ConvexError({
				code: "INVALID_CONNECTION_DETAILS",
				message: "Organization ID and OAuth token are required.",
			});
		}

		const response = await fetch(`${TRACKER_API_BASE_URL}/v3/myself`, {
			headers: {
				Authorization: `OAuth ${token}`,
				[getTrackerHeaderName(args.orgType)]: orgId,
			},
		});

		if (!response.ok) {
			const responseText = await response.text().catch(() => "");
			throw new ConvexError({
				code: "TRACKER_CONNECTION_FAILED",
				message: responseText.trim()
					? `Failed to connect Yandex Tracker: ${responseText.trim()}`
					: `Failed to connect Yandex Tracker (${response.status}).`,
			});
		}

		return await ctx.runMutation(internal.appConnections.upsertYandexTracker, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			orgType: args.orgType,
			orgId,
			token,
		});
	},
});

export const connectYandexCalendar = action({
	args: {
		email: v.string(),
		password: v.string(),
	},
	returns: yandexCalendarConnectionResultValidator,
	handler: async (ctx, args): Promise<YandexCalendarConnectionResult> => {
		const identity = await requireIdentity(ctx);
		const email = args.email.trim().toLowerCase();
		const password = args.password.trim();

		if (!email || !password) {
			throw new ConvexError({
				code: "INVALID_CONNECTION_DETAILS",
				message: "Email and app password are required.",
			});
		}

		try {
			const verifiedConnection = await verifyYandexCalendarConnection({
				email,
				password,
				serverAddress: YANDEX_CALENDAR_SERVER_ADDRESS,
			});

			return await ctx.runMutation(
				internal.appConnections.upsertYandexCalendar,
				{
					ownerTokenIdentifier: identity.tokenIdentifier,
					email: verifiedConnection.email,
					password,
					serverAddress: verifiedConnection.serverAddress,
					calendarHomePath: verifiedConnection.calendarHomePath,
				},
			);
		} catch (error) {
			throw new ConvexError({
				code: "YANDEX_CALENDAR_CONNECTION_FAILED",
				message:
					error instanceof Error
						? error.message
						: "Failed to connect Yandex Calendar.",
			});
		}
	},
});
