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

const isSystemAudioSource = (source) => {
	const normalizedSource =
		typeof source === "string" ? source.trim().toLowerCase() : "";

	return systemAudioSources.has(normalizedSource);
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
		"Transcribe spoken words verbatim.",
		"Do not translate or paraphrase.",
		"If the audio is unclear or low-confidence, return an empty transcript instead of guessing.",
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
