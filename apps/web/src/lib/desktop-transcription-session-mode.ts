export const shouldUseDesktopTranscriptionProxy = () =>
	typeof window !== "undefined" &&
	Boolean(window.openGranDesktop?.getTranscriptionSessionState) &&
	window.openGranDesktop?.platform === "darwin";
