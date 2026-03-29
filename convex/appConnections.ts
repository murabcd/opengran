import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const yandexTrackerProviderValidator = v.literal("yandex-tracker");
const yandexCalendarProviderValidator = v.literal("yandex-calendar");
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

const yandexCalendarConnectionSettingsValidator = v.object({
	sourceId: v.string(),
	provider: yandexCalendarProviderValidator,
	status: appConnectionStatusValidator,
	displayName: v.string(),
	email: v.string(),
	serverAddress: v.string(),
	calendarHomePath: v.string(),
});

const yandexCalendarCredentialsValidator = v.union(
	v.object({
		provider: yandexCalendarProviderValidator,
		displayName: v.string(),
		email: v.string(),
		password: v.string(),
		serverAddress: v.string(),
		calendarHomePath: v.string(),
	}),
	v.null(),
);

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

type YandexCalendarConnectionSettings = {
	sourceId: string;
	provider: "yandex-calendar";
	status: "connected" | "disconnected";
	displayName: string;
	email: string;
	serverAddress: string;
	calendarHomePath: string;
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
	connection.provider === "yandex-calendar"
		? connection.email ?? "Yandex Calendar"
		: `${connection.orgType === "x-org-id" ? "Yandex 360" : "Yandex Cloud"} • Org ${connection.orgId}`;

const getOwnedConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	provider: "yandex-calendar" | "yandex-tracker",
) =>
	await ctx.db
		.query("appConnections")
		.withIndex("by_ownerTokenIdentifier_and_provider", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("provider", provider),
		)
		.unique();

const getOwnedYandexTrackerConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
) => await getOwnedConnection(ctx, ownerTokenIdentifier, "yandex-tracker");

const getOwnedYandexCalendarConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
) => await getOwnedConnection(ctx, ownerTokenIdentifier, "yandex-calendar");

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

		return connections
			.filter((connection) => connection.provider === "yandex-tracker")
			.map((connection) => ({
				id: toAppSourceId(connection._id),
				title: connection.displayName,
				preview: getProviderPreview(connection),
				provider: "yandex-tracker" as const,
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

		if (
			!connection ||
			!connection.orgType ||
			!connection.orgId
		) {
			return null;
		}

		return {
			sourceId: toAppSourceId(connection._id),
			provider: "yandex-tracker" as const,
			status: connection.status,
			displayName: connection.displayName,
			orgType: connection.orgType,
			orgId: connection.orgId,
		};
	},
});

export const getYandexCalendar = query({
	args: {},
	returns: v.union(yandexCalendarConnectionSettingsValidator, v.null()),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);
		const connection = await getOwnedYandexCalendarConnection(
			ctx,
			identity.tokenIdentifier,
		);

		if (
			!connection ||
			!connection.email ||
			!connection.serverAddress ||
			!connection.calendarHomePath
		) {
			return null;
		}

		return {
			sourceId: toAppSourceId(connection._id),
			provider: "yandex-calendar" as const,
			status: connection.status,
			displayName: connection.displayName,
			email: connection.email,
			serverAddress: connection.serverAddress,
			calendarHomePath: connection.calendarHomePath,
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
				connection.status !== "connected" ||
				connection.provider !== "yandex-tracker" ||
				!connection.orgType ||
				!connection.orgId ||
				!connection.token
			) {
				return [];
			}

			return [
				{
					sourceId: toAppSourceId(connection._id),
					provider: "yandex-tracker" as const,
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

		return connections.flatMap((connection) => {
			if (
				connection.provider !== "yandex-tracker" ||
				!connection.orgType ||
				!connection.orgId ||
				!connection.token
			) {
				return [];
			}

			return [
				{
					sourceId: toAppSourceId(connection._id),
					provider: "yandex-tracker" as const,
					displayName: connection.displayName,
					orgType: connection.orgType,
					orgId: connection.orgId,
					token: connection.token,
				},
			];
		});
	},
});

export const getYandexCalendarCredentials = internalQuery({
	args: {
		ownerTokenIdentifier: v.string(),
	},
	returns: yandexCalendarCredentialsValidator,
	handler: async (ctx, args) => {
		const connection = await getOwnedYandexCalendarConnection(
			ctx,
			args.ownerTokenIdentifier,
		);

		if (
			!connection ||
			connection.status !== "connected" ||
			!connection.email ||
			!connection.password ||
			!connection.serverAddress ||
			!connection.calendarHomePath
		) {
			return null;
		}

		return {
			provider: "yandex-calendar" as const,
			displayName: connection.displayName,
			email: connection.email,
			password: connection.password,
			serverAddress: connection.serverAddress,
			calendarHomePath: connection.calendarHomePath,
		};
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

export const upsertYandexCalendar = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		email: v.string(),
		password: v.string(),
		serverAddress: v.string(),
		calendarHomePath: v.string(),
	},
	returns: yandexCalendarConnectionSettingsValidator,
	handler: async (
		ctx,
		args,
	): Promise<YandexCalendarConnectionSettings> => {
		const now = Date.now();
		const email = args.email.trim().toLowerCase();
		const password = args.password.trim();
		const serverAddress = args.serverAddress.trim();
		const calendarHomePath = args.calendarHomePath.trim();
		const existingConnection = await getOwnedYandexCalendarConnection(
			ctx,
			args.ownerTokenIdentifier,
		);

		if (existingConnection) {
			await ctx.db.patch(existingConnection._id, {
				status: "connected",
				displayName: "Yandex Calendar",
				email,
				password,
				serverAddress,
				calendarHomePath,
				updatedAt: now,
			});

			return {
				sourceId: toAppSourceId(existingConnection._id),
				provider: "yandex-calendar" as const,
				status: "connected" as const,
				displayName: "Yandex Calendar",
				email,
				serverAddress,
				calendarHomePath,
			};
		}

		const id = await ctx.db.insert("appConnections", {
			ownerTokenIdentifier: args.ownerTokenIdentifier,
			provider: "yandex-calendar",
			status: "connected",
			displayName: "Yandex Calendar",
			email,
			password,
			serverAddress,
			calendarHomePath,
			createdAt: now,
			updatedAt: now,
		});

		return {
			sourceId: toAppSourceId(id),
			provider: "yandex-calendar" as const,
			status: "connected" as const,
			displayName: "Yandex Calendar",
			email,
			serverAddress,
			calendarHomePath,
		};
	},
});
