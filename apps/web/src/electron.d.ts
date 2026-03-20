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
			getShareBaseUrl: () => Promise<{
				url: string;
			}>;
			openExternalUrl: (url: string) => Promise<{
				ok: boolean;
			}>;
			writeClipboardText: (value: string) => Promise<{
				ok: boolean;
			}>;
			saveTextFile: (
				defaultFileName: string,
				content: string,
			) => Promise<{
				ok: boolean;
				canceled: boolean;
				filePath?: string;
			}>;
		};
	}
}

export {};
