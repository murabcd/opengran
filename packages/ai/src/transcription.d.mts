export declare const TRANSCRIPTION_MODEL: "gpt-4o-transcribe";

export declare const REALTIME_TRANSCRIPTION_INCLUDE_FIELDS: readonly [
	"item.input_audio_transcription.logprobs",
];

export declare function normalizeTranscriptionLanguage(
	value?: string | null,
): string | null;

export declare function createRealtimeTranscriptionSession(options?: {
	language?: string | null;
	noiseReductionType?: "near_field" | "far_field";
	silenceDurationMs?: number;
}): {
	type: "transcription";
	include: readonly ["item.input_audio_transcription.logprobs"];
	audio: {
		input: {
			noise_reduction: {
				type: "near_field" | "far_field";
			};
			turn_detection: {
				type: "server_vad";
				threshold: number;
				prefix_padding_ms: number;
				silence_duration_ms: number;
			};
			transcription: {
				model: "gpt-4o-transcribe";
				language?: string;
			};
		};
	};
};

export declare function summarizeTranscriptConfidence(args: {
	logprobs?: Array<{
		bytes?: number[];
		logprob?: number;
		token?: string;
	}> | null;
	text?: string | null;
}): {
	average: number;
	lowTokenRatio: number;
	tokenCount: number;
} | null;

export declare function isLowConfidenceTranscriptLogprobs(args: {
	logprobs?: Array<{
		bytes?: number[];
		logprob?: number;
		token?: string;
	}> | null;
	text?: string | null;
}): boolean;
