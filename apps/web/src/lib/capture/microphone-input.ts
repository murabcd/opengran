import { createDesktopMicrophoneInputStream } from "@/lib/capture/desktop-microphone";

const createBrowserMicrophoneInputStream = async () =>
	await navigator.mediaDevices.getUserMedia({
		audio: {
			channelCount: 1,
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
		},
	});

export const createMicrophoneInputStream = async () => {
	const desktopApi = window.openGranDesktop;

	if (
		desktopApi?.getMeta &&
		desktopApi.startMicrophoneCapture &&
		desktopApi.onMicrophoneCaptureEvent
	) {
		try {
			const { platform } = await desktopApi.getMeta();

			if (platform === "darwin") {
				return await createDesktopMicrophoneInputStream();
			}
		} catch {
			// Fall back to the browser capture path when desktop metadata is unavailable.
		}
	}

	return await createBrowserMicrophoneInputStream();
};
