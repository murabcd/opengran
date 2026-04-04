import {
	isTranscriptPlaceholderText,
	normalizeTranscriptText,
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
	text,
}: {
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

	return false;
};

export const isSuspiciousRefinementTranscript = ({
	candidateText,
	referenceText,
}: {
	candidateText: string;
	referenceText: string;
}) => {
	const trimmedCandidateText = candidateText.trim();

	if (!trimmedCandidateText) {
		return true;
	}

	if (
		isSuspiciousCommittedTranscriptText({
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
