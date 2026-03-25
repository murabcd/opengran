import { useSyncExternalStore } from "react";
import type { TranscriptionControllerState } from "@/lib/transcription-controller";
import { transcriptionSessionManager } from "@/lib/transcription-session-manager";

export const useTranscriptionSession = (): TranscriptionControllerState =>
	useSyncExternalStore(
		transcriptionSessionManager.store.subscribe,
		transcriptionSessionManager.store.getSnapshot,
		transcriptionSessionManager.store.getSnapshot,
	);
