import {
	isDesktopPlatform,
	supportsDesktopTranscriptionController,
} from "@/lib/desktop-platform";

export const shouldUseDesktopTranscriptionProxy = () =>
	isDesktopPlatform("darwin") && supportsDesktopTranscriptionController();
