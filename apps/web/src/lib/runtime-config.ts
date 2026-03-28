type AppRuntimeConfig = {
	convexUrl: string;
	convexSiteUrl: string;
	hasOpenAIApiKey: boolean;
	isConfigured: boolean;
	isDesktop: boolean;
};

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

export async function loadRuntimeConfig(): Promise<AppRuntimeConfig> {
	if (
		typeof window !== "undefined" &&
		window.openGranDesktop?.getRuntimeConfig
	) {
		const config = await window.openGranDesktop.getRuntimeConfig();

		return {
			...config,
			isDesktop: true,
		};
	}

	return {
		convexUrl: getEnv("VITE_CONVEX_URL", "CONVEX_URL"),
		convexSiteUrl: getEnv("VITE_CONVEX_SITE_URL", "CONVEX_SITE_URL"),
		hasOpenAIApiKey: true,
		isConfigured: true,
		isDesktop: false,
	};
}
