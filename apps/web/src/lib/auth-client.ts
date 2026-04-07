import {
	convexClient,
	crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { desktopAuthClient } from "./desktop-auth-client";

const createConfiguredAuthClient = (baseURL: string) =>
	createAuthClient({
		baseURL,
		plugins: [convexClient(), crossDomainClient()],
	});

type WebAuthClient = ReturnType<typeof createConfiguredAuthClient>;
export type AuthSession = WebAuthClient["$Infer"]["Session"];
export type AuthClient = WebAuthClient;

export let authClient!: AuthClient;

export function initializeAuthClient(baseURL: string, isDesktop = false) {
	authClient = isDesktop
		? (desktopAuthClient as unknown as AuthClient)
		: createConfiguredAuthClient(baseURL);
	return authClient;
}
