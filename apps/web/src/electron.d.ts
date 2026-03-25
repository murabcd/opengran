declare global {
	type DesktopPermissionId = "microphone" | "systemAudio";
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
		description: string;
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
			startSystemAudioCapture: () => Promise<{
				channels: number;
				sampleRate: number;
			}>;
			stopSystemAudioCapture: () => Promise<{
				ok: boolean;
			}>;
			onSystemAudioCaptureEvent: (
				listener: (payload: {
					type: "chunk" | "error" | "stopped";
					pcm16?: string;
					message?: string;
					code?: number | null;
					signal?: string | number | null;
				}) => void,
			) => () => void;
			writeClipboardText: (value: string) => Promise<{
				ok: boolean;
			}>;
			loadTranscriptDraft: (noteKey: string) => Promise<{
				draft: {
					version: number;
					noteKey: string;
					updatedAt: number;
					utterances: Array<{
						id: string;
						speaker: "you" | "them";
						text: string;
						startedAt: number;
						endedAt: number;
					}>;
					liveTranscript: Record<
						"you" | "them",
						{
							speaker: "you" | "them";
							startedAt: number | null;
							text: string;
						}
					>;
					pendingGenerateTranscript: string;
				} | null;
			}>;
			saveTranscriptDraft: (
				noteKey: string,
				draft: {
					utterances: Array<{
						id: string;
						speaker: "you" | "them";
						text: string;
						startedAt: number;
						endedAt: number;
					}>;
					liveTranscript: Record<
						"you" | "them",
						{
							speaker: "you" | "them";
							startedAt: number | null;
							text: string;
						}
					>;
					pendingGenerateTranscript: string;
				},
			) => Promise<{
				ok: boolean;
			}>;
			clearTranscriptDraft: (noteKey: string) => Promise<{
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
