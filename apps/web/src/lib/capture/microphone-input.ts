import { createDesktopMicrophoneInputStream } from "@/lib/capture/desktop-microphone";
import { isDesktopPlatform } from "@/lib/desktop-platform";

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
