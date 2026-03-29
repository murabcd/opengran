import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";

const yandexTrackerProviderValidator = v.literal("yandex-tracker");
const appConnectionStatusValidator = v.union(
	v.literal("connected"),
	v.literal("disconnected"),
);
const yandexTrackerOrgTypeValidator = v.union(
	v.literal("x-org-id"),
	v.literal("x-cloud-org-id"),
);

const yandexTrackerConnectionSettingsValidator = v.object({
	sourceId: v.string(),
	provider: yandexTrackerProviderValidator,
	status: appConnectionStatusValidator,
	displayName: v.string(),
	orgType: yandexTrackerOrgTypeValidator,
	orgId: v.string(),
});

const appConnectionSourceValidator = v.object({
	id: v.string(),
	title: v.string(),
	preview: v.string(),
	provider: yandexTrackerProviderValidator,
});

const chatToolConnectionValidator = v.object({
	sourceId: v.string(),
	provider: yandexTrackerProviderValidator,
	displayName: v.string(),
	orgType: yandexTrackerOrgTypeValidator,
	orgId: v.string(),
	token: v.string(),
});

const APP_SOURCE_PREFIX = "app:";
type YandexTrackerConnectionSettings = {
	sourceId: string;
	provider: "yandex-tracker";
	status: "connected" | "disconnected";
	displayName: string;
	orgType: "x-org-id" | "x-cloud-org-id";
	orgId: string;
};

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access app connections.",
		});
	}

	return identity;
};

const toAppSourceId = (id: Id<"appConnections">) => `${APP_SOURCE_PREFIX}${id}`;

const getProviderPreview = (connection: Doc<"appConnections">) =>
	`${connection.orgType === "x-org-id" ? "Yandex 360" : "Yandex Cloud"} • Org ${connection.orgId}`;

const getOwnedYandexTrackerConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
) =>
	await ctx.db
		.query("appConnections")
		.withIndex("by_ownerTokenIdentifier_and_provider", (q) =>
			q
				.eq("ownerTokenIdentifier", ownerTokenIdentifier)
				.eq("provider", "yandex-tracker"),
		)
		.unique();

const normalizeConnectionId = (
	ctx: QueryCtx | MutationCtx,
	sourceId: string,
) => {
	if (!sourceId.startsWith(APP_SOURCE_PREFIX)) {
		return null;
	}

	return ctx.db.normalizeId(
		"appConnections",
		sourceId.slice(APP_SOURCE_PREFIX.length),
	);
};

export const listSources = query({
	args: {},
	returns: v.array(appConnectionSourceValidator),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const connections = await ctx.db
			.query("appConnections")
			.withIndex("by_ownerTokenIdentifier_and_status_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", identity.tokenIdentifier)
					.eq("status", "connected"),
			)
			.order("desc")
			.take(20);

		return connections.map((connection) => ({
			id: toAppSourceId(connection._id),
			title: connection.displayName,
			preview: getProviderPreview(connection),
			provider: connection.provider,
		}));
	},
});

export const getYandexTracker = query({
	args: {},
	returns: v.union(yandexTrackerConnectionSettingsValidator, v.null()),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const connection = await getOwnedYandexTrackerConnection(
			ctx,
			identity.tokenIdentifier,
		);

		if (!connection) {
			return null;
		}

		return {
			sourceId: toAppSourceId(connection._id),
			provider: connection.provider,
			status: connection.status,
			displayName: connection.displayName,
			orgType: connection.orgType,
			orgId: connection.orgId,
		};
	},
});

export const getSelectedForChat = query({
	args: {
		sourceIds: v.array(v.string()),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const normalizedIds = args.sourceIds
			.map((sourceId) => normalizeConnectionId(ctx, sourceId))
			.filter((id, index, values): id is Id<"appConnections"> =>
				Boolean(id) && values.indexOf(id) === index,
			);

		if (normalizedIds.length === 0) {
			return [];
		}

		const connections = await Promise.all(
			normalizedIds.map((id) => ctx.db.get(id)),
		);

		return connections.flatMap((connection) => {
			if (
				!connection ||
				connection.ownerTokenIdentifier !== identity.tokenIdentifier ||
				connection.status !== "connected"
			) {
				return [];
			}

			return [
				{
					sourceId: toAppSourceId(connection._id),
					provider: connection.provider,
					displayName: connection.displayName,
					orgType: connection.orgType,
					orgId: connection.orgId,
					token: connection.token,
				},
			];
		});
	},
});

export const getAllForChat = query({
	args: {},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const connections = await ctx.db
			.query("appConnections")
			.withIndex("by_ownerTokenIdentifier_and_status_and_updatedAt", (q) =>
				q
					.eq("ownerTokenIdentifier", identity.tokenIdentifier)
					.eq("status", "connected"),
			)
			.order("desc")
			.take(20);

		return connections.map((connection) => ({
			sourceId: toAppSourceId(connection._id),
			provider: connection.provider,
			displayName: connection.displayName,
			orgType: connection.orgType,
			orgId: connection.orgId,
			token: connection.token,
		}));
	},
});

export const upsertYandexTracker = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		orgType: yandexTrackerOrgTypeValidator,
		orgId: v.string(),
		token: v.string(),
	},
	returns: yandexTrackerConnectionSettingsValidator,
	handler: async (ctx, args): Promise<YandexTrackerConnectionSettings> => {
		const now = Date.now();
		const orgId = args.orgId.trim();
		const token = args.token.trim();
		const existingConnection = await getOwnedYandexTrackerConnection(
			ctx,
			args.ownerTokenIdentifier,
		);

		if (existingConnection) {
			await ctx.db.patch(existingConnection._id, {
				status: "connected",
				displayName: "Yandex Tracker",
				orgType: args.orgType,
				orgId,
				token,
				updatedAt: now,
			});

			return {
				sourceId: toAppSourceId(existingConnection._id),
				provider: "yandex-tracker" as const,
				status: "connected" as const,
				displayName: "Yandex Tracker",
				orgType: args.orgType,
				orgId,
			};
		}

		const id = await ctx.db.insert("appConnections", {
			ownerTokenIdentifier: args.ownerTokenIdentifier,
			provider: "yandex-tracker",
			status: "connected",
			displayName: "Yandex Tracker",
			orgType: args.orgType,
			orgId,
			token,
			createdAt: now,
			updatedAt: now,
		});

		return {
			sourceId: toAppSourceId(id),
			provider: "yandex-tracker" as const,
			status: "connected" as const,
			displayName: "Yandex Tracker",
			orgType: args.orgType,
			orgId,
		};
	},
});
