import {
	compareTranscriptUtterances,
	formatTranscriptUtterance,
	type TranscriptUtterance,
} from "@/lib/transcript";

export const createTranscriptText = (utterances: TranscriptUtterance[]) =>
	[...utterances]
		.sort(compareTranscriptUtterances)
		.map(formatTranscriptUtterance)
		.filter(Boolean)
		.join("\n\n")
		.trim();

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
