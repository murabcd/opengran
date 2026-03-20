declare global {
	interface Window {
		openGranDesktop?: {
			getMeta: () => Promise<{
				name: string;
				version: string;
				platform: NodeJS.Platform;
			}>;
		};
	}
}

export {};
