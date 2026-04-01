export const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

export const REALTIME_TRANSCRIPTION_INCLUDE_FIELDS = [
	"item.input_audio_transcription.logprobs",
];

export const normalizeTranscriptionLanguage = (value) =>
	value?.split("-")[0]?.trim().toLowerCase() || null;

export const createRealtimeTranscriptionSession = ({
	language = null,
	noiseReductionType = "near_field",
	silenceDurationMs = 200,
} = {}) => ({
	type: "transcription",
	include: REALTIME_TRANSCRIPTION_INCLUDE_FIELDS,
	audio: {
		input: {
			noise_reduction: {
				type: noiseReductionType,
			},
			turn_detection: {
				type: "server_vad",
				threshold: 0.5,
				prefix_padding_ms: 300,
				silence_duration_ms: silenceDurationMs,
			},
			transcription: {
				model: TRANSCRIPTION_MODEL,
				...(language ? { language } : {}),
			},
		},
	},
});

const clampProbability = (logprob) => {
	if (typeof logprob !== "number" || Number.isNaN(logprob)) {
		return null;
	}

	return Math.exp(Math.min(0, Math.max(logprob, -20)));
};

const getConfidenceCandidates = (logprobs) =>
	Array.isArray(logprobs)
		? logprobs
				.map((entry) => ({
					probability: clampProbability(entry?.logprob),
					token:
						typeof entry?.token === "string"
							? entry.token
							: Array.isArray(entry?.bytes)
								? String.fromCharCode(...entry.bytes)
								: "",
				}))
				.filter(
					(entry) =>
						entry.probability !== null &&
						typeof entry.token === "string" &&
						entry.token.trim().length > 0,
				)
		: [];

export const summarizeTranscriptConfidence = ({ logprobs, text }) => {
	const normalizedText = typeof text === "string" ? text.trim() : "";
	const confidenceCandidates = getConfidenceCandidates(logprobs);

	if (
		normalizedText.length === 0 ||
		normalizedText.split(/\s+/u).length < 5 ||
		confidenceCandidates.length < 5
	) {
		return null;
	}

	const probabilities = confidenceCandidates.map((entry) => entry.probability);
	const average =
		probabilities.reduce((sum, probability) => sum + probability, 0) /
		probabilities.length;
	const lowTokenRatio =
		probabilities.filter((probability) => probability < 0.2).length /
		probabilities.length;

	return {
		average,
		lowTokenRatio,
		tokenCount: probabilities.length,
	};
};

export const isLowConfidenceTranscriptLogprobs = ({ logprobs, text }) => {
	const summary = summarizeTranscriptConfidence({
		logprobs,
		text,
	});

	if (!summary) {
		return false;
	}

	return summary.average < 0.45 || summary.lowTokenRatio >= 0.6;
};
