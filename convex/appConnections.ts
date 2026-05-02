import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery, query } from "./_generated/server";

const yandexTrackerProviderValidator = v.literal("yandex-tracker");
const yandexCalendarProviderValidator = v.literal("yandex-calendar");
const jiraProviderValidator = v.literal("jira");
const posthogProviderValidator = v.literal("posthog");
const notionProviderValidator = v.literal("notion");
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

const jiraConnectionSettingsValidator = v.object({
	sourceId: v.string(),
	provider: jiraProviderValidator,
	status: appConnectionStatusValidator,
	displayName: v.string(),
	baseUrl: v.string(),
	email: v.string(),
	accountId: v.optional(v.string()),
	webhookSecret: v.optional(v.string()),
	lastWebhookReceivedAt: v.optional(v.number()),
	lastMentionSyncAt: v.optional(v.number()),
});

const posthogConnectionSettingsValidator = v.object({
	sourceId: v.string(),
	provider: posthogProviderValidator,
	status: appConnectionStatusValidator,
	displayName: v.string(),
	baseUrl: v.string(),
	projectId: v.string(),
	projectName: v.string(),
});

const notionConnectionSettingsValidator = v.object({
	sourceId: v.string(),
	provider: notionProviderValidator,
	status: appConnectionStatusValidator,
	displayName: v.string(),
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
	provider: v.union(
		yandexCalendarProviderValidator,
		yandexTrackerProviderValidator,
		jiraProviderValidator,
		posthogProviderValidator,
		notionProviderValidator,
	),
});

const yandexTrackerChatToolConnectionValidator = v.object({
	sourceId: v.string(),
	provider: yandexTrackerProviderValidator,
	displayName: v.string(),
	orgType: yandexTrackerOrgTypeValidator,
	orgId: v.string(),
	token: v.string(),
});

const yandexCalendarChatToolConnectionValidator = v.object({
	sourceId: v.string(),
	provider: yandexCalendarProviderValidator,
	displayName: v.string(),
	email: v.string(),
	password: v.string(),
	serverAddress: v.string(),
	calendarHomePath: v.string(),
});

const jiraChatToolConnectionValidator = v.object({
	sourceId: v.string(),
	provider: jiraProviderValidator,
	displayName: v.string(),
	baseUrl: v.string(),
	email: v.string(),
	token: v.string(),
});

const posthogChatToolConnectionValidator = v.object({
	sourceId: v.string(),
	provider: posthogProviderValidator,
	displayName: v.string(),
	baseUrl: v.string(),
	projectId: v.string(),
	projectName: v.string(),
	token: v.string(),
});

const notionChatToolConnectionValidator = v.object({
	sourceId: v.string(),
	provider: notionProviderValidator,
	displayName: v.string(),
	token: v.string(),
});

const chatToolConnectionValidator = v.union(
	yandexCalendarChatToolConnectionValidator,
	yandexTrackerChatToolConnectionValidator,
	jiraChatToolConnectionValidator,
	posthogChatToolConnectionValidator,
	notionChatToolConnectionValidator,
);

const APP_SOURCE_PREFIX = "app:";
const REMOVE_ALL_APP_CONNECTIONS_BATCH_SIZE = 100;

const jiraWebhookConnectionValidator = v.union(
	v.object({
		connectionId: v.id("appConnections"),
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		baseUrl: v.string(),
		email: v.string(),
		token: v.string(),
		accountId: v.optional(v.string()),
	}),
	v.null(),
);

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

type JiraConnectionSettings = {
	sourceId: string;
	provider: "jira";
	status: "connected" | "disconnected";
	displayName: string;
	baseUrl: string;
	email: string;
	accountId?: string;
	webhookSecret?: string;
	lastWebhookReceivedAt?: number;
	lastMentionSyncAt?: number;
};

type PostHogConnectionSettings = {
	sourceId: string;
	provider: "posthog";
	status: "connected" | "disconnected";
	displayName: string;
	baseUrl: string;
	projectId: string;
	projectName: string;
};

type NotionConnectionSettings = {
	sourceId: string;
	provider: "notion";
	status: "connected" | "disconnected";
	displayName: string;
};

type ConnectionActivitySnapshot = {
	lastWebhookReceivedAt?: number;
	lastMentionSyncAt?: number;
};

type AppConnectionSource = {
	id: string;
	title: string;
	preview: string;
	provider:
		| "jira"
		| "notion"
		| "posthog"
		| "yandex-calendar"
		| "yandex-tracker";
};

type ChatToolConnection =
	| {
			sourceId: string;
			provider: "yandex-calendar";
			displayName: string;
			email: string;
			password: string;
			serverAddress: string;
			calendarHomePath: string;
	  }
	| {
			sourceId: string;
			provider: "yandex-tracker";
			displayName: string;
			orgType: "x-org-id" | "x-cloud-org-id";
			orgId: string;
			token: string;
	  }
	| {
			sourceId: string;
			provider: "jira";
			displayName: string;
			baseUrl: string;
			email: string;
			token: string;
	  }
	| {
			sourceId: string;
			provider: "posthog";
			displayName: string;
			baseUrl: string;
			projectId: string;
			projectName: string;
			token: string;
	  }
	| {
			sourceId: string;
			provider: "notion";
			displayName: string;
			token: string;
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

const requireOwnedWorkspace = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => {
	const workspace = await ctx.db.get(workspaceId);

	if (!workspace || workspace.ownerTokenIdentifier !== ownerTokenIdentifier) {
		throw new ConvexError({
			code: "WORKSPACE_NOT_FOUND",
			message: "Workspace not found.",
		});
	}

	return workspace;
};

const toAppSourceId = (id: Id<"appConnections">) => `${APP_SOURCE_PREFIX}${id}`;

const getProviderPreview = (connection: Doc<"appConnections">) =>
	connection.provider === "yandex-calendar"
		? (connection.email ?? "Yandex Calendar")
		: connection.provider === "jira"
			? getJiraPreview(connection)
			: connection.provider === "posthog"
				? getPostHogPreview(connection)
				: connection.provider === "notion"
					? (connection.email ?? "Notion workspace")
				: `${connection.orgType === "x-org-id" ? "Yandex 360" : "Yandex Cloud"} • Org ${connection.orgId}`;

const getJiraPreview = (connection: Doc<"appConnections">) => {
	if (!connection.baseUrl) {
		return connection.email ?? "Jira";
	}

	try {
		const hostname = new URL(connection.baseUrl).hostname;
		return connection.email ? `${hostname} • ${connection.email}` : hostname;
	} catch {
		return connection.email
			? `${connection.baseUrl} • ${connection.email}`
			: connection.baseUrl;
	}
};

const getPostHogPreview = (connection: Doc<"appConnections">) => {
	const projectLabel =
		connection.projectName?.trim() ||
		(connection.projectId ? `Project ${connection.projectId}` : "PostHog");

	if (!connection.baseUrl) {
		return projectLabel;
	}

	try {
		const hostname = new URL(connection.baseUrl).hostname;
		return `${hostname} • ${projectLabel}`;
	} catch {
		return `${connection.baseUrl} • ${projectLabel}`;
	}
};

const generateWebhookSecret = () =>
	`${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;

const getOwnedConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
	provider:
		| "jira"
		| "notion"
		| "posthog"
		| "yandex-calendar"
		| "yandex-tracker",
) =>
	await ctx.db
		.query("appConnections")
		.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_provider", (q) =>
			q
				.eq("ownerTokenIdentifier", ownerTokenIdentifier)
				.eq("workspaceId", workspaceId)
				.eq("provider", provider),
		)
		.unique();

const getOwnedYandexTrackerConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) =>
	await getOwnedConnection(
		ctx,
		ownerTokenIdentifier,
		workspaceId,
		"yandex-tracker",
	);

const getOwnedYandexCalendarConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) =>
	await getOwnedConnection(
		ctx,
		ownerTokenIdentifier,
		workspaceId,
		"yandex-calendar",
	);

const getOwnedJiraConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => await getOwnedConnection(ctx, ownerTokenIdentifier, workspaceId, "jira");

const getOwnedPostHogConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) =>
	await getOwnedConnection(ctx, ownerTokenIdentifier, workspaceId, "posthog");

const getOwnedNotionConnection = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) =>
	await getOwnedConnection(ctx, ownerTokenIdentifier, workspaceId, "notion");

const getConnectionActivity = async (
	ctx: QueryCtx | MutationCtx,
	connectionId: Id<"appConnections">,
) =>
	await ctx.db
		.query("appConnectionActivities")
		.withIndex("by_connectionId", (q) => q.eq("connectionId", connectionId))
		.unique();

const getConnectionActivitySnapshot = async (
	ctx: QueryCtx | MutationCtx,
	connectionId: Id<"appConnections">,
): Promise<ConnectionActivitySnapshot> => {
	const activity = await getConnectionActivity(ctx, connectionId);

	return {
		lastWebhookReceivedAt: activity?.lastWebhookReceivedAt,
		lastMentionSyncAt: activity?.lastMentionSyncAt,
	};
};

const upsertConnectionActivity = async (
	ctx: MutationCtx,
	connection: Doc<"appConnections">,
	patch: ConnectionActivitySnapshot,
) => {
	const activity = await getConnectionActivity(ctx, connection._id);
	const now = Date.now();

	if (activity) {
		await ctx.db.patch(activity._id, {
			...patch,
			updatedAt: now,
		});
		return;
	}

	await ctx.db.insert("appConnectionActivities", {
		connectionId: connection._id,
		ownerTokenIdentifier: connection.ownerTokenIdentifier,
		workspaceId: connection.workspaceId,
		...(patch.lastWebhookReceivedAt
			? { lastWebhookReceivedAt: patch.lastWebhookReceivedAt }
			: {}),
		...(patch.lastMentionSyncAt
			? { lastMentionSyncAt: patch.lastMentionSyncAt }
			: {}),
		createdAt: now,
		updatedAt: now,
	});
};

const deleteConnectionActivity = async (
	ctx: MutationCtx,
	connectionId: Id<"appConnections">,
) => {
	const activity = await getConnectionActivity(ctx, connectionId);

	if (activity) {
		await ctx.db.delete(activity._id);
	}
};

const toChatToolConnection = (
	connection: Doc<"appConnections"> | null,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
): ChatToolConnection | null => {
	if (
		!connection ||
		connection.ownerTokenIdentifier !== ownerTokenIdentifier ||
		connection.workspaceId !== workspaceId ||
		connection.status !== "connected"
	) {
		return null;
	}

	if (
		connection.provider === "yandex-calendar" &&
		connection.email &&
		connection.password &&
		connection.serverAddress &&
		connection.calendarHomePath
	) {
		return {
			sourceId: toAppSourceId(connection._id),
			provider: "yandex-calendar",
			displayName: connection.displayName,
			email: connection.email,
			password: connection.password,
			serverAddress: connection.serverAddress,
			calendarHomePath: connection.calendarHomePath,
		};
	}

	if (
		connection.provider === "yandex-tracker" &&
		connection.orgType &&
		connection.orgId &&
		connection.token
	) {
		return {
			sourceId: toAppSourceId(connection._id),
			provider: "yandex-tracker",
			displayName: connection.displayName,
			orgType: connection.orgType,
			orgId: connection.orgId,
			token: connection.token,
		};
	}

	if (
		connection.provider === "jira" &&
		connection.baseUrl &&
		connection.email &&
		connection.token
	) {
		return {
			sourceId: toAppSourceId(connection._id),
			provider: "jira",
			displayName: connection.displayName,
			baseUrl: connection.baseUrl,
			email: connection.email,
			token: connection.token,
		};
	}

	if (
		connection.provider === "posthog" &&
		connection.baseUrl &&
		connection.projectId &&
		connection.projectName &&
		connection.token
	) {
		return {
			sourceId: toAppSourceId(connection._id),
			provider: "posthog",
			displayName: connection.displayName,
			baseUrl: connection.baseUrl,
			projectId: connection.projectId,
			projectName: connection.projectName,
			token: connection.token,
		};
	}

	if (connection.provider === "notion" && connection.token) {
		return {
			sourceId: toAppSourceId(connection._id),
			provider: "notion",
			displayName: connection.displayName,
			token: connection.token,
		};
	}

	return null;
};

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
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(appConnectionSourceValidator),
	handler: async (ctx, args): Promise<AppConnectionSource[]> => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const connections = await ctx.db
			.query("appConnections")
			.withIndex(
				"by_ownerTokenIdentifier_and_workspaceId_and_status_and_updatedAt",
				(q) =>
					q
						.eq("ownerTokenIdentifier", identity.tokenIdentifier)
						.eq("workspaceId", args.workspaceId)
						.eq("status", "connected"),
			)
			.order("desc")
			.take(20);

		const sources: AppConnectionSource[] = [];

		for (const connection of connections) {
			if (
				connection.provider !== "yandex-calendar" &&
				connection.provider !== "yandex-tracker" &&
				connection.provider !== "jira" &&
				connection.provider !== "posthog" &&
				connection.provider !== "notion"
			) {
				continue;
			}

			sources.push({
				id: toAppSourceId(connection._id),
				title: connection.displayName,
				preview: getProviderPreview(connection),
				provider: connection.provider,
			});
		}

		return sources;
	},
});

export const getYandexTracker = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.union(yandexTrackerConnectionSettingsValidator, v.null()),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const connection = await getOwnedYandexTrackerConnection(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);

		if (!connection?.orgType || !connection.orgId) {
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
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.union(yandexCalendarConnectionSettingsValidator, v.null()),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const connection = await getOwnedYandexCalendarConnection(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);

		if (
			!connection?.email ||
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

export const getJira = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.union(jiraConnectionSettingsValidator, v.null()),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const connection = await getOwnedJiraConnection(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);

		if (!connection?.baseUrl || !connection.email) {
			return null;
		}

		const activity = await getConnectionActivitySnapshot(ctx, connection._id);

		return {
			sourceId: toAppSourceId(connection._id),
			provider: "jira" as const,
			status: connection.status,
			displayName: connection.displayName,
			baseUrl: connection.baseUrl,
			email: connection.email,
			...(connection.accountId ? { accountId: connection.accountId } : {}),
			...(connection.webhookSecret
				? { webhookSecret: connection.webhookSecret }
				: {}),
			...(activity.lastWebhookReceivedAt
				? { lastWebhookReceivedAt: activity.lastWebhookReceivedAt }
				: {}),
			...(activity.lastMentionSyncAt
				? { lastMentionSyncAt: activity.lastMentionSyncAt }
				: {}),
		};
	},
});

export const getPostHog = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.union(posthogConnectionSettingsValidator, v.null()),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const connection = await getOwnedPostHogConnection(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);

		if (
			!connection?.baseUrl ||
			!connection.projectId ||
			!connection.projectName
		) {
			return null;
		}

		return {
			sourceId: toAppSourceId(connection._id),
			provider: "posthog" as const,
			status: connection.status,
			displayName: connection.displayName,
			baseUrl: connection.baseUrl,
			projectId: connection.projectId,
			projectName: connection.projectName,
		};
	},
});

export const getNotion = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.union(notionConnectionSettingsValidator, v.null()),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const connection = await getOwnedNotionConnection(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);

		if (!connection) {
			return null;
		}

		return {
			sourceId: toAppSourceId(connection._id),
			provider: "notion" as const,
			status: connection.status,
			displayName: connection.displayName,
		};
	},
});

export const getOwnedJiraConnectionInternal = internalQuery({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: jiraWebhookConnectionValidator,
	handler: async (ctx, args) => {
		const connection = await getOwnedJiraConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);

		if (!connection?.baseUrl || !connection.email || !connection.token) {
			return null;
		}

		return {
			connectionId: connection._id,
			ownerTokenIdentifier: connection.ownerTokenIdentifier,
			workspaceId: connection.workspaceId,
			baseUrl: connection.baseUrl,
			email: connection.email,
			token: connection.token,
			...(connection.accountId ? { accountId: connection.accountId } : {}),
		};
	},
});

export const getJiraWebhookConnection = internalQuery({
	args: {
		sourceId: v.string(),
		webhookSecret: v.string(),
	},
	returns: jiraWebhookConnectionValidator,
	handler: async (ctx, args) => {
		const connectionId = normalizeConnectionId(ctx, args.sourceId);

		if (!connectionId) {
			return null;
		}

		const connection = await ctx.db.get(connectionId);

		if (
			!connection ||
			connection.provider !== "jira" ||
			connection.status !== "connected" ||
			!connection.baseUrl ||
			!connection.email ||
			!connection.token ||
			!connection.webhookSecret ||
			connection.webhookSecret !== args.webhookSecret
		) {
			return null;
		}

		return {
			connectionId: connection._id,
			ownerTokenIdentifier: connection.ownerTokenIdentifier,
			workspaceId: connection.workspaceId,
			baseUrl: connection.baseUrl,
			email: connection.email,
			token: connection.token,
			...(connection.accountId ? { accountId: connection.accountId } : {}),
		};
	},
});

export const getSelectedForChat = query({
	args: {
		workspaceId: v.id("workspaces"),
		sourceIds: v.array(v.string()),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const normalizedIds = args.sourceIds
			.map((sourceId) => normalizeConnectionId(ctx, sourceId))
			.filter(
				(id, index, values): id is Id<"appConnections"> =>
					Boolean(id) && values.indexOf(id) === index,
			);

		if (normalizedIds.length === 0) {
			return [];
		}

		const connections = await Promise.all(
			normalizedIds.map((id) => ctx.db.get(id)),
		);

		return connections
			.map((connection) =>
				toChatToolConnection(
					connection,
					identity.tokenIdentifier,
					args.workspaceId,
				),
			)
			.filter((connection): connection is ChatToolConnection =>
				Boolean(connection),
			);
	},
});

export const getAllForChat = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		const identity = await requireIdentity(ctx);
		await requireOwnedWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		const connections = await ctx.db
			.query("appConnections")
			.withIndex(
				"by_ownerTokenIdentifier_and_workspaceId_and_status_and_updatedAt",
				(q) =>
					q
						.eq("ownerTokenIdentifier", identity.tokenIdentifier)
						.eq("workspaceId", args.workspaceId)
						.eq("status", "connected"),
			)
			.order("desc")
			.take(20);

		return connections
			.map((connection) =>
				toChatToolConnection(
					connection,
					identity.tokenIdentifier,
					args.workspaceId,
				),
			)
			.filter((connection): connection is ChatToolConnection =>
				Boolean(connection),
			);
	},
});

export const getSelectedForChatInternal = internalQuery({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		sourceIds: v.array(v.string()),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		const normalizedIds = args.sourceIds
			.map((sourceId) => normalizeConnectionId(ctx, sourceId))
			.filter(
				(id, index, values): id is Id<"appConnections"> =>
					Boolean(id) && values.indexOf(id) === index,
			);

		if (normalizedIds.length === 0) {
			return [];
		}

		const connections = await Promise.all(
			normalizedIds.map((id) => ctx.db.get(id)),
		);

		return connections
			.map((connection) =>
				toChatToolConnection(
					connection,
					args.ownerTokenIdentifier,
					args.workspaceId,
				),
			)
			.filter((connection): connection is ChatToolConnection =>
				Boolean(connection),
			);
	},
});

export const getAllForChatInternal = internalQuery({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		const connections = await ctx.db
			.query("appConnections")
			.withIndex(
				"by_ownerTokenIdentifier_and_workspaceId_and_status_and_updatedAt",
				(q) =>
					q
						.eq("ownerTokenIdentifier", args.ownerTokenIdentifier)
						.eq("workspaceId", args.workspaceId)
						.eq("status", "connected"),
			)
			.order("desc")
			.take(20);

		return connections
			.map((connection) =>
				toChatToolConnection(
					connection,
					args.ownerTokenIdentifier,
					args.workspaceId,
				),
			)
			.filter((connection): connection is ChatToolConnection =>
				Boolean(connection),
			);
	},
});

export const getYandexCalendarCredentials = internalQuery({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: yandexCalendarCredentialsValidator,
	handler: async (ctx, args) => {
		const connection = await getOwnedYandexCalendarConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
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

const deleteConnectionBatchForOwner = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
) => {
	const connections = await ctx.db
		.query("appConnections")
		.withIndex("by_ownerTokenIdentifier_and_updatedAt", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
		)
		.take(REMOVE_ALL_APP_CONNECTIONS_BATCH_SIZE);

	await Promise.all(
		connections.map(async (connection) => {
			await deleteConnectionActivity(ctx, connection._id);
			await ctx.db.delete(connection._id);
		}),
	);

	return {
		deletedCount: connections.length,
		hasMore: connections.length === REMOVE_ALL_APP_CONNECTIONS_BATCH_SIZE,
	};
};

const deleteConnectionBatchForWorkspace = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => {
	const connections = await ctx.db
		.query("appConnections")
		.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_updatedAt", (q) =>
			q
				.eq("ownerTokenIdentifier", ownerTokenIdentifier)
				.eq("workspaceId", workspaceId),
		)
		.take(REMOVE_ALL_APP_CONNECTIONS_BATCH_SIZE);

	await Promise.all(
		connections.map(async (connection) => {
			await deleteConnectionActivity(ctx, connection._id);
			await ctx.db.delete(connection._id);
		}),
	);

	return {
		deletedCount: connections.length,
		hasMore: connections.length === REMOVE_ALL_APP_CONNECTIONS_BATCH_SIZE,
	};
};

export const upsertYandexTracker = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		orgType: yandexTrackerOrgTypeValidator,
		orgId: v.string(),
		token: v.string(),
	},
	returns: yandexTrackerConnectionSettingsValidator,
	handler: async (ctx, args): Promise<YandexTrackerConnectionSettings> => {
		await requireOwnedWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		const now = Date.now();
		const orgId = args.orgId.trim();
		const token = args.token.trim();
		const existingConnection = await getOwnedYandexTrackerConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
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
			workspaceId: args.workspaceId,
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
		workspaceId: v.id("workspaces"),
		email: v.string(),
		password: v.string(),
		serverAddress: v.string(),
		calendarHomePath: v.string(),
	},
	returns: yandexCalendarConnectionSettingsValidator,
	handler: async (ctx, args): Promise<YandexCalendarConnectionSettings> => {
		await requireOwnedWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		const now = Date.now();
		const email = args.email.trim().toLowerCase();
		const password = args.password.trim();
		const serverAddress = args.serverAddress.trim();
		const calendarHomePath = args.calendarHomePath.trim();
		const existingConnection = await getOwnedYandexCalendarConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
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
			workspaceId: args.workspaceId,
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

export const ensureJiraSyncMetadata = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		accountId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOwnedWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		const connection = await getOwnedJiraConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);

		if (!connection) {
			return null;
		}

		const patch: Partial<Doc<"appConnections">> = {};

		if (!connection.webhookSecret) {
			patch.webhookSecret = generateWebhookSecret();
		}

		if (args.accountId && connection.accountId !== args.accountId) {
			patch.accountId = args.accountId;
		}

		if (Object.keys(patch).length > 0) {
			patch.updatedAt = Date.now();
			await ctx.db.patch(connection._id, patch);
		}

		return null;
	},
});

export const recordJiraWebhookActivity = internalMutation({
	args: {
		connectionId: v.id("appConnections"),
		lastWebhookReceivedAt: v.number(),
		lastMentionSyncAt: v.optional(v.number()),
		accountId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);

		if (!connection || connection.provider !== "jira") {
			return null;
		}

		await upsertConnectionActivity(ctx, connection, {
			lastWebhookReceivedAt: args.lastWebhookReceivedAt,
			...(args.lastMentionSyncAt
				? { lastMentionSyncAt: args.lastMentionSyncAt }
				: {}),
		});

		if (args.accountId && connection.accountId !== args.accountId) {
			await ctx.db.patch(connection._id, {
				accountId: args.accountId,
				updatedAt: Date.now(),
			});
		}

		return null;
	},
});

export const upsertJira = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		baseUrl: v.string(),
		email: v.string(),
		token: v.string(),
		accountId: v.optional(v.string()),
	},
	returns: jiraConnectionSettingsValidator,
	handler: async (ctx, args): Promise<JiraConnectionSettings> => {
		await requireOwnedWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		const now = Date.now();
		const baseUrl = args.baseUrl.trim();
		const email = args.email.trim().toLowerCase();
		const token = args.token.trim();
		const accountId = args.accountId?.trim() || undefined;
		const existingConnection = await getOwnedJiraConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);

		if (existingConnection) {
			const webhookSecret =
				existingConnection.webhookSecret ?? generateWebhookSecret();
			const activity = await getConnectionActivitySnapshot(
				ctx,
				existingConnection._id,
			);
			const patch: Partial<Doc<"appConnections">> = {
				status: "connected",
				displayName: "Jira",
				baseUrl,
				email,
				token,
				webhookSecret,
				updatedAt: now,
			};

			if (accountId) {
				patch.accountId = accountId;
			}

			await ctx.db.patch(existingConnection._id, patch);

			return {
				sourceId: toAppSourceId(existingConnection._id),
				provider: "jira" as const,
				status: "connected" as const,
				displayName: "Jira",
				baseUrl,
				email,
				webhookSecret,
				...(activity.lastWebhookReceivedAt
					? { lastWebhookReceivedAt: activity.lastWebhookReceivedAt }
					: {}),
				...(activity.lastMentionSyncAt
					? { lastMentionSyncAt: activity.lastMentionSyncAt }
					: {}),
				...(accountId ? { accountId } : {}),
			};
		}

		const webhookSecret = generateWebhookSecret();
		const id = await ctx.db.insert("appConnections", {
			ownerTokenIdentifier: args.ownerTokenIdentifier,
			workspaceId: args.workspaceId,
			provider: "jira",
			status: "connected",
			displayName: "Jira",
			baseUrl,
			email,
			token,
			webhookSecret,
			...(accountId ? { accountId } : {}),
			createdAt: now,
			updatedAt: now,
		});

		return {
			sourceId: toAppSourceId(id),
			provider: "jira" as const,
			status: "connected" as const,
			displayName: "Jira",
			baseUrl,
			email,
			webhookSecret,
			...(accountId ? { accountId } : {}),
		};
	},
});

export const upsertPostHog = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		baseUrl: v.string(),
		projectId: v.string(),
		projectName: v.string(),
		token: v.string(),
	},
	returns: posthogConnectionSettingsValidator,
	handler: async (ctx, args): Promise<PostHogConnectionSettings> => {
		await requireOwnedWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		const now = Date.now();
		const baseUrl = args.baseUrl.trim();
		const projectId = args.projectId.trim();
		const projectName = args.projectName.trim() || `Project ${projectId}`;
		const token = args.token.trim();
		const displayName = projectName;
		const existingConnection = await getOwnedPostHogConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);

		if (existingConnection) {
			await ctx.db.patch(existingConnection._id, {
				status: "connected",
				displayName,
				baseUrl,
				projectId,
				projectName,
				token,
				updatedAt: now,
			});

			return {
				sourceId: toAppSourceId(existingConnection._id),
				provider: "posthog" as const,
				status: "connected" as const,
				displayName,
				baseUrl,
				projectId,
				projectName,
			};
		}

		const id = await ctx.db.insert("appConnections", {
			ownerTokenIdentifier: args.ownerTokenIdentifier,
			workspaceId: args.workspaceId,
			provider: "posthog",
			status: "connected",
			displayName,
			baseUrl,
			projectId,
			projectName,
			token,
			createdAt: now,
			updatedAt: now,
		});

		return {
			sourceId: toAppSourceId(id),
			provider: "posthog" as const,
			status: "connected" as const,
			displayName,
			baseUrl,
			projectId,
			projectName,
		};
	},
});

export const upsertNotion = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		displayName: v.string(),
		token: v.string(),
		email: v.optional(v.string()),
	},
	returns: notionConnectionSettingsValidator,
	handler: async (ctx, args): Promise<NotionConnectionSettings> => {
		await requireOwnedWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		const now = Date.now();
		const displayName = args.displayName.trim() || "Notion";
		const token = args.token.trim();
		const email = args.email?.trim().toLowerCase() || undefined;
		const existingConnection = await getOwnedNotionConnection(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);

		if (existingConnection) {
			await ctx.db.patch(existingConnection._id, {
				status: "connected",
				displayName,
				token,
				...(email ? { email } : {}),
				updatedAt: now,
			});

			return {
				sourceId: toAppSourceId(existingConnection._id),
				provider: "notion" as const,
				status: "connected" as const,
				displayName,
			};
		}

		const id = await ctx.db.insert("appConnections", {
			ownerTokenIdentifier: args.ownerTokenIdentifier,
			workspaceId: args.workspaceId,
			provider: "notion",
			status: "connected",
			displayName,
			token,
			...(email ? { email } : {}),
			createdAt: now,
			updatedAt: now,
		});

		return {
			sourceId: toAppSourceId(id),
			provider: "notion" as const,
			status: "connected" as const,
			displayName,
		};
	},
});

export const removeAllForWorkspace = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await deleteConnectionBatchForWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(
				0,
				internal.appConnections.removeAllForWorkspace,
				{
					ownerTokenIdentifier: args.ownerTokenIdentifier,
					workspaceId: args.workspaceId,
				},
			);
		}

		return null;
	},
});

export const removeAllForOwner = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await deleteConnectionBatchForOwner(
			ctx,
			args.ownerTokenIdentifier,
		);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(
				0,
				internal.appConnections.removeAllForOwner,
				{
					ownerTokenIdentifier: args.ownerTokenIdentifier,
				},
			);
		}

		return null;
	},
});
