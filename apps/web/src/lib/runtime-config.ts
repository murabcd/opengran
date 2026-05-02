import { getDesktopBridge } from "@/lib/desktop-platform";

type AppRuntimeConfig = {
	convexUrl: string;
	convexSiteUrl: string;
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
	const desktopBridge = getDesktopBridge();

	if (desktopBridge?.getRuntimeConfig) {
		const config = await desktopBridge.getRuntimeConfig();

		return {
			...config,
			isDesktop: true,
		};
	}

	return {
		convexUrl: getEnv("VITE_CONVEX_URL"),
		convexSiteUrl: getEnv("VITE_CONVEX_SITE_URL"),
		isDesktop: false,
	};
}
