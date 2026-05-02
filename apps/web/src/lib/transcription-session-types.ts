import {
	createEmptyLiveTranscriptState,
	createSystemAudioCaptureStatus,
	createTranscriptRecoveryStatus,
	type LiveTranscriptState,
	type SystemAudioCaptureStatus,
	type TranscriptRecoveryStatus,
	type TranscriptUtterance,
} from "@/lib/transcript";

export type TranscriptionControllerError = {
	code:
		| "permission_denied"
		| "device_unavailable"
		| "connection_failed"
		| "configuration_failed"
		| "unknown";
	message: string;
};

export type TranscriptionControllerState = {
	autoStartKey: string | number | null;
	error: TranscriptionControllerError | null;
	isAvailable: boolean;
	isConnecting: boolean;
	isListening: boolean;
	liveTranscript: LiveTranscriptState;
	phase:
		| "idle"
		| "starting"
		| "listening"
		| "reconnecting"
		| "stopping"
		| "failed";
	recoveryStatus: TranscriptRecoveryStatus;
	scopeKey: string | null;
	systemAudioStatus: SystemAudioCaptureStatus;
	utterances: TranscriptUtterance[];
};

export const createInitialTranscriptionControllerState =
	(): TranscriptionControllerState => ({
		autoStartKey: null,
		error: null,
		isAvailable: false,
		isConnecting: false,
		isListening: false,
		liveTranscript: createEmptyLiveTranscriptState(),
		phase: "idle",
		recoveryStatus: createTranscriptRecoveryStatus(),
		scopeKey: null,
		systemAudioStatus: createSystemAudioCaptureStatus(),
		utterances: [],
	});
