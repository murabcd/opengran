import { useEffect, useMemo } from "react";
import { transcriptionSessionManager } from "@/lib/transcription-session-manager";

export const useTranscriptionControls = ({
	autoStartKey = null,
	lang,
	scopeKey = null,
}: {
	autoStartKey?: string | number | null;
	lang?: string;
	scopeKey?: string | null;
}) => {
	useEffect(() => {
		transcriptionSessionManager.controller.configure({
			autoStartKey,
			lang,
			scopeKey,
		});
	}, [autoStartKey, lang, scopeKey]);

	return useMemo(
		() => ({
			detachSystemAudio: () =>
				transcriptionSessionManager.controller.detachSystemAudio(),
			requestSystemAudio: () =>
				transcriptionSessionManager.controller.requestSystemAudio(),
			start: () => transcriptionSessionManager.controller.start(),
			stop: () => transcriptionSessionManager.controller.stop(),
		}),
		[],
	);
};
