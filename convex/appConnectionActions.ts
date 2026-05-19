"use node";

import { createHash, randomBytes } from "node:crypto";
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

const zoomOAuthStartResultValidator = v.object({
	authorizationUrl: v.string(),
});

const notionOAuthStartResultValidator = v.object({
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

type ZoomOAuthStartResult = {
	authorizationUrl: string;
};

type NotionOAuthStartResult = {
	authorizationUrl: string;
};

const ZOOM_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const NOTION_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const getConvexSiteUrl = () => {
	const siteUrl = process.env.CONVEX_SITE_URL?.trim();

	if (!siteUrl) {
		throw new ConvexError({
			code: "OAUTH_NOT_CONFIGURED",
			message: "OAuth redirect URL is not configured.",
		});
	}

	return siteUrl.replace(/\/+$/u, "");
};

const getZoomOAuthRedirectUri = () =>
	`${getConvexSiteUrl()}/api/oauth/zoom/callback`;

const createZoomOAuthState = () => crypto.randomUUID();
const createNotionOAuthState = () => randomBytes(32).toString("hex");

const getNotionOAuthRedirectUri = () =>
	`${getConvexSiteUrl()}/api/oauth/notion/callback`;

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

type OAuthMetadata = {
	authorization_endpoint?: unknown;
	token_endpoint?: unknown;
	registration_endpoint?: unknown;
};

type ProtectedResourceMetadata = {
	authorization_servers?: unknown;
};

type DynamicClientRegistrationResponse = {
	client_id?: unknown;
	client_secret?: unknown;
};

type NotionTokenResponse = {
	access_token?: unknown;
	refresh_token?: unknown;
	expires_in?: unknown;
};

const base64UrlEncode = (value: Buffer) =>
	value
		.toString("base64")
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");

const createPkceVerifier = () => base64UrlEncode(randomBytes(32));

const createPkceChallenge = (verifier: string) =>
	base64UrlEncode(createHash("sha256").update(verifier).digest());

const discoverNotionOAuthMetadata = async (baseUrl: string) => {
	const mcpUrl = new URL(baseUrl);
	const resourceMetadataUrl = new URL(
		"/.well-known/oauth-protected-resource",
		mcpUrl,
	);
	resourceMetadataUrl.searchParams.set("resource", baseUrl);

	const resourceResponse = await fetch(resourceMetadataUrl, {
		headers: { Accept: "application/json" },
	});

	if (!resourceResponse.ok) {
		throw new Error(
			`Notion MCP OAuth resource discovery failed (${resourceResponse.status}).`,
		);
	}

	const protectedResource =
		(await resourceResponse.json()) as ProtectedResourceMetadata;
	const authServerUrl =
		Array.isArray(protectedResource.authorization_servers) &&
		typeof protectedResource.authorization_servers[0] === "string"
			? protectedResource.authorization_servers[0]
			: "";

	if (!authServerUrl) {
		throw new Error("Notion MCP OAuth discovery did not return an auth server.");
	}

	const metadataUrl = new URL(
		"/.well-known/oauth-authorization-server",
		authServerUrl,
	);
	const metadataResponse = await fetch(metadataUrl, {
		headers: { Accept: "application/json" },
	});

	if (!metadataResponse.ok) {
		throw new Error(
			`Notion MCP OAuth metadata discovery failed (${metadataResponse.status}).`,
		);
	}

	const metadata = (await metadataResponse.json()) as OAuthMetadata;

	if (
		typeof metadata.authorization_endpoint !== "string" ||
		typeof metadata.token_endpoint !== "string" ||
		typeof metadata.registration_endpoint !== "string"
	) {
		throw new Error("Notion MCP OAuth metadata is missing required endpoints.");
	}

	return {
		authorizationEndpoint: metadata.authorization_endpoint,
		tokenEndpoint: metadata.token_endpoint,
		registrationEndpoint: metadata.registration_endpoint,
	};
};

const registerNotionOAuthClient = async ({
	registrationEndpoint,
	redirectUri,
}: {
	registrationEndpoint: string;
	redirectUri: string;
}) => {
	const response = await fetch(registrationEndpoint, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_name: "OpenGran",
			redirect_uris: [redirectUri],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
		}),
	});

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		throw new Error(
			`Notion MCP OAuth client registration failed (${response.status}).${responseText ? ` ${responseText}` : ""}`,
		);
	}

	const registration =
		(await response.json()) as DynamicClientRegistrationResponse;

	if (typeof registration.client_id !== "string") {
		throw new Error(
			"Notion MCP OAuth client registration did not return a client ID.",
		);
	}

	return {
		clientId: registration.client_id,
		clientSecret:
			typeof registration.client_secret === "string"
				? registration.client_secret
				: undefined,
	};
};

const refreshNotionOAuthToken = async ({
	baseUrl,
	clientId,
	clientSecret,
	refreshToken,
}: {
	baseUrl: string;
	clientId: string;
	clientSecret?: string;
	refreshToken: string;
}) => {
	const { tokenEndpoint } = await discoverNotionOAuthMetadata(baseUrl);
	const params = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		client_id: clientId,
	});

	if (clientSecret) {
		params.set("client_secret", clientSecret);
	}

	const response = await fetch(tokenEndpoint, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
			"User-Agent": "OpenGran-MCP-Client/1.0",
		},
		body: params.toString(),
	});

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		throw new Error(
			`Notion MCP OAuth refresh failed (${response.status}).${responseText ? ` ${responseText}` : ""}`,
		);
	}

	const tokenResponse = (await response.json()) as NotionTokenResponse;

	if (typeof tokenResponse.access_token !== "string") {
		throw new Error("Notion MCP OAuth refresh did not return an access token.");
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

const refreshNotionTokensForWorkspace = async (
	ctx: ActionCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => {
	const refreshSkewMs = 2 * 60 * 1000;
	const connections = await ctx.runQuery(
		internal.appConnections.getNotionOAuthConnectionsForWorkspace,
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
				const tokens = await refreshNotionOAuthToken({
					baseUrl: connection.baseUrl,
					clientId: connection.oauthClientId,
					...(connection.oauthClientSecret
						? { clientSecret: connection.oauthClientSecret }
						: {}),
					refreshToken: connection.oauthRefreshToken,
				});

				await ctx.runMutation(internal.appConnections.updateNotionOAuthTokens, {
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

const normalizeNotionMcpEndpoint = (value: string) => {
	const trimmedValue = value.trim();

	if (!trimmedValue) {
		throw new ConvexError({
			code: "NOTION_MCP_ENDPOINT_REQUIRED",
			message: "Notion MCP endpoint is required.",
		});
	}

	let url: URL;

	try {
		url = new URL(trimmedValue);
	} catch {
		throw new ConvexError({
			code: "NOTION_MCP_ENDPOINT_INVALID",
			message: "Notion MCP endpoint must be a valid URL.",
		});
	}

	if (url.protocol !== "https:") {
		throw new ConvexError({
			code: "NOTION_MCP_ENDPOINT_INVALID",
			message: "Notion MCP endpoint must use HTTPS.",
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
		displayName: v.string(),
		baseUrl: v.string(),
		env: v.optional(v.record(v.string(), v.string())),
	},
	returns: notionOAuthStartResultValidator,
	handler: async (ctx, args): Promise<NotionOAuthStartResult> => {
		const identity = await requireIdentity(ctx);
		const redirectUri = getNotionOAuthRedirectUri();
		const baseUrl = normalizeNotionMcpEndpoint(args.baseUrl);
		const displayName = args.displayName.trim() || "Notion";
		const env = Object.fromEntries(
			Object.entries(args.env ?? {}).filter(
				([key, value]) => key.trim().length > 0 && value.length > 0,
			),
		);

		if (!redirectUri.startsWith("http")) {
			throw new ConvexError({
				code: "NOTION_OAUTH_NOT_CONFIGURED",
				message: "Notion OAuth is not configured.",
			});
		}

		let metadata: Awaited<ReturnType<typeof discoverNotionOAuthMetadata>>;
		let client: Awaited<ReturnType<typeof registerNotionOAuthClient>>;
		try {
			metadata = await discoverNotionOAuthMetadata(baseUrl);
			client = await registerNotionOAuthClient({
				registrationEndpoint: metadata.registrationEndpoint,
				redirectUri,
			});
		} catch (error) {
			console.error("Failed to prepare Notion MCP OAuth connection", error);
			throw new ConvexError({
				code: "NOTION_OAUTH_NOT_CONFIGURED",
				message: "Failed to start Notion OAuth.",
			});
		}

		const codeVerifier = createPkceVerifier();
		const codeChallenge = createPkceChallenge(codeVerifier);
		const state = createNotionOAuthState();

		await ctx.runMutation(internal.appConnections.createNotionOAuthState, {
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId: args.workspaceId,
			displayName,
			baseUrl,
			...(Object.keys(env).length > 0 ? { env } : {}),
			oauthClientId: client.clientId,
			...(client.clientSecret
				? { oauthClientSecret: client.clientSecret }
				: {}),
			oauthTokenEndpoint: metadata.tokenEndpoint,
			codeVerifier,
			state,
			expiresAt: Date.now() + NOTION_OAUTH_STATE_TTL_MS,
		});

		const authorizationUrl = new URL(metadata.authorizationEndpoint);
		authorizationUrl.searchParams.set("response_type", "code");
		authorizationUrl.searchParams.set("client_id", client.clientId);
		authorizationUrl.searchParams.set("redirect_uri", redirectUri);
		authorizationUrl.searchParams.set("state", state);
		authorizationUrl.searchParams.set("code_challenge", codeChallenge);
		authorizationUrl.searchParams.set("code_challenge_method", "S256");
		authorizationUrl.searchParams.set("prompt", "consent");

		return { authorizationUrl: authorizationUrl.toString() };
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
		await Promise.all([
			refreshNotionTokensForWorkspace(
				ctx,
				identity.tokenIdentifier,
				args.workspaceId,
			),
			refreshZoomTokensForWorkspace(
				ctx,
				identity.tokenIdentifier,
				args.workspaceId,
			),
		]);
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
		await Promise.all([
			refreshNotionTokensForWorkspace(
				ctx,
				identity.tokenIdentifier,
				args.workspaceId,
			),
			refreshZoomTokensForWorkspace(
				ctx,
				identity.tokenIdentifier,
				args.workspaceId,
			),
		]);
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
