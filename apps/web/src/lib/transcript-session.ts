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

export const replaceTranscriptUtterancesLocally = ({
	currentUtterances,
	nextUtterances,
	targetUtteranceIds,
}: {
	currentUtterances: TranscriptUtterance[];
	nextUtterances: TranscriptUtterance[];
	targetUtteranceIds: string[];
}) =>
	[
		...currentUtterances.filter(
			(utterance) => !targetUtteranceIds.includes(utterance.id),
		),
		...nextUtterances,
	].sort(compareTranscriptUtterances);
