import { authClient } from "@/lib/auth-client";

const TOKEN_EXPIRATION_TOLERANCE_MS = 60 * 1000;

let cachedToken: string | null = null;
let cachedTokenExpiresAt: number | null = null;
let pendingTokenPromise: Promise<string | null> | null = null;
let tokenCacheGeneration = 0;

const decodeJwtExpiration = (token: string) => {
	try {
		const [, payload] = token.split(".");

		if (!payload) {
			return null;
		}

		const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
		const paddedPayload = normalizedPayload.padEnd(
			Math.ceil(normalizedPayload.length / 4) * 4,
			"=",
		);
		const decodedPayload = JSON.parse(atob(paddedPayload)) as {
			exp?: unknown;
		};

		return typeof decodedPayload.exp === "number"
			? decodedPayload.exp * 1000
			: null;
	} catch {
		return null;
	}
};

const setCachedConvexToken = (
	token: string | null,
	generation = tokenCacheGeneration,
) => {
	if (generation !== tokenCacheGeneration) {
		return token;
	}

	cachedToken = token;
	cachedTokenExpiresAt = token ? decodeJwtExpiration(token) : null;
	return token;
};

const hasFreshCachedConvexToken = () =>
	Boolean(
		cachedToken &&
			cachedTokenExpiresAt &&
			Date.now() + TOKEN_EXPIRATION_TOLERANCE_MS < cachedTokenExpiresAt,
	);

export const clearCachedConvexToken = () => {
	tokenCacheGeneration += 1;
	cachedToken = null;
	cachedTokenExpiresAt = null;
	pendingTokenPromise = null;
};

export const getCachedConvexToken = async ({
	forceRefresh = false,
}: {
	forceRefresh?: boolean;
} = {}) => {
	if (!forceRefresh && hasFreshCachedConvexToken()) {
		return cachedToken;
	}

	if (!forceRefresh && pendingTokenPromise) {
		return pendingTokenPromise;
	}

	const requestGeneration = tokenCacheGeneration;
	const tokenRequest = authClient.convex
		.token({
			fetchOptions: { throw: false },
		})
		.then(({ data }) =>
			setCachedConvexToken(data?.token ?? null, requestGeneration),
		)
		.catch((error) => {
			setCachedConvexToken(null, requestGeneration);
			throw error;
		});
	const trackedTokenRequest = tokenRequest.finally(() => {
		if (pendingTokenPromise === trackedTokenRequest) {
			pendingTokenPromise = null;
		}
	});

	pendingTokenPromise = trackedTokenRequest;
	return trackedTokenRequest;
};

export const prefetchConvexToken = () =>
	getCachedConvexToken().then(
		() => undefined,
		() => undefined,
	);
