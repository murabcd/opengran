import { DesktopTranscriptionControllerProxy } from "@/lib/desktop-transcription-controller-proxy";
import { shouldUseDesktopTranscriptionProxy } from "@/lib/desktop-transcription-session-mode";
import {
	TranscriptionController,
	type TranscriptionControllerDependencies,
	type TranscriptionControllerOptions,
} from "@/lib/transcription-controller";
import { TranscriptionSessionStore } from "@/lib/transcription-session-store";

const GLOBAL_TRANSCRIPTION_SESSION_SCOPE = "global" as const;

type TranscriptionControllerLike = {
	configure: (options: TranscriptionControllerOptions) => void | Promise<void>;
	detachSystemAudio: () => Promise<void>;
	requestSystemAudio: () => Promise<boolean>;
	start: () => Promise<boolean>;
	stop: (options?: {
		preserveUtterances?: boolean;
		resetError?: boolean;
		resetRecovery?: boolean;
	}) => Promise<void>;
};

// The app intentionally supports one active transcription session at a time.
// All UI surfaces subscribe to this single manager so capture ownership stays explicit.
class TranscriptionSessionManager {
	readonly scope = GLOBAL_TRANSCRIPTION_SESSION_SCOPE;

	readonly store: TranscriptionSessionStore;

	readonly controller: TranscriptionControllerLike;

	constructor(
		dependencies: Partial<TranscriptionControllerDependencies> = {},
		store = new TranscriptionSessionStore(),
	) {
		this.store = store;
		this.controller =
			Object.keys(dependencies).length === 0 &&
			shouldUseDesktopTranscriptionProxy()
				? new DesktopTranscriptionControllerProxy(store)
				: new TranscriptionController({
						...dependencies,
						store,
					});
	}
}

export const transcriptionSessionManager = new TranscriptionSessionManager();
