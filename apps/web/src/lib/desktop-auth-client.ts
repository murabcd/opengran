import * as React from "react";

type DesktopSessionData = {
	user: Record<string, unknown>;
	session: Record<string, unknown>;
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
let sessionState = { ...defaultSessionState };
let pendingSessionRefresh = null;

const notifyListeners = () => {
	for (const listener of listeners) {
		listener();
	}
};

const setSessionState = (nextState) => {
	sessionState = nextState;
	notifyListeners();
};

const desktopAuthFetch = async ({
	path,
	method = "GET",
	body,
	headers,
	throw: shouldThrow,
} = {}) => {
	if (!window.openGranDesktop?.authFetch) {
		throw new Error("Desktop auth bridge is not available.");
	}

	return await window.openGranDesktop.authFetch({
		path,
		method,
		body,
		headers,
		throw: shouldThrow,
	});
};

const refreshDesktopSession = async ({ headers } = {}) => {
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
		.then((data) => {
			const nextData =
				data && typeof data === "object" && data.session && data.user
					? data
					: null;

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
		.catch((error) => {
			const nextError =
				error instanceof Error ? error : new Error("Failed to fetch session.");

			setSessionState({
				data: null,
				error: nextError,
				isPending: false,
			});

			return {
				data: null,
				error: {
					message: nextError.message,
					status: 500,
					statusText: nextError.message,
				},
			};
		})
		.finally(() => {
			pendingSessionRefresh = null;
		});

	return pendingSessionRefresh;
};

const useDesktopSession = () => {
	const [state, setState] = React.useState(sessionState);

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
	getSession: async ({ fetchOptions } = {}) =>
		await refreshDesktopSession({
			headers: fetchOptions?.headers,
		}),
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
	$fetch: async (path, options = {}) =>
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
		}) => {
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
		token: async ({ fetchOptions } = {}) => ({
			data: await desktopAuthFetch({
				path: "/convex/token",
				method: "GET",
				headers: fetchOptions?.headers,
			}),
			error: null,
		}),
	},
	updateSession: () => {
		void refreshDesktopSession();
	},
	crossDomain: {
		oneTimeToken: {
			verify: async ({ token, fetchOptions } = {}) => {
				const data = await desktopAuthFetch({
					path: "/cross-domain/one-time-token/verify",
					method: "POST",
					body: { token },
					headers: fetchOptions?.headers,
				});

				void refreshDesktopSession({
					headers:
						data && typeof data === "object" && "session" in data
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
