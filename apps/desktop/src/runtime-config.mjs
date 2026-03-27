import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";

const runtimeConfigPath = join(app.getPath("userData"), "runtime-config.json");
const defaultConvexUrl = "https://precious-crane-700.convex.cloud";
const defaultConvexSiteUrl = "https://precious-crane-700.convex.site";

const trimConfigValue = (value) =>
	typeof value === "string" ? value.trim() : "";

const deriveConvexSiteUrl = (convexUrl) => {
	if (!convexUrl) {
		return "";
	}

	try {
		const url = new URL(convexUrl);

		if (url.hostname.endsWith(".convex.cloud")) {
			url.hostname = url.hostname.replace(/\.convex\.cloud$/u, ".convex.site");
			url.pathname = "/";
			url.search = "";
			url.hash = "";
			return url.toString().replace(/\/$/u, "");
		}
	} catch {}

	return "";
};

const normalizeRuntimeConfig = (value) => {
	const convexUrl = trimConfigValue(value?.convexUrl) || defaultConvexUrl;
	const convexSiteUrlInput =
		trimConfigValue(value?.convexSiteUrl) || defaultConvexSiteUrl;
	const openAIApiKey = trimConfigValue(value?.openAIApiKey);

	return {
		convexUrl,
		convexSiteUrl: convexSiteUrlInput || deriveConvexSiteUrl(convexUrl),
		openAIApiKey,
	};
};

const toPublicRuntimeConfig = (value) => ({
	convexUrl: value.convexUrl,
	convexSiteUrl: value.convexSiteUrl,
	hasOpenAIApiKey: Boolean(value.openAIApiKey),
	isConfigured: Boolean(value.openAIApiKey),
});

const readStoredRuntimeConfig = async () => {
	try {
		const raw = await readFile(runtimeConfigPath, "utf8");
		return normalizeRuntimeConfig(JSON.parse(raw));
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return normalizeRuntimeConfig({});
		}

		console.warn("Failed to read desktop runtime config.", error);
		return normalizeRuntimeConfig({});
	}
};

const resolveRuntimeConfig = async () => {
	const storedConfig = await readStoredRuntimeConfig();
	const envConvexUrl =
		trimConfigValue(process.env.CONVEX_URL) ||
		trimConfigValue(process.env.VITE_CONVEX_URL);
	const envConvexSiteUrl =
		trimConfigValue(process.env.CONVEX_SITE_URL) ||
		trimConfigValue(process.env.VITE_CONVEX_SITE_URL);
	const envOpenAIApiKey = trimConfigValue(process.env.OPENAI_API_KEY);

	return normalizeRuntimeConfig({
		convexUrl: envConvexUrl || storedConfig.convexUrl,
		convexSiteUrl: envConvexSiteUrl || storedConfig.convexSiteUrl,
		openAIApiKey: envOpenAIApiKey || storedConfig.openAIApiKey,
	});
};

const applyRuntimeConfig = (value) => {
	if (value.convexUrl) {
		process.env.CONVEX_URL = value.convexUrl;
		process.env.VITE_CONVEX_URL = value.convexUrl;
	}

	if (value.convexSiteUrl) {
		process.env.CONVEX_SITE_URL = value.convexSiteUrl;
		process.env.VITE_CONVEX_SITE_URL = value.convexSiteUrl;
	}

	if (value.openAIApiKey) {
		process.env.OPENAI_API_KEY = value.openAIApiKey;
	}
};

export const hydrateRuntimeConfig = async () => {
	const runtimeConfig = await resolveRuntimeConfig();
	applyRuntimeConfig(runtimeConfig);
	return runtimeConfig;
};

export const getRuntimeConfig = async () =>
	toPublicRuntimeConfig(await resolveRuntimeConfig());

export const saveRuntimeConfig = async (value) => {
	const currentConfig = await resolveRuntimeConfig();
	const submittedConfig = normalizeRuntimeConfig(value);
	const nextConfig = normalizeRuntimeConfig({
		convexUrl: submittedConfig.convexUrl || currentConfig.convexUrl,
		convexSiteUrl: submittedConfig.convexSiteUrl || currentConfig.convexSiteUrl,
		openAIApiKey: submittedConfig.openAIApiKey || currentConfig.openAIApiKey,
	});

	if (!nextConfig.openAIApiKey) {
		throw new Error("Desktop runtime config requires an OpenAI API key.");
	}

	await mkdir(app.getPath("userData"), { recursive: true });
	await writeFile(
		runtimeConfigPath,
		JSON.stringify(nextConfig, null, 2),
		"utf8",
	);
	applyRuntimeConfig(nextConfig);

	return toPublicRuntimeConfig(nextConfig);
};
