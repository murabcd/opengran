declare global {
	interface Window {
		openMeetDesktop?: {
			getMeta: () => Promise<{
				name: string;
				version: string;
				platform: NodeJS.Platform;
			}>;
		};
	}
}

export {};
