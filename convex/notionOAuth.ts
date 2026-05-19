import { validateNotionMcpConnection } from "../packages/ai/src/notion-tools.mjs";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

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

const getRedirectUri = () => `${getConvexSiteUrl()}/api/oauth/notion/callback`;

type NotionTokenResponse = {
	access_token?: unknown;
	refresh_token?: unknown;
	expires_in?: unknown;
};

const exchangeNotionOAuthCode = async ({
	clientId,
	clientSecret,
	code,
	codeVerifier,
	redirectUri,
	tokenEndpoint,
}: {
	clientId: string;
	clientSecret?: string;
	code: string;
	codeVerifier: string;
	redirectUri: string;
	tokenEndpoint: string;
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
			`Notion OAuth token exchange failed (${response.status}).${responseText ? ` ${responseText}` : ""}`,
		);
	}

	const tokenResponse = (await response.json()) as NotionTokenResponse;

	if (typeof tokenResponse.access_token !== "string") {
		throw new Error("Notion OAuth token exchange did not return an access token.");
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

export const handleNotionOAuthCallbackRequest = async (
	ctx: ActionCtx,
	request: Request,
) => {
	const url = new URL(request.url);
	const code = url.searchParams.get("code")?.trim();
	const state = url.searchParams.get("state")?.trim();
	const error = url.searchParams.get("error")?.trim();
	const errorDescription = url.searchParams.get("error_description")?.trim();

	if (error) {
		return htmlResponse(
			"Notion connection failed",
			errorDescription || error,
			400,
		);
	}

	if (!code || !state) {
		return jsonResponse({ message: "Missing Notion OAuth code or state." }, 400);
	}

	const pendingState = await ctx.runMutation(
		internal.appConnections.consumeNotionOAuthState,
		{ state },
	);

	if (!pendingState || pendingState.expiresAt < Date.now()) {
		return htmlResponse(
			"Notion connection expired",
			"Start the Notion connection again.",
			400,
		);
	}

	const redirectUri = getRedirectUri();
	if (!redirectUri.startsWith("http")) {
		return htmlResponse(
			"Notion connection failed",
			"CONVEX_SITE_URL is not configured.",
			500,
		);
	}

	try {
		const tokens = await exchangeNotionOAuthCode({
			clientId: pendingState.oauthClientId,
			...(pendingState.oauthClientSecret
				? { clientSecret: pendingState.oauthClientSecret }
				: {}),
			code,
			codeVerifier: pendingState.codeVerifier,
			redirectUri,
			tokenEndpoint: pendingState.oauthTokenEndpoint,
		});
		const env = pendingState.envJson
			? (JSON.parse(pendingState.envJson) as Record<string, string>)
			: undefined;

		await validateNotionMcpConnection({
			baseUrl: pendingState.baseUrl,
			...(env ? { env } : {}),
			oauthClientId: pendingState.oauthClientId,
			oauthAccessToken: tokens.accessToken,
		});

		await ctx.runMutation(internal.appConnections.upsertNotion, {
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
		console.error("Failed to complete Notion OAuth connection", connectionError);
		return htmlResponse(
			"Notion connection failed",
			"OpenGran could not complete the Notion connection.",
			500,
		);
	}

	return htmlResponse("Notion connected", "You can close this window and return to OpenGran.");
};
