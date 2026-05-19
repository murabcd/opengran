"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import {
	chatToolConnectionValidator,
	type ChatToolConnection,
} from "./appConnections";
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

const notionConnectionResultValidator = v.object({
	sourceId: v.string(),
	provider: v.literal("notion"),
	status: v.union(v.literal("connected"), v.literal("disconnected")),
	displayName: v.string(),
});

const zoomOAuthStartResultValidator = v.object({
	authorizationUrl: v.string(),
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

type NotionConnectionResult = {
	sourceId: string;
	provider: "notion";
	status: "connected" | "disconnected";
	displayName: string;
};

type ZoomOAuthStartResult = {
	authorizationUrl: string;
};

const ZOOM_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const getConvexSiteUrl = () => {
	const siteUrl = process.env.CONVEX_SITE_URL?.trim();

	if (!siteUrl) {
		throw new ConvexError({
			code: "ZOOM_OAUTH_NOT_CONFIGURED",
			message: "Zoom OAuth is not configured.",
		});
	}

	return siteUrl.replace(/\/+$/u, "");
};

const getZoomOAuthRedirectUri = () =>
	`${getConvexSiteUrl()}/api/oauth/zoom/callback`;

const createZoomOAuthState = () => crypto.randomUUID();

const getZoomOAuthConfig = (overrides: {
	oauthClientId?: string;
	oauthClientSecret?: string;
}) => {
	const oauthClientId =
		overrides.oauthClientId?.trim() ||
		process.env.ZOOM_OAUTH_CLIENT_ID?.trim();
	const oauthClientSecret =
		overrides.oauthClientSecret?.trim() ||
		process.env.ZOOM_OAUTH_CLIENT_SECRET?.trim();

	if (!oauthClientId || !oauthClientSecret) {
		throw new ConvexError({
			code: "ZOOM_OAUTH_NOT_CONFIGURED",
			message: "Zoom OAuth is not configured.",
		});
	}

	return { oauthClientId, oauthClientSecret };
};

type ZoomRefreshResponse = {
	access_token?: unknown;
	refresh_token?: unknown;
	expires_in?: unknown;
};

const refreshZoomOAuthToken = async ({
	clientId,
	clientSecret,
	refreshToken,
}: {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
}) => {
	const tokenUrl = new URL("https://zoom.us/oauth/token");
	tokenUrl.searchParams.set("grant_type", "refresh_token");
	tokenUrl.searchParams.set("refresh_token", refreshToken);

	const response = await fetch(tokenUrl, {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
		},
	});

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		throw new Error(
			`Zoom OAuth refresh failed (${response.status}).${responseText ? ` ${responseText}` : ""}`,
		);
	}

	const tokenResponse = (await response.json()) as ZoomRefreshResponse;

	if (typeof tokenResponse.access_token !== "string") {
		throw new Error("Zoom OAuth refresh did not return an access token.");
	}

	return {
		accessToken: tokenResponse.access_token,
		refreshToken:
			typeof tokenResponse.refresh_token === "string"
				? tokenResponse.refresh_token
				: undefined,
		expiresIn:
			typeof tokenResponse.expires_in === "number"
				? tokenResponse.expires_in
				: undefined,
	};
};

const refreshZoomTokensForWorkspace = async (
	ctx: ActionCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => {
	const refreshSkewMs = 2 * 60 * 1000;
	const connections = await ctx.runQuery(
		internal.appConnections.getZoomOAuthConnectionsForWorkspace,
		{ ownerTokenIdentifier, workspaceId },
	);

	await Promise.all(
		connections
			.filter(
				(connection) =>
					!connection.tokenExpiresAt ||
					connection.tokenExpiresAt <= Date.now() + refreshSkewMs,
			)
			.map(async (connection) => {
				const tokens = await refreshZoomOAuthToken({
					clientId: connection.oauthClientId,
					clientSecret: connection.oauthClientSecret,
					refreshToken: connection.oauthRefreshToken,
				});

				await ctx.runMutation(internal.appConnections.updateZoomOAuthTokens, {
					connectionId: connection.connectionId,
					ownerTokenIdentifier: connection.ownerTokenIdentifier,
					workspaceId: connection.workspaceId,
					oauthAccessToken: tokens.accessToken,
					...(tokens.refreshToken
						? { oauthRefreshToken: tokens.refreshToken }
						: {}),
					...(tokens.expiresIn
						? { tokenExpiresAt: Date.now() + tokens.expiresIn * 1000 }
						: {}),
				});
			}),
	);
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
const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";

type NotionSelfResponse = {
	name?: unknown;
	type?: unknown;
	person?: {
		email?: unknown;
	} | null;
	bot?: {
		workspace_name?: unknown;
		owner?: {
			type?: unknown;
			user?: {
				person?: {
					email?: unknown;
				} | null;
			} | null;
		} | null;
	} | null;
};

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

const normalizeZoomMcpEndpoint = (value: string) => {
	const trimmedValue = value.trim();

	let url: URL;

	try {
		url = new URL(trimmedValue);
	} catch {
		throw new ConvexError({
			code: "INVALID_CONNECTION_DETAILS",
			message: "Zoom MCP endpoint must be a valid URL.",
		});
	}

	if (url.protocol !== "https:") {
		throw new ConvexError({
			code: "INVALID_CONNECTION_DETAILS",
			message: "Zoom MCP endpoint must use HTTPS.",
		});
	}

	url.hash = "";

	return url.toString();
};

const getJiraAuthHeader = (email: string, token: string) =>
	`Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

const getTrackerHeaderName = (
	orgType: "x-org-id" | "x-cloud-org-id",
): "X-Org-Id" | "X-Cloud-Org-Id" =>
	orgType === "x-cloud-org-id" ? "X-Cloud-Org-Id" : "X-Org-Id";

const getNotionHeaders = (token: string, hasBody = false) => ({
	Authorization: `Bearer ${token}`,
	Accept: "application/json",
	"Notion-Version": NOTION_API_VERSION,
	...(hasBody ? { "Content-Type": "application/json" } : {}),
});

const readNotionEmail = (self: NotionSelfResponse | null) => {
	const personEmail =
		self?.person && typeof self.person.email === "string"
			? self.person.email.trim().toLowerCase()
			: "";

	if (personEmail) {
		return personEmail;
	}

	const ownerEmail =
		self?.bot?.owner?.user?.person &&
		typeof self.bot.owner.user.person.email === "string"
			? self.bot.owner.user.person.email.trim().toLowerCase()
			: "";

	return ownerEmail || undefined;
};

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

export const connectNotion = action({
	args: {
		workspaceId: v.id("workspaces"),
		token: v.string(),
	},
	returns: notionConnectionResultValidator,
	handler: async (ctx, args): Promise<NotionConnectionResult> => {
		const identity = await requireIdentity(ctx);
		const token = args.token.trim();

		if (!token) {
			throw new ConvexError({
				code: "INVALID_CONNECTION_DETAILS",
				message: "Notion integration token is required.",
			});
		}

		const [selfResponse, searchResponse] = await Promise.all([
			fetch(`${NOTION_API_BASE_URL}/users/me`, {
				headers: getNotionHeaders(token),
			}),
			fetch(`${NOTION_API_BASE_URL}/search`, {
				method: "POST",
				headers: getNotionHeaders(token, true),
				body: JSON.stringify({
					query: "",
					page_size: 1,
				}),
			}),
		]);

		if (!selfResponse.ok) {
			const responseText = await selfResponse.text().catch(() => "");
			throw new ConvexError({
				code: "NOTION_CONNECTION_FAILED",
				message: responseText.trim()
					? `Failed to connect Notion: ${responseText.trim()}`
					: `Failed to connect Notion (${selfResponse.status}).`,
			});
		}

		if (!searchResponse.ok) {
			const responseText = await searchResponse.text().catch(() => "");
			throw new ConvexError({
				code: "NOTION_CONNECTION_FAILED",
				message: responseText.trim()
					? `Failed to access Notion content: ${responseText.trim()}`
					: `Failed to access Notion content (${searchResponse.status}).`,
			});
		}

		const self = (await selfResponse
			.json()
			.catch(() => null)) as NotionSelfResponse | null;
		const workspaceName =
			self?.bot && typeof self.bot.workspace_name === "string"
				? self.bot.workspace_name.trim()
				: "";
		const integrationName =
			typeof self?.name === "string" ? self.name.trim() : "";
		const displayName = workspaceName || integrationName || "Notion";
		const email = readNotionEmail(self);

		return await ctx.runMutation(internal.appConnections.upsertNotion, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
			displayName,
			token,
			...(email ? { email } : {}),
		});
	},
});

export const connectZoom = action({
	args: {
		workspaceId: v.id("workspaces"),
		displayName: v.string(),
		baseUrl: v.string(),
		env: v.optional(v.record(v.string(), v.string())),
		oauthClientId: v.optional(v.string()),
		oauthClientSecret: v.optional(v.string()),
	},
	returns: zoomOAuthStartResultValidator,
	handler: async (ctx, args): Promise<ZoomOAuthStartResult> => {
		const identity = await requireIdentity(ctx);
		const baseUrl = normalizeZoomMcpEndpoint(args.baseUrl);
		const displayName = args.displayName.trim() || "Zoom";
		const { oauthClientId, oauthClientSecret } = getZoomOAuthConfig({
			oauthClientId: args.oauthClientId,
			oauthClientSecret: args.oauthClientSecret,
		});
		const env = Object.fromEntries(
			Object.entries(args.env ?? {}).filter(
				([key, value]) => key.trim().length > 0 && value.length > 0,
			),
		);

		const state = createZoomOAuthState();
		await ctx.runMutation(internal.appConnections.createZoomOAuthState, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
			displayName,
			baseUrl,
			env,
			oauthClientId,
			oauthClientSecret,
			state,
			expiresAt: Date.now() + ZOOM_OAUTH_STATE_TTL_MS,
		});

		const authorizationUrl = new URL("https://zoom.us/oauth/authorize");
		authorizationUrl.searchParams.set("response_type", "code");
		authorizationUrl.searchParams.set("client_id", oauthClientId);
		authorizationUrl.searchParams.set("redirect_uri", getZoomOAuthRedirectUri());
		authorizationUrl.searchParams.set("state", state);

		return { authorizationUrl: authorizationUrl.toString() };
	},
});

export const getAllForChatWithFreshTokens = action({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		const identity = await requireIdentity(ctx);
		await refreshZoomTokensForWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		return await ctx.runQuery(
			internal.appConnections.getAllForChatInternal,
			{
				ownerTokenIdentifier: identity.tokenIdentifier,
				workspaceId: args.workspaceId,
			},
		);
	},
});

export const getSelectedForChatWithFreshTokens = action({
	args: {
		workspaceId: v.id("workspaces"),
		sourceIds: v.array(v.string()),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		const identity = await requireIdentity(ctx);
		await refreshZoomTokensForWorkspace(
			ctx,
			identity.tokenIdentifier,
			args.workspaceId,
		);
		return await ctx.runQuery(
			internal.appConnections.getSelectedForChatInternal,
			{
				ownerTokenIdentifier: identity.tokenIdentifier,
				workspaceId: args.workspaceId,
				sourceIds: args.sourceIds,
			},
		);
	},
});

export const getAllForChatInternalWithFreshTokens = internalAction({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		await refreshZoomTokensForWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		return await ctx.runQuery(
			internal.appConnections.getAllForChatInternal,
			{
				ownerTokenIdentifier: args.ownerTokenIdentifier,
				workspaceId: args.workspaceId,
			},
		);
	},
});

export const getSelectedForChatInternalWithFreshTokens = internalAction({
	args: {
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		sourceIds: v.array(v.string()),
	},
	returns: v.array(chatToolConnectionValidator),
	handler: async (ctx, args): Promise<ChatToolConnection[]> => {
		await refreshZoomTokensForWorkspace(
			ctx,
			args.ownerTokenIdentifier,
			args.workspaceId,
		);
		return await ctx.runQuery(
			internal.appConnections.getSelectedForChatInternal,
			{
				ownerTokenIdentifier: args.ownerTokenIdentifier,
				workspaceId: args.workspaceId,
				sourceIds: args.sourceIds,
			},
		);
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
