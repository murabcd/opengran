import { isDesktopPlatform } from "@workspace/platform/desktop";
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
	if (isDesktopPlatform("darwin")) {
		return await createDesktopMicrophoneInputStream();
	}

	return await createBrowserMicrophoneInputStream();
};
