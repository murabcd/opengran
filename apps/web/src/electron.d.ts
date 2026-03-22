declare global {
	type DesktopPermissionId = "microphone";
	type DesktopPermissionState =
		| "granted"
		| "prompt"
		| "blocked"
		| "unsupported"
		| "unknown";
	type DesktopPlatform =
		| "aix"
		| "android"
		| "darwin"
		| "freebsd"
		| "haiku"
		| "linux"
		| "openbsd"
		| "sunos"
		| "win32"
		| "cygwin"
		| "netbsd";

	interface DesktopPermissionStatus {
		id: DesktopPermissionId;
		required: boolean;
		state: DesktopPermissionState;
		canRequest: boolean;
		canOpenSystemSettings: boolean;
	}

	interface DesktopPermissionsStatus {
		isDesktop: boolean;
		platform: DesktopPlatform;
		permissions: DesktopPermissionStatus[];
	}

	interface Window {
		openGranDesktop?: {
			getMeta: () => Promise<{
				name: string;
				version: string;
				platform: DesktopPlatform;
			}>;
			getPermissionsStatus: () => Promise<DesktopPermissionsStatus>;
			getAuthCallbackUrl: () => Promise<{
				url: string;
			}>;
			getShareBaseUrl: () => Promise<{
				url: string;
			}>;
			openExternalUrl: (url: string) => Promise<{
				ok: boolean;
			}>;
			requestPermission: (
				permissionId: DesktopPermissionId,
			) => Promise<DesktopPermissionsStatus>;
			openPermissionSettings: (permissionId: DesktopPermissionId) => Promise<{
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
