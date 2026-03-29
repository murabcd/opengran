"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";

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

type YandexTrackerConnectionResult = {
	sourceId: string;
	provider: "yandex-tracker";
	status: "connected" | "disconnected";
	displayName: string;
	orgType: "x-org-id" | "x-cloud-org-id";
	orgId: string;
};

const TRACKER_API_BASE_URL =
	process.env.TRACKER_API_BASE_URL ?? "https://api.tracker.yandex.net";

const getTrackerHeaderName = (
	orgType: "x-org-id" | "x-cloud-org-id",
): "X-Org-Id" | "X-Cloud-Org-Id" =>
	orgType === "x-cloud-org-id" ? "X-Cloud-Org-Id" : "X-Org-Id";

export const connectYandexTracker = action({
	args: {
		orgType: yandexTrackerOrgTypeValidator,
		orgId: v.string(),
		token: v.string(),
	},
	returns: yandexTrackerConnectionResultValidator,
	handler: async (ctx, args): Promise<YandexTrackerConnectionResult> => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			throw new ConvexError({
				code: "UNAUTHENTICATED",
				message: "You must be signed in to connect Yandex Tracker.",
			});
		}

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
