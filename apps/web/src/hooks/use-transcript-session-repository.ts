import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import type {
	LiveTranscriptState,
	SystemAudioCaptureSourceMode,
	TranscriptUtterance,
} from "@/lib/transcript";
import {
	clearTranscriptDraft,
	loadTranscriptDraft,
	saveTranscriptDraft,
} from "@/lib/transcript-draft";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type TranscriptDraftRecord = Awaited<ReturnType<typeof loadTranscriptDraft>>;

type TranscriptSessionSnapshot = {
	finalTranscript: string;
	refinementError: string | null;
	refinementStatus: "idle" | "running" | "completed" | "failed";
	sessionId: Id<"transcriptSessions">;
	utterances: TranscriptUtterance[];
};

const toTranscriptUtteranceInput = (
	utterance: TranscriptUtterance,
	source: "live" | "refined",
) => ({
	utteranceId: utterance.id,
	speaker: utterance.speaker,
	source,
	text: utterance.text,
	startedAt: utterance.startedAt,
	endedAt: utterance.endedAt,
});

export const useTranscriptSessionRepository = (noteId: Id<"notes"> | null) => {
	const startTranscriptSessionMutation = useMutation(
		api.transcriptSessions.startSession,
	);
	const appendTranscriptUtteranceMutation = useMutation(
		api.transcriptSessions.appendUtterance,
	);
	const completeTranscriptSessionMutation = useMutation(
		api.transcriptSessions.completeSession,
	);
	const setTranscriptRefinementStatusMutation = useMutation(
		api.transcriptSessions.setRefinementStatus,
	);
	const setTranscriptSessionSystemAudioSourceModeMutation = useMutation(
		api.transcriptSessions.setSystemAudioSourceMode,
	);
	const replaceTranscriptSpeakerUtterancesMutation = useMutation(
		api.transcriptSessions.replaceSpeakerUtterances,
	);
	const latestTranscriptSessionQuery = useQuery(
		api.transcriptSessions.getLatestForNote,
		noteId
			? {
					noteId,
				}
			: "skip",
	);

	const latestTranscriptSession =
		React.useMemo<TranscriptSessionSnapshot | null>(
			() =>
				latestTranscriptSessionQuery
					? {
							sessionId: latestTranscriptSessionQuery.session._id,
							finalTranscript:
								latestTranscriptSessionQuery.session.finalTranscript?.trim() ||
								"",
							refinementError:
								latestTranscriptSessionQuery.session.refinementError ?? null,
							refinementStatus:
								latestTranscriptSessionQuery.session.refinementStatus,
							utterances: latestTranscriptSessionQuery.utterances.map(
								(utterance) => ({
									id: utterance.utteranceId,
									speaker: utterance.speaker as TranscriptUtterance["speaker"],
									text: utterance.text,
									startedAt: utterance.startedAt,
									endedAt: utterance.endedAt,
								}),
							),
						}
					: null,
			[latestTranscriptSessionQuery],
		);

	const startSession = React.useCallback(
		async ({
			noteId,
			systemAudioSourceMode,
		}: {
			noteId: Id<"notes">;
			systemAudioSourceMode?: SystemAudioCaptureSourceMode;
		}) =>
			await startTranscriptSessionMutation({
				noteId,
				systemAudioSourceMode,
			}),
		[startTranscriptSessionMutation],
	);

	const appendUtterance = React.useCallback(
		async ({
			sessionId,
			source,
			utterance,
		}: {
			sessionId: Id<"transcriptSessions">;
			source: "live" | "refined";
			utterance: TranscriptUtterance;
		}) =>
			await appendTranscriptUtteranceMutation({
				sessionId,
				utterance: toTranscriptUtteranceInput(utterance, source),
			}),
		[appendTranscriptUtteranceMutation],
	);

	const completeSession = React.useCallback(
		async ({
			finalTranscript,
			sessionId,
			status,
		}: {
			finalTranscript?: string;
			sessionId: Id<"transcriptSessions">;
			status?: "capturing" | "completed" | "failed";
		}) =>
			await completeTranscriptSessionMutation({
				sessionId,
				finalTranscript,
				status,
			}),
		[completeTranscriptSessionMutation],
	);

	const setRefinementStatus = React.useCallback(
		async ({
			error,
			sessionId,
			status,
		}: {
			error?: string;
			sessionId: Id<"transcriptSessions">;
			status: "idle" | "running" | "completed" | "failed";
		}) =>
			await setTranscriptRefinementStatusMutation({
				sessionId,
				status,
				error,
			}),
		[setTranscriptRefinementStatusMutation],
	);

	const setSystemAudioSourceMode = React.useCallback(
		async ({
			sessionId,
			systemAudioSourceMode,
		}: {
			sessionId: Id<"transcriptSessions">;
			systemAudioSourceMode: SystemAudioCaptureSourceMode;
		}) =>
			await setTranscriptSessionSystemAudioSourceModeMutation({
				sessionId,
				systemAudioSourceMode,
			}),
		[setTranscriptSessionSystemAudioSourceModeMutation],
	);

	const replaceSpeakerUtterances = React.useCallback(
		async ({
			finalTranscript,
			sessionId,
			targetSpeakers,
			targetUtteranceIds,
			utterances,
		}: {
			finalTranscript?: string;
			sessionId: Id<"transcriptSessions">;
			targetSpeakers: string[];
			targetUtteranceIds?: string[];
			utterances: TranscriptUtterance[];
		}) =>
			await replaceTranscriptSpeakerUtterancesMutation({
				sessionId,
				targetSpeakers,
				targetUtteranceIds,
				utterances: utterances.map((utterance) =>
					toTranscriptUtteranceInput(utterance, "refined"),
				),
				finalTranscript,
			}),
		[replaceTranscriptSpeakerUtterancesMutation],
	);

	const loadDraft = React.useCallback(
		async (noteKey: string): Promise<TranscriptDraftRecord> =>
			await loadTranscriptDraft(noteKey),
		[],
	);

	const saveDraft = React.useCallback(
		async ({
			liveTranscript,
			noteKey,
			pendingGenerateTranscript,
			utterances,
		}: {
			liveTranscript: LiveTranscriptState;
			noteKey: string;
			pendingGenerateTranscript: string;
			utterances: TranscriptUtterance[];
		}) =>
			await saveTranscriptDraft({
				noteKey,
				utterances,
				liveTranscript,
				pendingGenerateTranscript,
			}),
		[],
	);

	const clearDraft = React.useCallback(
		async (noteKey: string) => await clearTranscriptDraft(noteKey),
		[],
	);

	return React.useMemo(
		() => ({
			appendUtterance,
			clearDraft,
			completeSession,
			latestTranscriptSession,
			loadDraft,
			replaceSpeakerUtterances,
			saveDraft,
			setRefinementStatus,
			setSystemAudioSourceMode,
			startSession,
		}),
		[
			appendUtterance,
			clearDraft,
			completeSession,
			latestTranscriptSession,
			loadDraft,
			replaceSpeakerUtterances,
			saveDraft,
			setRefinementStatus,
			setSystemAudioSourceMode,
			startSession,
		],
	);
};
