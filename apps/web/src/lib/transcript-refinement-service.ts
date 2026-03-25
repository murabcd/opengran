import {
	createDiarizedSpeakerUtterances,
	createRefinedSpeakerUtterances,
	type TranscriptUtterance,
} from "@/lib/transcript";
import {
	createTranscriptText,
	replaceTranscriptUtterancesLocally,
} from "@/lib/transcript-session";

type RefineTranscriptAudioPayload = {
	error?: string;
	segments?: Array<{
		end: number;
		speaker: string;
		start: number;
		text: string;
	}>;
	text?: string;
};

type RefineSystemAudioTranscriptArgs = {
	blob: Blob;
	currentUtterances: TranscriptUtterance[];
	endedAt: number;
	startedAt: number;
};

export type RefinedSystemAudioTranscript = {
	nextTranscript: string;
	nextUtterances: TranscriptUtterance[];
	refinedUtterances: TranscriptUtterance[];
	targetSpeakers: string[];
	targetUtteranceIds: string[];
};

export const refineSystemAudioTranscript = async ({
	blob,
	currentUtterances,
	endedAt,
	startedAt,
}: RefineSystemAudioTranscriptArgs): Promise<RefinedSystemAudioTranscript | null> => {
	const systemTrackUtterances = currentUtterances.filter(
		(utterance) =>
			utterance.speaker !== "you" &&
			utterance.startedAt <= endedAt &&
			utterance.endedAt >= startedAt,
	);

	if (blob.size === 0 || systemTrackUtterances.length === 0) {
		return null;
	}

	const formData = new FormData();
	formData.append("audio", blob, "system-audio.webm");
	const response = await fetch("/api/refine-transcript-audio", {
		method: "POST",
		body: formData,
	});
	const payload = (await response
		.json()
		.catch(() => ({}))) as RefineTranscriptAudioPayload;

	if (!response.ok || !payload.text?.trim()) {
		throw new Error(
			payload.error || "Failed to refine system audio transcript.",
		);
	}

	const targetUtteranceIds = systemTrackUtterances.map(
		(utterance) => utterance.id,
	);
	const refinedUtterances =
		Array.isArray(payload.segments) && payload.segments.length > 0
			? createDiarizedSpeakerUtterances({
					recordingStartedAt: startedAt,
					recordingEndedAt: endedAt,
					segments: payload.segments,
				})
			: createRefinedSpeakerUtterances({
					referenceUtterances: systemTrackUtterances,
					refinedText: payload.text,
					speaker: "them",
				});
	const nextUtterances = replaceTranscriptUtterancesLocally({
		currentUtterances,
		nextUtterances: refinedUtterances,
		targetUtteranceIds,
	});

	return {
		nextTranscript: createTranscriptText(nextUtterances),
		nextUtterances,
		refinedUtterances,
		targetSpeakers: [
			...new Set(systemTrackUtterances.map((utterance) => utterance.speaker)),
		],
		targetUtteranceIds,
	};
};
