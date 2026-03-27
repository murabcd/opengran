import type { TranscriptionControllerOptions } from "@/lib/transcription-controller";
import type {
	TranscriptionSessionEvent,
	TranscriptionSessionStore,
} from "@/lib/transcription-session-store";
import type {
	SystemAudioRecordingPayload,
	TranscriptionControllerState,
} from "@/lib/transcription-session-types";

type SerializedSystemAudioRecordingPayload = Omit<
	SystemAudioRecordingPayload,
	"blob"
> & {
	blobBase64: string;
	mimeType: string;
};

type SerializedDesktopTranscriptionSessionEvent =
	| {
			type: "session.permission_failure";
			error: {
				code:
					| "permission_denied"
					| "device_unavailable"
					| "connection_failed"
					| "configuration_failed"
					| "unknown";
				message: string;
			};
	  }
	| {
			type: "session.system_audio_recording_ready";
			payload: SerializedSystemAudioRecordingPayload;
	  }
	| {
			type: "session.utterance_committed";
			utterance: TranscriptionControllerState["utterances"][number];
	  };

const decodeBase64ToBlob = (base64Value: string, mimeType: string) => {
	const binaryValue = atob(base64Value);
	const bytes = new Uint8Array(binaryValue.length);

	for (let index = 0; index < binaryValue.length; index += 1) {
		bytes[index] = binaryValue.charCodeAt(index);
	}

	return new Blob([bytes], {
		type: mimeType,
	});
};

const deserializeDesktopEvent = (
	event: SerializedDesktopTranscriptionSessionEvent,
): TranscriptionSessionEvent => {
	if (event.type !== "session.system_audio_recording_ready") {
		return event;
	}

	return {
		type: event.type,
		payload: {
			blob: decodeBase64ToBlob(
				event.payload.blobBase64,
				event.payload.mimeType,
			),
			endedAt: event.payload.endedAt,
			sourceMode: event.payload.sourceMode,
			startedAt: event.payload.startedAt,
		},
	};
};

export class DesktopTranscriptionControllerProxy {
	private readonly store: TranscriptionSessionStore;

	private readonly initializationPromise: Promise<void>;

	constructor(store: TranscriptionSessionStore) {
		this.store = store;
		this.initializationPromise = this.initialize();
	}

	configure = async (options: TranscriptionControllerOptions) => {
		await this.initializationPromise;
		await window.openGranDesktop?.configureTranscriptionSession(options);
	};

	start = async () => {
		await this.initializationPromise;
		return (await window.openGranDesktop?.startTranscriptionSession()) ?? false;
	};

	stop = async () => {
		await this.initializationPromise;
		await window.openGranDesktop?.stopTranscriptionSession();
	};

	requestSystemAudio = async () => {
		await this.initializationPromise;
		return (
			(await window.openGranDesktop?.requestTranscriptionSystemAudio()) ?? false
		);
	};

	detachSystemAudio = async () => {
		await this.initializationPromise;
		await window.openGranDesktop?.detachTranscriptionSystemAudio();
	};

	private initialize = async () => {
		const desktopApi = window.openGranDesktop;

		if (!desktopApi) {
			return;
		}

		desktopApi.onTranscriptionSessionState((state) => {
			this.store.replaceState(state);
		});

		desktopApi.onTranscriptionSessionEvent((event) => {
			this.store.emitExternalEvent(deserializeDesktopEvent(event));
		});

		this.store.replaceState(await desktopApi.getTranscriptionSessionState());
	};
}
