import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const LOCAL_SITE_URLS = ["http://127.0.0.1:3000", "http://localhost:3000"];
const DESKTOP_CALLBACK_ORIGINS = [
	"http://127.0.0.1:*",
	"http://localhost:*",
];

function requireEnv(name: string) {
	const value = process.env[name];

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

function envOrPlaceholder(name: string, fallback: string) {
	return process.env[name] ?? fallback;
}

function getSiteUrl() {
	return process.env.SITE_URL ?? LOCAL_SITE_URLS[0];
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	const siteUrl = getSiteUrl();

	return betterAuth({
		appName: "OpenGran",
		baseURL: requireEnv("CONVEX_SITE_URL"),
		trustedOrigins: [siteUrl, ...LOCAL_SITE_URLS, ...DESKTOP_CALLBACK_ORIGINS],
		database: authComponent.adapter(ctx),
		socialProviders: {
			github: {
				clientId: envOrPlaceholder("GITHUB_CLIENT_ID", "github-client-id"),
				clientSecret: envOrPlaceholder(
					"GITHUB_CLIENT_SECRET",
					"github-client-secret",
				),
			},
		},
		plugins: [
			convex({ authConfig }),
			crossDomain({ siteUrl }),
		],
	});
};

export const { getAuthUser } = authComponent.clientApi();

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		return (await authComponent.safeGetAuthUser(ctx)) ?? null;
	},
});
