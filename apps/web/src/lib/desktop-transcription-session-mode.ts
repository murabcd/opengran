import {
	isDesktopPlatform,
	supportsDesktopTranscriptionController,
} from "@workspace/platform/desktop";

export const shouldUseDesktopTranscriptionProxy = () =>
	isDesktopPlatform("darwin") && supportsDesktopTranscriptionController();
