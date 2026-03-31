type TranscriptLiveSpeaker = "you" | "them";
export type TranscriptSpeaker = TranscriptLiveSpeaker;

type SystemAudioCaptureState = "unsupported" | "ready" | "connected";
export type SystemAudioCaptureSourceMode =
	| "desktop-native"
	| "display-media"
	| "unsupported";

export type SystemAudioCaptureStatus = {
	state: SystemAudioCaptureState;
	sourceMode: SystemAudioCaptureSourceMode;
};

type TranscriptRecoveryState = "idle" | "reconnecting" | "failed";

export type TranscriptRecoveryStatus = {
	state: TranscriptRecoveryState;
	attempt: number;
	maxAttempts: number;
	message: string | null;
};

export type TranscriptUtterance = {
	id: string;
	speaker: TranscriptSpeaker;
	text: string;
	startedAt: number;
	endedAt: number;
};

type LiveTranscriptEntry = {
	speaker: TranscriptLiveSpeaker;
	startedAt: number | null;
	text: string;
};

export type LiveTranscriptState = Record<
	TranscriptLiveSpeaker,
	LiveTranscriptEntry
>;

export const MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES = 25 * 1024 * 1024;

const STATIC_TRANSCRIPT_SPEAKER_LABELS: Record<TranscriptLiveSpeaker, string> =
	{
		you: "You",
		them: "Them",
	};
const getTranscriptSpeakerLabel = (speaker: TranscriptSpeaker) =>
	STATIC_TRANSCRIPT_SPEAKER_LABELS[speaker];

export const createSystemAudioCaptureStatus = (
	overrides: Partial<SystemAudioCaptureStatus> = {},
): SystemAudioCaptureStatus => ({
	state: "unsupported",
	sourceMode: "unsupported",
	...overrides,
});

export const createTranscriptRecoveryStatus = (
	overrides: Partial<TranscriptRecoveryStatus> = {},
): TranscriptRecoveryStatus => ({
	state: "idle",
	attempt: 0,
	maxAttempts: 0,
	message: null,
	...overrides,
});

export const createEmptyLiveTranscriptState = (): LiveTranscriptState => ({
	you: {
		speaker: "you",
		startedAt: null,
		text: "",
	},
	them: {
		speaker: "them",
		startedAt: null,
		text: "",
	},
});

export const compareTranscriptUtterances = (
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

const formatClockTime = (timestamp: number) =>
	new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(new Date(timestamp));

export const formatTranscriptUtterance = (
	utterance: Pick<TranscriptUtterance, "speaker" | "text" | "startedAt">,
) => {
	const trimmed = utterance.text.trim();

	if (!trimmed) {
		return "";
	}

	return `[${formatClockTime(utterance.startedAt)}] ${getTranscriptSpeakerLabel(utterance.speaker)}: ${trimmed}`;
};

const normalizeTranscriptText = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

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

export const shouldSuppressEchoUtterance = ({
	candidate,
	utterances,
}: {
	candidate: TranscriptUtterance;
	utterances: TranscriptUtterance[];
}) => {
	if (candidate.speaker !== "you") {
		return false;
	}

	const normalizedCandidate = normalizeTranscriptText(candidate.text);
	if (
		normalizedCandidate.length < 20 &&
		normalizedCandidate.split(" ").length < 4
	) {
		return false;
	}

	for (let index = utterances.length - 1; index >= 0; index -= 1) {
		const comparisonUtterance = utterances[index];

		if (comparisonUtterance.speaker === "you") {
			continue;
		}

		const timeDeltaSeconds =
			Math.abs(candidate.startedAt - comparisonUtterance.endedAt) / 1000;

		if (timeDeltaSeconds > 1.75) {
			if (comparisonUtterance.endedAt < candidate.startedAt) {
				break;
			}
			continue;
		}

		const normalizedComparison = normalizeTranscriptText(
			comparisonUtterance.text,
		);
		if (
			normalizedComparison.length < 20 &&
			normalizedComparison.split(" ").length < 4
		) {
			continue;
		}

		const similarity = computeJaccardSimilarity(
			normalizedCandidate,
			normalizedComparison,
		);

		if (
			similarity >= 0.78 ||
			normalizedCandidate.includes(normalizedComparison) ||
			normalizedComparison.includes(normalizedCandidate)
		) {
			return true;
		}
	}

	return false;
};

const splitTranscriptIntoChunks = (value: string) => {
	const normalized = value.replace(/\s+/g, " ").trim();

	if (!normalized) {
		return [];
	}

	const sentenceChunks = normalized
		.split(/(?<=[.!?…。！？])\s+/u)
		.map((chunk) => chunk.trim())
		.filter(Boolean);

	return sentenceChunks.length > 0 ? sentenceChunks : [normalized];
};

export const createRefinedSpeakerUtterances = ({
	referenceUtterances,
	refinedText,
	speaker,
}: {
	referenceUtterances: TranscriptUtterance[];
	refinedText: string;
	speaker: TranscriptSpeaker;
}) => {
	const chunks = splitTranscriptIntoChunks(refinedText);

	if (chunks.length === 0) {
		return [];
	}

	if (referenceUtterances.length === 0) {
		const timestamp = Date.now();

		return [
			{
				id: `refined:${speaker}:${timestamp}:0`,
				speaker,
				text: chunks.join(" "),
				startedAt: timestamp,
				endedAt: timestamp,
			},
		];
	}

	const targetCount = Math.min(referenceUtterances.length, chunks.length);
	const groupedChunks = Array.from(
		{ length: targetCount },
		() => [] as string[],
	);

	for (const [index, chunk] of chunks.entries()) {
		const bucketIndex = Math.min(
			targetCount - 1,
			Math.floor((index * targetCount) / chunks.length),
		);
		groupedChunks[bucketIndex].push(chunk);
	}

	return referenceUtterances
		.slice(0, targetCount)
		.map((referenceUtterance, index) => ({
			id: `refined:${speaker}:${referenceUtterance.startedAt}:${index}`,
			speaker,
			text: groupedChunks[index].join(" ").trim(),
			startedAt: referenceUtterance.startedAt,
			endedAt: referenceUtterance.endedAt,
		}))
		.filter((utterance) => utterance.text);
};
