import type { TranscriptUtterance } from "@/lib/transcript";
import {
	createInitialTranscriptionControllerState,
	type SystemAudioRecordingPayload,
	type TranscriptionControllerError,
	type TranscriptionControllerState,
} from "@/lib/transcription-session-types";

export type TranscriptionSessionEvent =
	| {
			type: "session.state_patch";
			patch: Partial<TranscriptionControllerState>;
	  }
	| {
			type: "session.utterance_committed";
			utterance: TranscriptUtterance;
	  }
	| {
			type: "session.system_audio_recording_ready";
			payload: SystemAudioRecordingPayload;
	  }
	| {
			type: "session.permission_failure";
			error: TranscriptionControllerError;
	  };

const compareTranscriptUtterances = (
	left: TranscriptUtterance,
	right: TranscriptUtterance,
) => {
	if (left.startedAt !== right.startedAt) {
		return left.startedAt - right.startedAt;
	}

	if (left.endedAt !== right.endedAt) {
		return left.endedAt - right.endedAt;
	}

	return left.id.localeCompare(right.id);
};

export class TranscriptionSessionStore {
	private state = createInitialTranscriptionControllerState();

	private readonly stateListeners = new Set<
		(state: TranscriptionControllerState) => void
	>();

	private readonly eventListeners = new Set<
		(event: TranscriptionSessionEvent) => void
	>();

	subscribe = (listener: (state: TranscriptionControllerState) => void) => {
		this.stateListeners.add(listener);
		return () => {
			this.stateListeners.delete(listener);
		};
	};

	subscribeToEvents = (
		listener: (event: TranscriptionSessionEvent) => void,
	) => {
		this.eventListeners.add(listener);
		return () => {
			this.eventListeners.delete(listener);
		};
	};

	getSnapshot = () => this.state;

	dispatch = (event: TranscriptionSessionEvent) => {
		if (event.type === "session.state_patch") {
			this.state = {
				...this.state,
				...event.patch,
			};
			this.emitState();
			this.emitEvent(event);
			return;
		}

		if (event.type === "session.utterance_committed") {
			this.state = {
				...this.state,
				utterances: [...this.state.utterances, event.utterance].sort(
					compareTranscriptUtterances,
				),
			};
			this.emitState();
			this.emitEvent(event);
			return;
		}

		this.emitEvent(event);
	};

	private emitState = () => {
		for (const listener of this.stateListeners) {
			listener(this.state);
		}
	};

	private emitEvent = (event: TranscriptionSessionEvent) => {
		for (const listener of this.eventListeners) {
			listener(event);
		}
	};
}
