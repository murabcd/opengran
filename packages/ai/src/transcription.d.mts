export declare const TRANSCRIPTION_MODEL: "gpt-4o-transcribe";

export declare const REALTIME_TRANSCRIPTION_INCLUDE_FIELDS: readonly [
	"item.input_audio_transcription.logprobs",
];

export declare function resolveRealtimeNoiseReductionType(
	source?: string | null,
): "near_field" | null;

export declare function resolveRealtimeSilenceDurationMs(
	source?: string | null,
): number;

export declare function resolveRealtimeTranscriptionPrompt(args?: {
	language?: string | null;
	source?: string | null;
}): string | null;

export declare function createRealtimeTranscriptionSessionOptions(args?: {
	language?: string | null;
	source?: string | null;
}): {
	language: string | null;
	noiseReductionType: "near_field" | null;
	prompt: string | null;
	silenceDurationMs: number;
};

export declare function normalizeTranscriptionLanguage(
	value?: string | null,
): string | null;

export declare function normalizeTranscriptText(
	value?: string | null,
): string;

export declare function getTranscriptWordCount(value?: string | null): number;

export declare function isTranscriptPlaceholderText(
	value?: string | null,
): boolean;

export declare function createRealtimeTranscriptionSession(options?: {
	language?: string | null;
	noiseReductionType?: "near_field" | "far_field" | null;
	prompt?: string | null;
	silenceDurationMs?: number;
}): {
	type: "transcription";
	include: readonly ["item.input_audio_transcription.logprobs"];
	audio: {
		input: {
			noise_reduction: {
				type: "near_field" | "far_field";
			} | null;
			turn_detection: {
				type: "server_vad";
				threshold: number;
				prefix_padding_ms: number;
				silence_duration_ms: number;
			};
			transcription: {
				model: "gpt-4o-transcribe";
				prompt?: string;
				language?: string;
			};
		};
	};
};

export declare function resolveDesktopRealtimeProfile(args?: {
	source?: string | null;
	speaker?: string | null;
}): "default" | "semantic_low";

export declare function createDesktopRealtimeTranscriptionSession(args?: {
	language?: string | null;
	source?: string | null;
	speaker?: string | null;
}): {
	type: "transcription";
	include: readonly ["item.input_audio_transcription.logprobs"];
	audio: {
		input: {
			format: {
				rate: 24000;
				type: "audio/pcm";
			};
			noise_reduction: {
				type: "near_field" | "far_field";
			} | null;
			turn_detection:
				| {
						type: "server_vad";
						threshold: number;
						prefix_padding_ms: number;
						silence_duration_ms: number;
				  }
				| {
						type: "semantic_vad";
						eagerness: "low";
				  };
			transcription: {
				model: "gpt-4o-transcribe";
				prompt?: string;
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
	source?: string | null;
	text?: string | null;
}): {
	average: number;
	lowTokenRatio: number;
	minProbability: number;
	tokenCount: number;
	veryLowTokenRatio: number;
	wordCount: number;
} | null;

export declare function isLowConfidenceTranscriptLogprobs(args: {
	logprobs?: Array<{
		bytes?: number[];
		logprob?: number;
		token?: string;
	}> | null;
	source?: string | null;
	text?: string | null;
}): boolean;

export declare function shouldDropTranscriptForConfidence(args: {
	logprobs?: Array<{
		bytes?: number[];
		logprob?: number;
		token?: string;
	}> | null;
	source?: string | null;
	text?: string | null;
}): boolean;

export declare function shouldKeepInterruptedTranscriptTurn(args: {
	logprobs?: Array<{
		bytes?: number[];
		logprob?: number;
		token?: string;
	}> | null;
	source?: string | null;
	text?: string | null;
}): boolean;
