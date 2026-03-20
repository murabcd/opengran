declare global {
	interface Window {
		openGranDesktop?: {
			getMeta: () => Promise<{
				name: string;
				version: string;
				platform: NodeJS.Platform;
			}>;
			getAuthCallbackUrl: () => Promise<{
				url: string;
			}>;
			openExternalUrl: (url: string) => Promise<{
				ok: boolean;
			}>;
		};
	}
}

export {};
