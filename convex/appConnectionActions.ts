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

const jiraConnectionResultValidator = v.object({
	sourceId: v.string(),
	provider: v.literal("jira"),
	status: v.union(v.literal("connected"), v.literal("disconnected")),
	displayName: v.string(),
	baseUrl: v.string(),
	email: v.string(),
	accountId: v.optional(v.string()),
	webhookSecret: v.optional(v.string()),
	lastWebhookReceivedAt: v.optional(v.number()),
	lastMentionSyncAt: v.optional(v.number()),
});

const posthogConnectionResultValidator = v.object({
	sourceId: v.string(),
	provider: v.literal("posthog"),
	status: v.union(v.literal("connected"), v.literal("disconnected")),
	displayName: v.string(),
	baseUrl: v.string(),
	projectId: v.string(),
	projectName: v.string(),
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

type JiraConnectionResult = {
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

type PostHogConnectionResult = {
	sourceId: string;
	provider: "posthog";
	status: "connected" | "disconnected";
	displayName: string;
	baseUrl: string;
	projectId: string;
	projectName: string;
};

type JiraCurrentUserResponse = {
	accountId?: unknown;
};

type PostHogProjectResponse = {
	id?: unknown;
	name?: unknown;
};

const TRACKER_API_BASE_URL =
	process.env.TRACKER_API_BASE_URL ?? "https://api.tracker.yandex.net";

const normalizeJiraBaseUrl = (value: string) => {
	const trimmedValue = value.trim();

	let url: URL;

	try {
		url = new URL(trimmedValue);
	} catch {
		throw new ConvexError({
			code: "INVALID_CONNECTION_DETAILS",
			message: "Jira base URL must be a valid URL.",
		});
	}

	url.pathname = url.pathname.replace(/\/+$/, "");
	url.search = "";
	url.hash = "";

	return url.toString().replace(/\/$/, "");
};

const normalizePostHogBaseUrl = (value: string) => {
	const trimmedValue = value.trim();

	let url: URL;

	try {
		url = new URL(trimmedValue);
	} catch {
		throw new ConvexError({
			code: "INVALID_CONNECTION_DETAILS",
			message: "PostHog URL must be a valid URL.",
		});
	}

	url.pathname = url.pathname.replace(/\/+$/, "");
	url.search = "";
	url.hash = "";

	return url.toString().replace(/\/$/, "");
};

const getJiraAuthHeader = (email: string, token: string) =>
	`Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

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
		workspaceId: v.id("workspaces"),
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
			workspaceId: args.workspaceId,
			orgType: args.orgType,
			orgId,
			token,
		});
	},
});

export const connectYandexCalendar = action({
	args: {
		workspaceId: v.id("workspaces"),
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
					workspaceId: args.workspaceId,
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

export const connectJira = action({
	args: {
		workspaceId: v.id("workspaces"),
		baseUrl: v.string(),
		email: v.string(),
		token: v.string(),
	},
	returns: jiraConnectionResultValidator,
	handler: async (ctx, args): Promise<JiraConnectionResult> => {
		const identity = await requireIdentity(ctx);
		const baseUrl = normalizeJiraBaseUrl(args.baseUrl);
		const email = args.email.trim().toLowerCase();
		const token = args.token.trim();

		if (!email || !token) {
			throw new ConvexError({
				code: "INVALID_CONNECTION_DETAILS",
				message: "Jira email and API token are required.",
			});
		}

		const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
			headers: {
				Authorization: getJiraAuthHeader(email, token),
				Accept: "application/json",
			},
		});

		if (!response.ok) {
			const responseText = await response.text().catch(() => "");
			throw new ConvexError({
				code: "JIRA_CONNECTION_FAILED",
				message: responseText.trim()
					? `Failed to connect Jira: ${responseText.trim()}`
					: `Failed to connect Jira (${response.status}).`,
			});
		}

		const currentUser = (await response
			.json()
			.catch(() => null)) as JiraCurrentUserResponse | null;
		const accountId =
			currentUser && typeof currentUser.accountId === "string"
				? currentUser.accountId
				: undefined;

		return await ctx.runMutation(internal.appConnections.upsertJira, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
			baseUrl,
			email,
			token,
			...(accountId ? { accountId } : {}),
		});
	},
});

export const connectPostHog = action({
	args: {
		workspaceId: v.id("workspaces"),
		baseUrl: v.string(),
		projectId: v.string(),
		token: v.string(),
	},
	returns: posthogConnectionResultValidator,
	handler: async (ctx, args): Promise<PostHogConnectionResult> => {
		const identity = await requireIdentity(ctx);
		const baseUrl = normalizePostHogBaseUrl(args.baseUrl);
		const projectId = args.projectId.trim();
		const token = args.token.trim();

		if (!projectId || !token) {
			throw new ConvexError({
				code: "INVALID_CONNECTION_DETAILS",
				message: "PostHog project ID and personal API key are required.",
			});
		}

		const response = await fetch(
			`${baseUrl}/api/projects/${encodeURIComponent(projectId)}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: "application/json",
				},
			},
		);

		if (!response.ok) {
			const responseText = await response.text().catch(() => "");
			throw new ConvexError({
				code: "POSTHOG_CONNECTION_FAILED",
				message: responseText.trim()
					? `Failed to connect PostHog: ${responseText.trim()}`
					: `Failed to connect PostHog (${response.status}).`,
			});
		}

		const project = (await response
			.json()
			.catch(() => null)) as PostHogProjectResponse | null;
		const projectName =
			project && typeof project.name === "string" && project.name.trim()
				? project.name.trim()
				: `Project ${projectId}`;

		return await ctx.runMutation(internal.appConnections.upsertPostHog, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
			baseUrl,
			projectId,
			projectName,
			token,
		});
	},
});

export const prepareJiraMentionSync = action({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const connection = await ctx.runQuery(
			internal.appConnections.getOwnedJiraConnectionInternal,
			{
				ownerTokenIdentifier: identity.tokenIdentifier,
				workspaceId: args.workspaceId,
			},
		);

		if (!connection) {
			return null;
		}

		let accountId = connection.accountId;

		if (!accountId) {
			const response = await fetch(`${connection.baseUrl}/rest/api/3/myself`, {
				headers: {
					Authorization: getJiraAuthHeader(connection.email, connection.token),
					Accept: "application/json",
				},
			});

			if (!response.ok) {
				const responseText = await response.text().catch(() => "");
				throw new ConvexError({
					code: "JIRA_CONNECTION_FAILED",
					message: responseText.trim()
						? `Failed to prepare Jira sync: ${responseText.trim()}`
						: `Failed to prepare Jira sync (${response.status}).`,
				});
			}

			const currentUser = (await response
				.json()
				.catch(() => null)) as JiraCurrentUserResponse | null;
			accountId =
				currentUser && typeof currentUser.accountId === "string"
					? currentUser.accountId
					: undefined;
		}

		await ctx.runMutation(internal.appConnections.ensureJiraSyncMetadata, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
			...(accountId ? { accountId } : {}),
		});

		return null;
	},
});
