export const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";

export const REALTIME_TRANSCRIPTION_INCLUDE_FIELDS = [
	"item.input_audio_transcription.logprobs",
];

const systemAudioSources = new Set([
	"systemaudio",
	"system-audio",
	"system_audio",
]);

const transcriptionLanguageNames = {
	de: "German",
	en: "English",
	es: "Spanish",
	fi: "Finnish",
	fr: "French",
	hi: "Hindi",
	it: "Italian",
	ja: "Japanese",
	ko: "Korean",
	nl: "Dutch",
	pl: "Polish",
	pt: "Portuguese",
	ru: "Russian",
	tr: "Turkish",
	uk: "Ukrainian",
	vi: "Vietnamese",
	zh: "Chinese",
};

const transcriptPlaceholderPatterns = new Set([
	"audio unclear",
	"background noise",
	"inaudible",
	"music",
	"noise",
	"silence",
	"unintelligible",
]);

const isSystemAudioSource = (source) => {
	const normalizedSource =
		typeof source === "string" ? source.trim().toLowerCase() : "";

	return systemAudioSources.has(normalizedSource);
};

export const normalizeTranscriptText = (value) =>
	typeof value === "string"
		? value
				.toLowerCase()
				.replace(/[^\p{L}\p{N}\s]+/gu, " ")
				.replace(/\s+/g, " ")
				.trim()
		: "";

export const getTranscriptWordCount = (value) =>
	normalizeTranscriptText(value).split(" ").filter(Boolean).length;

export const isTranscriptPlaceholderText = (value) => {
	const normalizedValue = normalizeTranscriptText(value);

	if (!normalizedValue) {
		return false;
	}

	return (
		transcriptPlaceholderPatterns.has(normalizedValue) &&
		getTranscriptWordCount(normalizedValue) <= 2
	);
};

export const resolveRealtimeNoiseReductionType = (source) => {
	return isSystemAudioSource(source) ? null : "near_field";
};

export const resolveRealtimeSilenceDurationMs = (source) =>
	isSystemAudioSource(source) ? 450 : 200;

export const normalizeTranscriptionLanguage = (value) =>
	value?.split("-")[0]?.trim().toLowerCase() || null;

export const resolveRealtimeTranscriptionPrompt = ({
	language = null,
	source = null,
} = {}) => {
	const normalizedLanguage = normalizeTranscriptionLanguage(language);
	const languageName =
		normalizedLanguage && normalizedLanguage in transcriptionLanguageNames
			? transcriptionLanguageNames[normalizedLanguage]
			: null;
	const prompt = [
		languageName ? `The spoken language is ${languageName}.` : null,
		"Transcribe the spoken words in this segment as literally as possible.",
		"Do not translate, paraphrase, summarize, or complete a thought beyond the audio.",
		"Preserve punctuation and filler words when they are spoken.",
		"Prefer partial spoken wording over invented wording when the audio is unclear.",
		isSystemAudioSource(source)
			? "This audio comes from direct system playback."
			: null,
	]
		.filter(Boolean)
		.join(" ")
		.trim();

	return prompt || null;
};

export const createRealtimeTranscriptionSessionOptions = ({
	language = null,
	source = null,
} = {}) => ({
	language,
	noiseReductionType: resolveRealtimeNoiseReductionType(source),
	prompt: resolveRealtimeTranscriptionPrompt({
		language,
		source,
	}),
	silenceDurationMs: resolveRealtimeSilenceDurationMs(source),
});

export const createRealtimeTranscriptionSession = ({
	language = null,
	noiseReductionType = "near_field",
	prompt = null,
	silenceDurationMs = 200,
} = {}) => ({
	type: "transcription",
	include: REALTIME_TRANSCRIPTION_INCLUDE_FIELDS,
	audio: {
		input: {
			noise_reduction: noiseReductionType
				? {
						type: noiseReductionType,
					}
				: null,
			turn_detection: {
				type: "server_vad",
				threshold: 0.5,
				prefix_padding_ms: 300,
				silence_duration_ms: silenceDurationMs,
			},
			transcription: {
				model: TRANSCRIPTION_MODEL,
				...(prompt ? { prompt } : {}),
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

export const summarizeTranscriptConfidence = ({
	logprobs,
	source = null,
	text,
}) => {
	const normalizedText = typeof text === "string" ? text.trim() : "";
	const wordCount = getTranscriptWordCount(normalizedText);
	const confidenceCandidates = getConfidenceCandidates(logprobs);
	const minimumCandidateCount = isSystemAudioSource(source)
		? Math.max(2, Math.min(4, wordCount))
		: 5;

	if (
		normalizedText.length === 0 ||
		wordCount === 0 ||
		confidenceCandidates.length < minimumCandidateCount
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
	const veryLowTokenRatio =
		probabilities.filter((probability) => probability < 0.08).length /
		probabilities.length;
	const minProbability = Math.min(...probabilities);

	return {
		average,
		lowTokenRatio,
		minProbability,
		tokenCount: probabilities.length,
		veryLowTokenRatio,
		wordCount,
	};
};

export const isLowConfidenceTranscriptLogprobs = ({
	logprobs,
	source = null,
	text,
}) => {
	const summary = summarizeTranscriptConfidence({
		logprobs,
		source,
		text,
	});

	if (!summary) {
		return false;
	}

	if (isSystemAudioSource(source)) {
		if (summary.wordCount <= 4) {
			return (
				summary.average < 0.6 ||
				summary.lowTokenRatio >= 0.5 ||
				summary.veryLowTokenRatio >= 0.25 ||
				summary.minProbability < 0.03
			);
		}

		return (
			summary.average < 0.5 ||
			summary.lowTokenRatio >= 0.45 ||
			summary.veryLowTokenRatio >= 0.18 ||
			summary.minProbability < 0.02
		);
	}

	return summary.average < 0.45 || summary.lowTokenRatio >= 0.6;
};

export const shouldDropTranscriptForConfidence = ({
	logprobs,
	source = null,
	text,
}) => {
	const normalizedText = normalizeTranscriptText(text);

	if (!normalizedText || isTranscriptPlaceholderText(normalizedText)) {
		return true;
	}

	const summary = summarizeTranscriptConfidence({
		logprobs,
		source,
		text: normalizedText,
	});

	if (
		!summary ||
		!isLowConfidenceTranscriptLogprobs({
			logprobs,
			source,
			text: normalizedText,
		})
	) {
		return false;
	}

	if (isSystemAudioSource(source)) {
		if (summary.wordCount <= 2) {
			return true;
		}

		if (summary.wordCount <= 4) {
			return (
				summary.average < 0.58 ||
				summary.lowTokenRatio >= 0.45 ||
				summary.veryLowTokenRatio >= 0.22 ||
				summary.minProbability < 0.025
			);
		}

		if (summary.wordCount <= 10) {
			return (
				summary.average < 0.5 ||
				summary.lowTokenRatio >= 0.48 ||
				summary.veryLowTokenRatio >= 0.2 ||
				summary.minProbability < 0.018
			);
		}

		if (summary.wordCount <= 14) {
			return (
				summary.average < 0.38 &&
				(summary.lowTokenRatio >= 0.58 ||
					summary.veryLowTokenRatio >= 0.24 ||
					summary.minProbability < 0.012)
			);
		}

		return false;
	}

	return true;
};

export const shouldKeepInterruptedTranscriptTurn = ({
	logprobs,
	source = null,
	text,
}) => {
	const normalizedText = normalizeTranscriptText(text);

	if (!normalizedText || isTranscriptPlaceholderText(normalizedText)) {
		return false;
	}

	return true;
};
