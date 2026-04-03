import {
	isTranscriptPlaceholderText,
	normalizeTranscriptText,
	shouldDropTranscriptForConfidence,
} from "../../../../packages/ai/src/transcription.mjs";

const PROMPT_LEAK_PATTERNS = [
	"transcribe speech verbatim",
	"transcribe only the spoken",
	"transcribe the audio clearly",
	"preserve names, product terms",
	"preserve names, jargon",
	"domain-specific vocabulary",
	"quoted wording",
	"continue from the previous transcript segment",
	"follow instructions",
	"return an empty string",
	"output nothing",
	"context:",
] as const;

const normalizeLanguage = (value?: string | null) =>
	value?.split("-")[0]?.trim().toLowerCase() || null;

const getWordCount = (value: string) =>
	normalizeTranscriptText(value).split(" ").filter(Boolean).length;

const getTokenSet = (value: string) =>
	new Set(normalizeTranscriptText(value).split(" ").filter(Boolean));

const computeJaccardSimilarity = (left: string, right: string) => {
	const leftTokens = getTokenSet(left);
	const rightTokens = getTokenSet(right);

	if (leftTokens.size === 0 || rightTokens.size === 0) {
		return 0;
	}

	let intersection = 0;

	for (const token of leftTokens) {
		if (rightTokens.has(token)) {
			intersection += 1;
		}
	}

	const union = leftTokens.size + rightTokens.size - intersection;

	return union === 0 ? 0 : intersection / union;
};

const countLetterScripts = (value: string) => {
	let cyrillic = 0;
	let latin = 0;
	let other = 0;

	for (const character of value) {
		if (/\p{Script=Cyrillic}/u.test(character)) {
			cyrillic += 1;
			continue;
		}

		if (/\p{Script=Latin}/u.test(character)) {
			latin += 1;
			continue;
		}

		if (/\p{L}/u.test(character)) {
			other += 1;
		}
	}

	return {
		cyrillic,
		latin,
		other,
		total: cyrillic + latin + other,
	};
};

const hasConfiguredLanguageMismatch = ({
	language,
	text,
}: {
	language?: string | null;
	text: string;
}) => {
	const normalizedLanguage = normalizeLanguage(language);
	const wordCount = getWordCount(text);
	const scripts = countLetterScripts(text);

	if (scripts.total < 10 || wordCount < 2) {
		return false;
	}

	if (normalizedLanguage === "ru" || normalizedLanguage === "uk") {
		return (
			scripts.cyrillic / scripts.total < 0.45 &&
			scripts.latin > scripts.cyrillic
		);
	}

	if (normalizedLanguage === "en") {
		return (
			scripts.latin / scripts.total < 0.45 && scripts.cyrillic > scripts.latin
		);
	}

	return false;
};

export const containsTranscriptPromptLeakage = (value: string) => {
	const normalizedValue = value.trim().toLowerCase();

	if (!normalizedValue) {
		return false;
	}

	return PROMPT_LEAK_PATTERNS.some((pattern) =>
		normalizedValue.includes(pattern),
	);
};

export const isSuspiciousCommittedTranscriptText = ({
	logprobs,
	language,
	source,
	text,
}: {
	logprobs?: Array<{
		bytes?: number[];
		logprob?: number;
		token?: string;
	}> | null;
	language?: string | null;
	source?: string | null;
	text: string;
}) => {
	const trimmedText = text.trim();

	if (!trimmedText) {
		return false;
	}

	if (containsTranscriptPromptLeakage(trimmedText)) {
		return true;
	}

	if (isTranscriptPlaceholderText(trimmedText)) {
		return true;
	}

	if (
		shouldDropTranscriptForConfidence({
			logprobs,
			source,
			text: trimmedText,
		})
	) {
		return true;
	}

	return hasConfiguredLanguageMismatch({
		language,
		text: trimmedText,
	});
};

export const sanitizeLiveTranscriptStateText = ({
	language,
	source,
	text,
}: {
	language?: string | null;
	source?: string | null;
	text: string;
}) =>
	isSuspiciousCommittedTranscriptText({
		language,
		source,
		text,
	})
		? ""
		: text;

export const isSuspiciousRefinementTranscript = ({
	candidateText,
	language,
	referenceText,
}: {
	candidateText: string;
	language?: string | null;
	referenceText: string;
}) => {
	const trimmedCandidateText = candidateText.trim();

	if (!trimmedCandidateText) {
		return true;
	}

	if (
		isSuspiciousCommittedTranscriptText({
			language,
			logprobs: null,
			text: trimmedCandidateText,
		})
	) {
		return true;
	}

	const trimmedReferenceText = referenceText.trim();

	if (!trimmedReferenceText) {
		return false;
	}

	const overlap = computeJaccardSimilarity(
		trimmedCandidateText,
		trimmedReferenceText,
	);
	const candidateWords = getWordCount(trimmedCandidateText);
	const referenceWords = getWordCount(trimmedReferenceText);
	const normalizedCandidateLength =
		normalizeTranscriptText(trimmedCandidateText).length;
	const normalizedReferenceLength =
		normalizeTranscriptText(trimmedReferenceText).length;
	const isFarLonger =
		candidateWords >=
			Math.max(referenceWords + 10, Math.ceil(referenceWords * 1.8)) ||
		normalizedCandidateLength > normalizedReferenceLength * 2.2 + 80;
	const isSevereTopicDrift =
		candidateWords >= 8 && referenceWords >= 8 && overlap < 0.05;

	return (
		isSevereTopicDrift ||
		(candidateWords >= 8 &&
			referenceWords >= 6 &&
			overlap < 0.12 &&
			isFarLonger)
	);
};
