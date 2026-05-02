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

export const openDesktopExternalUrl = async (url: string) => {
	const bridge = getDesktopBridge();

	if (!bridge?.openExternalUrl) {
		return false;
	}

	await bridge.openExternalUrl(url);
	return true;
};

export const canOpenDesktopSoundSettings = () =>
	Boolean(getDesktopBridge()?.openSoundSettings);

export const openDesktopSoundSettings = async () => {
	const bridge = getDesktopBridge();

	if (!bridge?.openSoundSettings) {
		return false;
	}

	await bridge.openSoundSettings();
	return true;
};

export const saveDesktopTextFile = async (
	defaultFileName: string,
	content: string,
) => {
	const bridge = getDesktopBridge();

	if (!bridge?.saveTextFile) {
		return null;
	}

	return await bridge.saveTextFile(defaultFileName, content);
};
