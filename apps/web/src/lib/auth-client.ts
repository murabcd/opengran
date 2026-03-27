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

export type AuthClient = ReturnType<typeof createConfiguredAuthClient>;

export let authClient!: AuthClient;

export function initializeAuthClient(baseURL: string, isDesktop = false) {
	authClient = isDesktop
		? (desktopAuthClient as AuthClient)
		: createConfiguredAuthClient(baseURL);
	return authClient;
}

export type AuthSession = AuthClient["$Infer"]["Session"];
