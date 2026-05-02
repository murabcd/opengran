import {
	createSystemAudioCaptureStatus,
	type SystemAudioCaptureSourceMode,
	type SystemAudioCaptureStatus,
} from "@/lib/transcript";

export type TranscriptionPolicy = {
	platform: "browser" | "desktop";
	systemAudioCapability: {
		isSupported: boolean;
		sourceMode: SystemAudioCaptureSourceMode;
		shouldAutoBootstrap: boolean;
	};
};

const getMicrophonePermission = (status: DesktopPermissionsStatus) =>
	status.permissions.find((permission) => permission.id === "microphone");

export const getRealtimeAvailability = () =>
	typeof window !== "undefined" &&
	typeof RTCPeerConnection !== "undefined" &&
	Boolean(navigator.mediaDevices?.getUserMedia);

export const resolveTranscriptionPolicy =
	async (): Promise<TranscriptionPolicy> => {
		if (typeof window === "undefined" || !window.openGranDesktop) {
			return {
				platform: "browser",
				systemAudioCapability: {
					isSupported:
						typeof navigator.mediaDevices?.getDisplayMedia === "function",
					sourceMode:
						typeof navigator.mediaDevices?.getDisplayMedia === "function"
							? "display-media"
							: "unsupported",
					shouldAutoBootstrap: false,
				},
			};
		}

		try {
			const status = await window.openGranDesktop.getPermissionsStatus();
			const systemAudioPermission = status.permissions.find(
				(permission) => permission.id === "systemAudio",
			);

			if (status.platform === "darwin") {
				const sourceMode =
					systemAudioPermission?.state === "granted"
						? "desktop-native"
						: "unsupported";

				return {
					platform: "desktop",
					systemAudioCapability: {
						isSupported: sourceMode !== "unsupported",
						sourceMode,
						shouldAutoBootstrap: sourceMode === "desktop-native",
					},
				};
			}

			if (status.platform === "win32") {
				return {
					platform: "desktop",
					systemAudioCapability: {
						isSupported: true,
						sourceMode: "display-media",
						shouldAutoBootstrap: false,
					},
				};
			}
		} catch {}

		return {
			platform: "desktop",
			systemAudioCapability: {
				isSupported: false,
				sourceMode: "unsupported",
				shouldAutoBootstrap: false,
			},
		};
	};

export const createSystemAudioStatusFromPolicy = (
	policy: Pick<TranscriptionPolicy, "systemAudioCapability">,
): SystemAudioCaptureStatus =>
	createSystemAudioCaptureStatus({
		state: !policy.systemAudioCapability.isSupported ? "unsupported" : "ready",
		sourceMode: policy.systemAudioCapability.sourceMode,
	});

export const ensureDesktopMicrophonePermission = async () => {
	if (typeof window === "undefined" || !window.openGranDesktop) {
		return;
	}

	let permissionsStatus = await window.openGranDesktop.getPermissionsStatus();
	let microphonePermission = getMicrophonePermission(permissionsStatus);

	if (!microphonePermission || microphonePermission.state === "granted") {
		return;
	}

	if (
		microphonePermission.state === "prompt" &&
		microphonePermission.canRequest
	) {
		permissionsStatus =
			await window.openGranDesktop.requestPermission("microphone");
		microphonePermission = getMicrophonePermission(permissionsStatus);
	}

	if (microphonePermission?.state === "granted") {
		return;
	}

	if (microphonePermission?.state === "blocked") {
		throw new Error(
			"Microphone access is blocked. Enable it in system settings, then try again.",
		);
	}

	if (microphonePermission?.state === "unsupported") {
		throw new Error("Microphone capture is not available on this platform.");
	}

	throw new Error("Microphone access is required to start live transcription.");
};
