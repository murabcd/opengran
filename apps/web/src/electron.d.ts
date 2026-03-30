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

	type DesktopTranscriptionControllerPhase =
		| "idle"
		| "starting"
		| "listening"
		| "reconnecting"
		| "stopping"
		| "failed";

	type DesktopTranscriptionControllerErrorCode =
		| "permission_denied"
		| "device_unavailable"
		| "connection_failed"
		| "configuration_failed"
		| "unknown";

	type DesktopMeetingDetectionState = {
		candidateStartedAt: number | null;
		confidence: number;
		dismissedUntil: number | null;
		hasMeetingSignal: boolean;
		isMicrophoneActive: boolean;
		isSuppressed: boolean;
		sourceName: string | null;
		status: "idle" | "monitoring" | "prompting";
	};

	type DesktopTranscriptionControllerState = {
		autoStartKey: string | number | null;
		error: {
			code: DesktopTranscriptionControllerErrorCode;
			message: string;
		} | null;
		isAvailable: boolean;
		isConnecting: boolean;
		isListening: boolean;
		liveTranscript: Record<
			"you" | "them",
			{
				speaker: "you" | "them";
				startedAt: number | null;
				text: string;
			}
		>;
		phase: DesktopTranscriptionControllerPhase;
		recoveryStatus: {
			attempt: number;
			maxAttempts: number;
			message: string | null;
			state: "idle" | "reconnecting" | "failed";
		};
		scopeKey: string | null;
		systemAudioStatus: {
			sourceMode: "desktop-native" | "display-media" | "unsupported";
			state: "unsupported" | "ready" | "connected";
		};
		utterances: Array<{
			endedAt: number;
			id: string;
			speaker: "you" | "them" | `remote:${number}`;
			startedAt: number;
			text: string;
		}>;
	};

	type DesktopTranscriptionSessionEvent =
		| {
				type: "session.permission_failure";
				error: {
					code: DesktopTranscriptionControllerErrorCode;
					message: string;
				};
		  }
		| {
				type: "session.system_audio_recording_ready";
				payload: {
					blobBase64: string;
					endedAt: number;
					mimeType: string;
					sourceMode: "desktop-native" | "display-media" | "unsupported";
					startedAt: number;
				};
		  }
		| {
				type: "session.utterance_committed";
				utterance: DesktopTranscriptionControllerState["utterances"][number];
		  };

	type DesktopRealtimeTransportEvent =
		| {
				speaker: "you" | "them";
				type: "committed";
				itemId: string;
				previousItemId: string | null;
		  }
		| {
				speaker: "you" | "them";
				type: "partial";
				itemId: string;
				textDelta: string;
		  }
		| {
				speaker: "you" | "them";
				type: "final";
				itemId: string;
				text: string;
		  }
		| {
				speaker: "you" | "them";
				type: "interrupted";
				message: string;
		  };

	interface Window {
		openGranDesktop?: {
			platform: DesktopPlatform;
			getMeta: () => Promise<{
				name: string;
				version: string;
				platform: DesktopPlatform;
			}>;
			getRuntimeConfig: () => Promise<{
				convexUrl: string;
				convexSiteUrl: string;
			}>;
			authFetch: (request: {
				path: string;
				method?: string;
				body?: unknown;
				headers?: Record<string, string>;
				throw?: boolean;
			}) => Promise<unknown>;
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
			getTranscriptionSessionState: () => Promise<DesktopTranscriptionControllerState>;
			getMeetingDetectionState: () => Promise<DesktopMeetingDetectionState>;
			configureTranscriptionSession: (options: {
				autoStartKey?: string | number | null;
				lang?: string;
				scopeKey?: string | null;
			}) => Promise<{
				ok: boolean;
			}>;
			startTranscriptionSession: () => Promise<boolean>;
			stopTranscriptionSession: () => Promise<{
				ok: boolean;
			}>;
			requestTranscriptionSystemAudio: () => Promise<boolean>;
			detachTranscriptionSystemAudio: () => Promise<{
				ok: boolean;
			}>;
			startDetectedMeetingNote: () => Promise<{
				ok: boolean;
			}>;
			dismissDetectedMeetingWidget: () => Promise<{
				ok: boolean;
			}>;
			reportMeetingWidgetSize: (size: {
				width: number;
				height: number;
			}) => void;
			test?:
				| {
						showMeetingWidget: () => Promise<{
							ok: boolean;
						}>;
						resetMeetingDetection: () => Promise<{
							ok: boolean;
						}>;
				  }
				| undefined;
			onTranscriptionSessionState: (
				listener: (state: DesktopTranscriptionControllerState) => void,
			) => () => void;
			onTranscriptionSessionEvent: (
				listener: (event: DesktopTranscriptionSessionEvent) => void,
			) => () => void;
			onMeetingDetectionState: (
				listener: (state: DesktopMeetingDetectionState) => void,
			) => () => void;
			startSystemAudioCapture: () => Promise<{
				channels: number;
				sampleRate: number;
			}>;
			stopSystemAudioCapture: () => Promise<{
				ok: boolean;
			}>;
			startMicrophoneCapture: () => Promise<{
				channels: number;
				sampleRate: number;
			}>;
			stopMicrophoneCapture: () => Promise<{
				ok: boolean;
			}>;
			startDesktopRealtimeTransport: (options: {
				lang?: string;
				source: "microphone" | "systemAudio";
				speaker: "you" | "them";
			}) => Promise<{
				ok: boolean;
			}>;
			stopDesktopRealtimeTransport: (speaker: "you" | "them") => Promise<{
				ok: boolean;
			}>;
			onDesktopRealtimeTransportEvent: (
				listener: (payload: DesktopRealtimeTransportEvent) => void,
			) => () => void;
			onMicrophoneCaptureEvent: (
				listener: (payload: {
					type: "chunk" | "error" | "stopped";
					pcm16?: string;
					message?: string;
					code?: number | null;
					signal?: string | number | null;
				}) => void,
			) => () => void;
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
