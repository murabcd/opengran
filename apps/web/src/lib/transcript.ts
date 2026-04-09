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

type TranscriptDisplayEntry = {
	id: string;
	isLive: boolean;
	isProvisional: boolean;
	speaker: TranscriptSpeaker;
	startedAt: number;
	endedAt: number;
	text: string;
	utteranceIds: string[];
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

const TRANSCRIPT_DISPLAY_BLOCK_GAP_MS = 6_000;

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

const compareTranscriptDisplayEntries = (
	left: TranscriptDisplayEntry,
	right: TranscriptDisplayEntry,
) => {
	if (left.startedAt !== right.startedAt) {
		return left.startedAt - right.startedAt;
	}

	if (left.endedAt !== right.endedAt) {
		return left.endedAt - right.endedAt;
	}

	return left.id.localeCompare(right.id);
};

const joinTranscriptBlockText = (currentText: string, nextText: string) => {
	const normalizedCurrentText = currentText.trim();
	const normalizedNextText = nextText.trim();

	if (!normalizedCurrentText) {
		return normalizedNextText;
	}

	if (!normalizedNextText) {
		return normalizedCurrentText;
	}

	return `${normalizedCurrentText} ${normalizedNextText}`;
};

const formatTranscriptDate = (timestamp: number) =>
	new Intl.DateTimeFormat(undefined, {
		day: "numeric",
		month: "short",
	}).format(new Date(timestamp));

export const formatTranscriptElapsed = (elapsedMs: number) => {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatTranscriptDisplayEntry = (
	entry: Pick<TranscriptDisplayEntry, "speaker" | "text">,
) => {
	const trimmed = entry.text.trim();

	if (!trimmed) {
		return "";
	}

	return `${getTranscriptSpeakerLabel(entry.speaker)}: ${trimmed}`;
};

export const createTranscriptBlocksText = (
	entries: Array<Pick<TranscriptDisplayEntry, "speaker" | "text">>,
) =>
	entries.map(formatTranscriptDisplayEntry).filter(Boolean).join("\n\n").trim();

export const createTranscriptExportText = ({
	entries,
	startedAt,
}: {
	entries: Array<Pick<TranscriptDisplayEntry, "speaker" | "text">>;
	startedAt?: number | null;
}) => {
	const body = createTranscriptBlocksText(entries);

	if (!body) {
		return "";
	}

	if (startedAt == null) {
		return body;
	}

	return `Date: ${formatTranscriptDate(startedAt)}\n\nTranscript:\n\n${body}`;
};

export const createLiveTranscriptEntries = (
	liveTranscript: LiveTranscriptState,
): TranscriptDisplayEntry[] =>
	Object.values(liveTranscript)
		.filter((entry) => entry.text.trim())
		.sort((left, right) => {
			const leftStartedAt = left.startedAt ?? Number.MAX_SAFE_INTEGER;
			const rightStartedAt = right.startedAt ?? Number.MAX_SAFE_INTEGER;

			if (leftStartedAt !== rightStartedAt) {
				return leftStartedAt - rightStartedAt;
			}

			return left.speaker.localeCompare(right.speaker);
		})
		.map((entry) => {
			const startedAt = entry.startedAt ?? Date.now();

			return {
				endedAt: startedAt,
				id: `live:${entry.speaker}:${startedAt}`,
				isLive: true,
				isProvisional: true,
				speaker: entry.speaker,
				startedAt,
				text: entry.text.trim(),
				utteranceIds: [],
			};
		});

export const createTranscriptDisplayEntries = ({
	liveTranscript,
	utterances,
}: {
	liveTranscript: LiveTranscriptState;
	utterances: TranscriptUtterance[];
}): TranscriptDisplayEntry[] => {
	const committedEntries: TranscriptDisplayEntry[] = [];

	for (const utterance of [...utterances].sort(compareTranscriptUtterances)) {
		const trimmedText = utterance.text.trim();

		if (!trimmedText) {
			continue;
		}

		const previousEntry = committedEntries.at(-1);

		if (
			previousEntry &&
			!previousEntry.isLive &&
			previousEntry.speaker === utterance.speaker &&
			utterance.startedAt - previousEntry.endedAt <=
				TRANSCRIPT_DISPLAY_BLOCK_GAP_MS
		) {
			previousEntry.endedAt = Math.max(
				previousEntry.endedAt,
				utterance.endedAt,
			);
			previousEntry.id = previousEntry.utteranceIds
				.concat(utterance.id)
				.join("|");
			previousEntry.text = joinTranscriptBlockText(
				previousEntry.text,
				trimmedText,
			);
			previousEntry.utteranceIds.push(utterance.id);
			continue;
		}

		committedEntries.push({
			endedAt: utterance.endedAt,
			id: utterance.id,
			isLive: false,
			isProvisional: false,
			speaker: utterance.speaker,
			startedAt: utterance.startedAt,
			text: trimmedText,
			utteranceIds: [utterance.id],
		});
	}

	return [
		...committedEntries,
		...createLiveTranscriptEntries(liveTranscript),
	].sort(compareTranscriptDisplayEntries);
};
