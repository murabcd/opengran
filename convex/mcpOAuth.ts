import { validateRemoteMcpConnection } from "../packages/ai/src/remote-mcp-tools.mjs";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

type McpOAuthProvider = "notion" | "posthog";

type ProviderConfig = {
	displayName: string;
};

const PROVIDER_CONFIG: Record<McpOAuthProvider, ProviderConfig> = {
	notion: { displayName: "Notion" },
	posthog: { displayName: "PostHog" },
};

const jsonResponse = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

const htmlResponse = (title: string, message: string, status = 200) =>
	new Response(
		`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:40px;line-height:1.5;color:#111}main{max-width:560px}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`,
		{
			status,
			headers: { "Content-Type": "text/html; charset=utf-8" },
		},
	);

const getConvexSiteUrl = () => process.env.CONVEX_SITE_URL?.trim() ?? "";

const getRedirectUri = (provider: McpOAuthProvider) =>
	`${getConvexSiteUrl()}/api/oauth/${provider}/callback`;

type McpTokenResponse = {
	access_token?: unknown;
	refresh_token?: unknown;
	expires_in?: unknown;
};

const exchangeMcpOAuthCode = async ({
	clientId,
	clientSecret,
	code,
	codeVerifier,
	redirectUri,
	tokenEndpoint,
	displayName,
}: {
	clientId: string;
	clientSecret?: string;
	code: string;
	codeVerifier: string;
	redirectUri: string;
	tokenEndpoint: string;
	displayName: string;
}) => {
	const params = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		client_id: clientId,
		redirect_uri: redirectUri,
		code_verifier: codeVerifier,
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
			`${displayName} OAuth token exchange failed (${response.status}).${responseText ? ` ${responseText}` : ""}`,
		);
	}

	const tokenResponse = (await response.json()) as McpTokenResponse;

	if (typeof tokenResponse.access_token !== "string") {
		throw new Error(
			`${displayName} OAuth token exchange did not return an access token.`,
		);
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

export const handleMcpOAuthCallbackRequest = async (
	ctx: ActionCtx,
	request: Request,
	provider: McpOAuthProvider,
) => {
	const { displayName } = PROVIDER_CONFIG[provider];
	const url = new URL(request.url);
	const code = url.searchParams.get("code")?.trim();
	const state = url.searchParams.get("state")?.trim();
	const error = url.searchParams.get("error")?.trim();
	const errorDescription = url.searchParams.get("error_description")?.trim();

	if (error) {
		return htmlResponse(
			`${displayName} connection failed`,
			errorDescription || error,
			400,
		);
	}

	if (!code || !state) {
		return jsonResponse(
			{ message: `Missing ${displayName} OAuth code or state.` },
			400,
		);
	}

	const pendingState = await ctx.runMutation(
		internal.appConnections.consumeMcpOAuthState,
		{ provider, state },
	);

	if (!pendingState || pendingState.expiresAt < Date.now()) {
		return htmlResponse(
			`${displayName} connection expired`,
			`Start the ${displayName} connection again.`,
			400,
		);
	}

	const redirectUri = getRedirectUri(provider);
	if (!redirectUri.startsWith("http")) {
		return htmlResponse(
			`${displayName} connection failed`,
			"CONVEX_SITE_URL is not configured.",
			500,
		);
	}

	if (!pendingState.oauthTokenEndpoint || !pendingState.codeVerifier) {
		return htmlResponse(
			`${displayName} connection failed`,
			`${displayName} OAuth state is incomplete.`,
			500,
		);
	}

	try {
		const tokens = await exchangeMcpOAuthCode({
			clientId: pendingState.oauthClientId,
			...(pendingState.oauthClientSecret
				? { clientSecret: pendingState.oauthClientSecret }
				: {}),
			code,
			codeVerifier: pendingState.codeVerifier,
			redirectUri,
			tokenEndpoint: pendingState.oauthTokenEndpoint,
			displayName,
		});
		const env = pendingState.envJson
			? (JSON.parse(pendingState.envJson) as Record<string, string>)
			: undefined;

		await validateRemoteMcpConnection({
			provider,
			displayName,
			baseUrl: pendingState.baseUrl,
			...(env ? { env } : {}),
			oauthClientId: pendingState.oauthClientId,
			oauthAccessToken: tokens.accessToken,
		});

		const mutation =
			provider === "posthog"
				? internal.appConnections.upsertPostHog
				: internal.appConnections.upsertNotion;

		await ctx.runMutation(mutation, {
			ownerTokenIdentifier: pendingState.ownerTokenIdentifier,
			workspaceId: pendingState.workspaceId,
			displayName: pendingState.displayName,
			baseUrl: pendingState.baseUrl,
			...(env ? { env } : {}),
			oauthClientId: pendingState.oauthClientId,
			...(pendingState.oauthClientSecret
				? { oauthClientSecret: pendingState.oauthClientSecret }
				: {}),
			oauthAccessToken: tokens.accessToken,
			...(tokens.refreshToken ? { oauthRefreshToken: tokens.refreshToken } : {}),
			...(tokens.expiresIn
				? { tokenExpiresAt: Date.now() + tokens.expiresIn * 1000 }
				: {}),
		});
	} catch (connectionError) {
		console.error(`Failed to complete ${displayName} OAuth connection`, connectionError);
		return htmlResponse(
			`${displayName} connection failed`,
			`OpenGran could not complete the ${displayName} connection.`,
			500,
		);
	}

	return htmlResponse(
		`${displayName} connected`,
		"You can close this window and return to OpenGran.",
	);
};
