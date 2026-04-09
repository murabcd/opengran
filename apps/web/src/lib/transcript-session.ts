import {
	compareTranscriptUtterances,
	createEmptyLiveTranscriptState,
	createTranscriptBlocksText,
	createTranscriptDisplayEntries,
	type TranscriptUtterance,
} from "@/lib/transcript";

export const createTranscriptText = (utterances: TranscriptUtterance[]) =>
	createTranscriptBlocksText(
		createTranscriptDisplayEntries({
			liveTranscript: createEmptyLiveTranscriptState(),
			utterances: [...utterances].sort(compareTranscriptUtterances),
		}),
	);
