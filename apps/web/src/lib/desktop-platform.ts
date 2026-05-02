export type DesktopBridge = NonNullable<Window["openGranDesktop"]>;

export const getDesktopBridge = (): DesktopBridge | null => {
	if (typeof window === "undefined") {
		return null;
	}

	return window.openGranDesktop ?? null;
};

export const getRequiredDesktopBridge = (): DesktopBridge => {
	const bridge = getDesktopBridge();

	if (!bridge) {
		throw new Error("Desktop bridge is unavailable.");
	}

	return bridge;
};

export const isDesktopRuntime = () => getDesktopBridge() !== null;

export const isDesktopPlatform = (platform: DesktopPlatform) =>
	getDesktopBridge()?.platform === platform;

export const supportsDesktopTranscriptionController = () => {
	const bridge = getDesktopBridge();

	return Boolean(
		bridge?.getTranscriptionSessionState &&
			bridge?.configureTranscriptionSession &&
			bridge?.startTranscriptionSession &&
			bridge?.stopTranscriptionSession,
	);
};

export const supportsDesktopNativeAudioCapture = () => {
	const bridge = getDesktopBridge();

	return Boolean(
		bridge?.startMicrophoneCapture &&
			bridge?.onMicrophoneCaptureEvent &&
			bridge?.startSystemAudioCapture &&
			bridge?.onSystemAudioCaptureEvent,
	);
};
