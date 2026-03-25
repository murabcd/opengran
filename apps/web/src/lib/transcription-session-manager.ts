import {
	TranscriptionController,
	type TranscriptionControllerDependencies,
} from "@/lib/transcription-controller";
import { TranscriptionSessionStore } from "@/lib/transcription-session-store";

export const GLOBAL_TRANSCRIPTION_SESSION_SCOPE = "global" as const;

// The app intentionally supports one active transcription session at a time.
// All UI surfaces subscribe to this single manager so capture ownership stays explicit.
export class TranscriptionSessionManager {
	readonly scope = GLOBAL_TRANSCRIPTION_SESSION_SCOPE;

	readonly store: TranscriptionSessionStore;

	readonly controller: TranscriptionController;

	constructor(
		dependencies: Partial<TranscriptionControllerDependencies> = {},
		store = new TranscriptionSessionStore(),
	) {
		this.store = store;
		this.controller = new TranscriptionController({
			...dependencies,
			store,
		});
	}
}

export const transcriptionSessionManager = new TranscriptionSessionManager();
