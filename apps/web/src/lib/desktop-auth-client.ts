import * as React from "react";

type DesktopSessionData = {
	user: Record<string, unknown> & {
		email?: string | null;
		image?: string | null;
		name?: string | null;
	};
	session: Record<string, unknown> & {
		token?: string | null;
	};
} | null;

type SessionState = {
	data: DesktopSessionData;
	error: Error | null;
	isPending: boolean;
};

const defaultSessionState: SessionState = {
	data: null,
	error: null,
	isPending: true,
};

const listeners = new Set<() => void>();
let sessionState: SessionState = { ...defaultSessionState };
let pendingSessionRefresh: Promise<SessionRefreshResult> | null = null;

type SessionRefreshResult = {
	data: DesktopSessionData;
	error: {
		message: string;
		status: number;
		statusText: string;
	} | null;
};

type DesktopAuthFetchOptions = {
	path: string;
	method?: string;
	body?: unknown;
	headers?: HeadersInit;
	throw?: boolean;
};

type SessionRefreshOptions = {
	headers?: HeadersInit;
};

type SignInSocialArgs = {
	provider: "google" | "github";
	scopes?: string[];
	callbackURL?: string;
	errorCallbackURL?: string;
	disableRedirect?: boolean;
};

type ConvexFetchOptions = {
	fetchOptions?: {
		headers?: HeadersInit;
	};
};

type OneTimeTokenVerifyArgs = {
	token: string;
	fetchOptions?: {
		headers?: HeadersInit;
	};
};

type DesktopFetchOptions = {
	method?: string;
	headers?: HeadersInit;
	body?: unknown;
	throw?: boolean;
};

type UpdateUserArgs = {
	name?: string;
};

type DesktopAuthErrorShape = {
	message: string;
	status: number;
	statusText: string;
};

const normalizeHeaders = (
	headers?: HeadersInit,
): Record<string, string> | undefined => {
	if (!headers) {
		return undefined;
	}

	if (headers instanceof Headers) {
		return Object.fromEntries(headers.entries());
	}

	return Array.isArray(headers) ? Object.fromEntries(headers) : headers;
};

const isDesktopSessionData = (
	value: unknown,
): value is {
	session: Record<string, unknown>;
	user: Record<string, unknown>;
} =>
	typeof value === "object" &&
	value !== null &&
	"session" in value &&
	"user" in value;

const notifyListeners = () => {
	for (const listener of listeners) {
		listener();
	}
};

const toDesktopAuthErrorShape = (
	error: unknown,
	fallbackMessage: string,
): DesktopAuthErrorShape => {
	const nextError = error instanceof Error ? error : new Error(fallbackMessage);

	return {
		message: nextError.message,
		status:
			"status" in nextError && typeof nextError.status === "number"
				? nextError.status
				: 500,
		statusText:
			"statusText" in nextError && typeof nextError.statusText === "string"
				? nextError.statusText
				: nextError.message,
	};
};

const setSessionState = (nextState: SessionState) => {
	sessionState = nextState;
	notifyListeners();
};

const desktopAuthFetch = async ({
	path,
	method = "GET",
	body,
	headers,
	throw: shouldThrow,
}: DesktopAuthFetchOptions) => {
	if (!window.openGranDesktop?.authFetch) {
		throw new Error("Desktop auth bridge is not available.");
	}

	return await window.openGranDesktop.authFetch({
		path,
		method,
		body,
		headers: normalizeHeaders(headers),
		throw: shouldThrow,
	});
};

const refreshDesktopSession = async ({
	headers,
}: SessionRefreshOptions = {}): Promise<SessionRefreshResult> => {
	if (pendingSessionRefresh) {
		return pendingSessionRefresh;
	}

	setSessionState({
		...sessionState,
		error: null,
		isPending: true,
	});

	pendingSessionRefresh = desktopAuthFetch({
		path: "/get-session",
		method: "GET",
		headers,
	})
		.then((data: unknown) => {
			const nextData = isDesktopSessionData(data) ? data : null;

			setSessionState({
				data: nextData,
				error: null,
				isPending: false,
			});

			return {
				data: nextData,
				error: null,
			};
		})
		.catch((error: unknown) => {
			const nextError =
				error instanceof Error ? error : new Error("Failed to fetch session.");
			const errorShape = toDesktopAuthErrorShape(
				error,
				"Failed to fetch session.",
			);

			setSessionState({
				data: null,
				error: nextError,
				isPending: false,
			});

			return {
				data: null,
				error: errorShape,
			};
		})
		.finally(() => {
			pendingSessionRefresh = null;
		});

	return pendingSessionRefresh;
};

const fetchConvexEndpoint = async (path: string, headers?: HeadersInit) =>
	await desktopAuthFetch({
		path,
		method: "GET",
		headers,
	});

const useDesktopSession = () => {
	const [state, setState] = React.useState<SessionState>(sessionState);

	React.useEffect(() => {
		const listener = () => {
			setState(sessionState);
		};
		listeners.add(listener);

		if (sessionState.isPending) {
			void refreshDesktopSession();
		}

		return () => {
			listeners.delete(listener);
		};
	}, []);

	return state;
};

export const desktopAuthClient = {
	useSession: useDesktopSession,
	getSession: async ({ fetchOptions }: ConvexFetchOptions = {}) =>
		await refreshDesktopSession({
			headers: fetchOptions?.headers,
		}),
	updateUser: async (body: UpdateUserArgs) => {
		try {
			const data = await desktopAuthFetch({
				path: "/update-user",
				method: "POST",
				body,
				throw: true,
			});
			await refreshDesktopSession();

			return {
				data,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: toDesktopAuthErrorShape(error, "Failed to update user."),
			};
		}
	},
	signOut: async () => {
		await desktopAuthFetch({
			path: "/sign-out",
			method: "POST",
			body: {},
			throw: true,
		});
		setSessionState({
			data: null,
			error: null,
			isPending: false,
		});
		return { data: null, error: null };
	},
	$fetch: async (path: string, options: DesktopFetchOptions = {}) =>
		await desktopAuthFetch({
			path,
			method: options.method,
			body: options.body,
			headers: options.headers,
			throw: options.throw,
		}),
	signIn: {
		social: async ({
			provider,
			scopes,
			callbackURL,
			errorCallbackURL,
			disableRedirect,
		}: SignInSocialArgs) => {
			const resolvedCallbackURL =
				callbackURL ??
				(window.openGranDesktop
					? (await window.openGranDesktop.getAuthCallbackUrl()).url
					: window.location.href);
			const result = await desktopAuthFetch({
				path: "/sign-in/social",
				method: "POST",
				body: {
					provider,
					callbackURL: resolvedCallbackURL,
					errorCallbackURL: errorCallbackURL ?? resolvedCallbackURL,
					disableRedirect: disableRedirect ?? true,
					scopes,
				},
				throw: true,
			});

			const url =
				result && typeof result === "object" && "url" in result
					? String(result.url ?? "")
					: "";

			if (!url) {
				throw new Error(
					`${provider === "google" ? "Google" : "GitHub"} sign-in URL was not returned.`,
				);
			}

			if (window.openGranDesktop) {
				await window.openGranDesktop.openExternalUrl(url);
			} else {
				window.location.assign(url);
			}

			return { data: result, error: null };
		},
	},
	convex: {
		token: async ({ fetchOptions }: ConvexFetchOptions = {}) => ({
			data: await fetchConvexEndpoint("/convex/token", fetchOptions?.headers),
			error: null,
		}),
		jwks: async ({ fetchOptions }: ConvexFetchOptions = {}) => ({
			data: await fetchConvexEndpoint("/convex/jwks", fetchOptions?.headers),
			error: null,
		}),
		getJwks: async ({ fetchOptions }: ConvexFetchOptions = {}) => ({
			data: await fetchConvexEndpoint("/convex/jwks", fetchOptions?.headers),
			error: null,
		}),
		getOpenIdConfig: async ({ fetchOptions }: ConvexFetchOptions = {}) => ({
			data: await fetchConvexEndpoint(
				"/convex/.well-known/openid-configuration",
				fetchOptions?.headers,
			),
			error: null,
		}),
	},
	updateSession: () => {
		void refreshDesktopSession();
	},
	crossDomain: {
		oneTimeToken: {
			verify: async ({ token, fetchOptions }: OneTimeTokenVerifyArgs) => {
				const data = await desktopAuthFetch({
					path: "/cross-domain/one-time-token/verify",
					method: "POST",
					body: { token },
					headers: fetchOptions?.headers,
				});

				void refreshDesktopSession({
					headers: isDesktopSessionData(data)
						? {
								...(fetchOptions?.headers ?? {}),
								Authorization: `Bearer ${String(data.session?.token ?? "")}`,
							}
						: fetchOptions?.headers,
				});

				return {
					data,
					error: null,
				};
			},
		},
	},
};
