import {
	convexClient,
	crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

function getEnv(...names: Array<keyof ImportMetaEnv>) {
	for (const name of names) {
		const value = import.meta.env[name];

		if (value) {
			return value;
		}
	}

	throw new Error(
		`Missing required client environment variable: ${names.join(" or ")}`,
	);
}

export const authClient = createAuthClient({
	baseURL: getEnv("VITE_CONVEX_SITE_URL", "CONVEX_SITE_URL"),
	plugins: [convexClient(), crossDomainClient()],
});

export type AuthSession = typeof authClient.$Infer.Session;
