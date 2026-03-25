import * as React from "react";
import { useStickyScrollToBottom } from "@/hooks/use-sticky-scroll-to-bottom";
import { useTranscriptSessionRepository } from "@/hooks/use-transcript-session-repository";
import {
	createEmptyLiveTranscriptState,
	createSystemAudioCaptureStatus,
	createTranscriptRecoveryStatus,
	formatTranscriptUtterance,
	type LiveTranscriptState,
	type SystemAudioCaptureSourceMode,
	type SystemAudioCaptureStatus,
	shouldSuppressEchoUtterance,
	type TranscriptRecoveryStatus,
	type TranscriptUtterance,
} from "@/lib/transcript";
import { refineSystemAudioTranscript } from "@/lib/transcript-refinement-service";
import { createTranscriptText } from "@/lib/transcript-session";
import type { Id } from "../../../../convex/_generated/dataModel";

type UseNoteTranscriptSessionArgs = {
	autoStartTranscription?: boolean;
	noteId: Id<"notes"> | null;
	onAutoStartTranscriptionHandled?: () => void;
	onEnhanceTranscript?: (transcript: string) => Promise<void>;
};

export const useNoteTranscriptSession = ({
	autoStartTranscription,
	noteId,
	onAutoStartTranscriptionHandled,
	onEnhanceTranscript,
}: UseNoteTranscriptSessionArgs) => {
	const [isSpeechListening, setIsSpeechListening] = React.useState(false);
	const [transcriptUtterances, setTranscriptUtterances] = React.useState<
		TranscriptUtterance[]
	>([]);
	const [liveTranscript, setLiveTranscript] =
		React.useState<LiveTranscriptState>(createEmptyLiveTranscriptState);
	const [pendingGenerateTranscript, setPendingGenerateTranscript] =
		React.useState("");
	const [systemAudioStatus, setSystemAudioStatus] =
		React.useState<SystemAudioCaptureStatus>(createSystemAudioCaptureStatus);
	const [recoveryStatus, setRecoveryStatus] =
		React.useState<TranscriptRecoveryStatus>(createTranscriptRecoveryStatus);
	const [isRefiningTranscript, setIsRefiningTranscript] = React.useState(false);
	const [transcriptRefinementError, setTranscriptRefinementError] =
		React.useState<string | null>(null);
	const [isTranscriptDraftReady, setIsTranscriptDraftReady] =
		React.useState(false);
	const [activeTranscriptSessionId, setActiveTranscriptSessionId] =
		React.useState<Id<"transcriptSessions"> | null>(null);
	const [isGeneratingNotes, startGenerateNotesTransition] =
		React.useTransition();
	const { containerRef: transcriptViewportRef } = useStickyScrollToBottom();
	const previousSpeechListeningRef = React.useRef(false);
	const previousNoteIdRef = React.useRef(noteId);
	const hasHandledAutoStartRef = React.useRef(false);
	const hasRestoredTranscriptDraftRef = React.useRef(false);
	const hasHydratedStoredTranscriptSessionRef = React.useRef(false);
	const hasLoadedTranscriptDraftContentRef = React.useRef(false);
	const transcriptUtterancesRef = React.useRef<TranscriptUtterance[]>([]);
	const transcriptSessionStartPromiseRef =
		React.useRef<Promise<Id<"transcriptSessions"> | null> | null>(null);
	const activeTranscriptSessionIdRef =
		React.useRef<Id<"transcriptSessions"> | null>(null);
	const lastCompletedTranscriptSessionIdRef =
		React.useRef<Id<"transcriptSessions"> | null>(null);
	const persistedTranscriptUtteranceIdsRef = React.useRef<Set<string>>(
		new Set(),
	);
	const queuedTranscriptUtterancesRef = React.useRef<TranscriptUtterance[]>([]);
	const sessionSystemAudioModePersistedRef =
		React.useRef<Id<"transcriptSessions"> | null>(null);
	const transcriptDraftKey = noteId ? `note:${noteId}` : "note:draft";
	const transcriptSessionRepository = useTranscriptSessionRepository(noteId);

	const orderedTranscriptUtterances = React.useMemo(
		() =>
			[...transcriptUtterances].sort((left, right) => {
				if (left.startedAt !== right.startedAt) {
					return left.startedAt - right.startedAt;
				}

				if (left.endedAt !== right.endedAt) {
					return left.endedAt - right.endedAt;
				}

				return left.id.localeCompare(right.id);
			}),
		[transcriptUtterances],
	);

	const liveTranscriptEntries = React.useMemo(
		() =>
			Object.values(liveTranscript)
				.filter((entry) => entry.text.trim())
				.sort((left, right) => {
					const leftStartedAt = left.startedAt ?? Number.MAX_SAFE_INTEGER;
					const rightStartedAt = right.startedAt ?? Number.MAX_SAFE_INTEGER;

					if (leftStartedAt !== rightStartedAt) {
						return leftStartedAt - rightStartedAt;
					}

					return left.speaker.localeCompare(right.speaker);
				}),
		[liveTranscript],
	);

	const fullTranscript = [
		...orderedTranscriptUtterances,
		...liveTranscriptEntries.map((entry) => ({
			id: `live:${entry.speaker}`,
			speaker: entry.speaker,
			text: entry.text,
			startedAt: entry.startedAt ?? Date.now(),
			endedAt: entry.startedAt ?? Date.now(),
		})),
	]
		.map(formatTranscriptUtterance)
		.filter(Boolean)
		.join("\n\n")
		.trim();

	const hasPendingGenerateTranscript = Boolean(
		pendingGenerateTranscript.trim(),
	);

	React.useEffect(() => {
		activeTranscriptSessionIdRef.current = activeTranscriptSessionId;
	}, [activeTranscriptSessionId]);

	React.useEffect(() => {
		transcriptUtterancesRef.current = transcriptUtterances;
	}, [transcriptUtterances]);

	const resetTranscriptSessionState = React.useCallback(
		({ clearDraft = false }: { clearDraft?: boolean } = {}) => {
			setIsSpeechListening(false);
			setTranscriptUtterances([]);
			setLiveTranscript(createEmptyLiveTranscriptState());
			setPendingGenerateTranscript("");
			setSystemAudioStatus(createSystemAudioCaptureStatus());
			setRecoveryStatus(createTranscriptRecoveryStatus());
			setIsRefiningTranscript(false);
			setTranscriptRefinementError(null);
			setIsTranscriptDraftReady(false);
			setActiveTranscriptSessionId(null);
			hasRestoredTranscriptDraftRef.current = false;
			hasHydratedStoredTranscriptSessionRef.current = false;
			hasLoadedTranscriptDraftContentRef.current = false;
			previousSpeechListeningRef.current = false;
			transcriptSessionStartPromiseRef.current = null;
			activeTranscriptSessionIdRef.current = null;
			lastCompletedTranscriptSessionIdRef.current = null;
			sessionSystemAudioModePersistedRef.current = null;
			persistedTranscriptUtteranceIdsRef.current = new Set();
			queuedTranscriptUtterancesRef.current = [];

			if (clearDraft) {
				void transcriptSessionRepository.clearDraft(transcriptDraftKey);
			}
		},
		[transcriptDraftKey, transcriptSessionRepository],
	);

	const persistTranscriptUtterance = React.useCallback(
		async (
			sessionId: Id<"transcriptSessions">,
			utterance: TranscriptUtterance,
			source: "live" | "refined",
		) => {
			if (persistedTranscriptUtteranceIdsRef.current.has(utterance.id)) {
				return;
			}

			await transcriptSessionRepository.appendUtterance({
				sessionId,
				source,
				utterance,
			});
			persistedTranscriptUtteranceIdsRef.current.add(utterance.id);
		},
		[transcriptSessionRepository],
	);

	const flushQueuedTranscriptUtterances = React.useCallback(
		async (sessionId: Id<"transcriptSessions">) => {
			const queuedUtterances = [...queuedTranscriptUtterancesRef.current];
			queuedTranscriptUtterancesRef.current = [];

			for (const utterance of queuedUtterances) {
				await persistTranscriptUtterance(sessionId, utterance, "live");
			}
		},
		[persistTranscriptUtterance],
	);

	const ensureTranscriptSession = React.useCallback(async () => {
		if (!noteId) {
			return null;
		}

		if (activeTranscriptSessionIdRef.current) {
			return activeTranscriptSessionIdRef.current;
		}

		if (transcriptSessionStartPromiseRef.current) {
			return await transcriptSessionStartPromiseRef.current;
		}

		persistedTranscriptUtteranceIdsRef.current = new Set();
		const nextSessionPromise = transcriptSessionRepository
			.startSession({
				noteId,
				systemAudioSourceMode:
					systemAudioStatus.state === "connected"
						? systemAudioStatus.sourceMode
						: undefined,
			})
			.then(async (sessionId) => {
				activeTranscriptSessionIdRef.current = sessionId;
				lastCompletedTranscriptSessionIdRef.current = null;
				sessionSystemAudioModePersistedRef.current =
					systemAudioStatus.state === "connected" ? sessionId : null;
				setActiveTranscriptSessionId(sessionId);
				await flushQueuedTranscriptUtterances(sessionId);
				return sessionId;
			})
			.catch((error) => {
				console.error("Failed to start transcript session", error);
				return null;
			})
			.finally(() => {
				transcriptSessionStartPromiseRef.current = null;
			});

		transcriptSessionStartPromiseRef.current = nextSessionPromise;
		return await nextSessionPromise;
	}, [
		flushQueuedTranscriptUtterances,
		noteId,
		systemAudioStatus.sourceMode,
		systemAudioStatus.state,
		transcriptSessionRepository,
	]);

	React.useEffect(() => {
		if (previousNoteIdRef.current === noteId) {
			return;
		}

		const completedTranscript =
			fullTranscript || createTranscriptText(transcriptUtterancesRef.current);
		const activeSessionId = activeTranscriptSessionIdRef.current;

		if (activeSessionId) {
			void transcriptSessionRepository
				.completeSession({
					sessionId: activeSessionId,
					finalTranscript: completedTranscript,
				})
				.catch((error) => {
					console.error(
						"Failed to complete transcript session while switching notes",
						error,
					);
				});
		}

		previousNoteIdRef.current = noteId;
		resetTranscriptSessionState();
	}, [
		fullTranscript,
		noteId,
		resetTranscriptSessionState,
		transcriptSessionRepository,
	]);

	React.useEffect(() => {
		if (hasRestoredTranscriptDraftRef.current) {
			return;
		}

		let isCancelled = false;
		hasRestoredTranscriptDraftRef.current = true;
		void transcriptSessionRepository
			.loadDraft(transcriptDraftKey)
			.then((draft) => {
				if (isCancelled || !draft) {
					return;
				}

				hasLoadedTranscriptDraftContentRef.current = true;
				persistedTranscriptUtteranceIdsRef.current = new Set(
					draft.utterances.map((utterance) => utterance.id),
				);
				setTranscriptUtterances(draft.utterances);
				setLiveTranscript(createEmptyLiveTranscriptState());
				setPendingGenerateTranscript(
					draft.pendingGenerateTranscript.trim() ||
						draft.utterances
							.map(formatTranscriptUtterance)
							.filter(Boolean)
							.join("\n\n"),
				);
			})
			.finally(() => {
				if (!isCancelled) {
					setIsTranscriptDraftReady(true);
				}
			});

		return () => {
			isCancelled = true;
		};
	}, [transcriptDraftKey, transcriptSessionRepository]);

	React.useEffect(() => {
		if (
			!isTranscriptDraftReady ||
			hasLoadedTranscriptDraftContentRef.current ||
			hasHydratedStoredTranscriptSessionRef.current ||
			isSpeechListening ||
			transcriptUtterances.length > 0 ||
			!transcriptSessionRepository.latestTranscriptSession
		) {
			return;
		}

		hasHydratedStoredTranscriptSessionRef.current = true;
		activeTranscriptSessionIdRef.current = null;
		lastCompletedTranscriptSessionIdRef.current =
			transcriptSessionRepository.latestTranscriptSession.sessionId;
		setActiveTranscriptSessionId(null);
		persistedTranscriptUtteranceIdsRef.current = new Set(
			transcriptSessionRepository.latestTranscriptSession.utterances.map(
				(utterance) => utterance.id,
			),
		);
		setTranscriptUtterances(
			transcriptSessionRepository.latestTranscriptSession.utterances,
		);
		setLiveTranscript(createEmptyLiveTranscriptState());
		setPendingGenerateTranscript(
			transcriptSessionRepository.latestTranscriptSession.finalTranscript ||
				createTranscriptText(
					transcriptSessionRepository.latestTranscriptSession.utterances,
				),
		);
		setIsRefiningTranscript(
			transcriptSessionRepository.latestTranscriptSession.refinementStatus ===
				"running",
		);
		setTranscriptRefinementError(
			transcriptSessionRepository.latestTranscriptSession.refinementError,
		);
	}, [
		isSpeechListening,
		isTranscriptDraftReady,
		transcriptSessionRepository,
		transcriptUtterances.length,
	]);

	React.useEffect(() => {
		if (!hasRestoredTranscriptDraftRef.current || !isTranscriptDraftReady) {
			return;
		}

		void transcriptSessionRepository.saveDraft({
			noteKey: transcriptDraftKey,
			utterances: transcriptUtterances,
			liveTranscript,
			pendingGenerateTranscript,
		});
	}, [
		isTranscriptDraftReady,
		liveTranscript,
		pendingGenerateTranscript,
		transcriptDraftKey,
		transcriptUtterances,
		transcriptSessionRepository,
	]);

	React.useEffect(() => {
		if (!isSpeechListening) {
			return;
		}

		void ensureTranscriptSession();
	}, [ensureTranscriptSession, isSpeechListening]);

	React.useEffect(() => {
		if (isSpeechListening && !previousSpeechListeningRef.current) {
			setLiveTranscript(createEmptyLiveTranscriptState());
			setPendingGenerateTranscript("");
			setTranscriptRefinementError(null);
		}

		if (!isSpeechListening && previousSpeechListeningRef.current) {
			const completedTranscript =
				fullTranscript || createTranscriptText(transcriptUtterancesRef.current);
			if (completedTranscript) {
				setPendingGenerateTranscript(completedTranscript);
			}

			const completedSessionId = activeTranscriptSessionIdRef.current;
			lastCompletedTranscriptSessionIdRef.current = completedSessionId;
			activeTranscriptSessionIdRef.current = null;
			setActiveTranscriptSessionId(null);
			sessionSystemAudioModePersistedRef.current = null;

			if (completedSessionId) {
				void transcriptSessionRepository
					.completeSession({
						sessionId: completedSessionId,
						finalTranscript: completedTranscript,
					})
					.catch((error) => {
						console.error("Failed to complete transcript session", error);
					});
			}
		}

		previousSpeechListeningRef.current = isSpeechListening;
	}, [fullTranscript, isSpeechListening, transcriptSessionRepository]);

	React.useEffect(() => {
		const sessionId = activeTranscriptSessionIdRef.current;

		if (
			!sessionId ||
			systemAudioStatus.state !== "connected" ||
			sessionSystemAudioModePersistedRef.current === sessionId
		) {
			return;
		}

		sessionSystemAudioModePersistedRef.current = sessionId;
		void transcriptSessionRepository
			.setSystemAudioSourceMode({
				sessionId,
				systemAudioSourceMode: systemAudioStatus.sourceMode,
			})
			.catch((error) => {
				sessionSystemAudioModePersistedRef.current = null;
				console.error(
					"Failed to persist transcript session system audio",
					error,
				);
			});
	}, [
		systemAudioStatus.sourceMode,
		systemAudioStatus.state,
		transcriptSessionRepository,
	]);

	React.useEffect(() => {
		if (!autoStartTranscription) {
			hasHandledAutoStartRef.current = false;
			return;
		}

		if (!isSpeechListening || hasHandledAutoStartRef.current) {
			return;
		}

		hasHandledAutoStartRef.current = true;
		onAutoStartTranscriptionHandled?.();
	}, [
		autoStartTranscription,
		isSpeechListening,
		onAutoStartTranscriptionHandled,
	]);

	const handleGenerateNotes = React.useCallback(() => {
		const transcript = pendingGenerateTranscript.trim();

		if (
			!transcript ||
			isGeneratingNotes ||
			isRefiningTranscript ||
			!onEnhanceTranscript
		) {
			return;
		}

		startGenerateNotesTransition(() => {
			void onEnhanceTranscript(transcript).then(() => {
				resetTranscriptSessionState({
					clearDraft: true,
				});
			});
		});
	}, [
		isGeneratingNotes,
		isRefiningTranscript,
		onEnhanceTranscript,
		pendingGenerateTranscript,
		resetTranscriptSessionState,
	]);

	const handleTranscriptUtterance = React.useCallback(
		(utterance: TranscriptUtterance) => {
			const currentUtterances = transcriptUtterancesRef.current;
			if (
				shouldSuppressEchoUtterance({
					candidate: utterance,
					utterances: currentUtterances,
				})
			) {
				return;
			}

			const nextUtterances = [...currentUtterances, utterance];
			transcriptUtterancesRef.current = nextUtterances;
			setTranscriptUtterances(nextUtterances);

			const activeSessionId = activeTranscriptSessionIdRef.current;
			if (activeSessionId) {
				void persistTranscriptUtterance(
					activeSessionId,
					utterance,
					"live",
				).catch((error) => {
					console.error("Failed to persist transcript utterance", error);
				});
				return;
			}

			queuedTranscriptUtterancesRef.current.push(utterance);
		},
		[persistTranscriptUtterance],
	);

	const handleSystemAudioRecordingReady = React.useCallback(
		async ({
			blob,
			endedAt,
			startedAt,
		}: {
			blob: Blob;
			endedAt: number;
			sourceMode: SystemAudioCaptureSourceMode;
			startedAt: number;
		}) => {
			const sessionId =
				activeTranscriptSessionIdRef.current ??
				activeTranscriptSessionId ??
				lastCompletedTranscriptSessionIdRef.current;
			const currentUtterances = transcriptUtterancesRef.current;
			const systemTrackUtterances = currentUtterances.filter(
				(utterance) =>
					utterance.speaker !== "you" &&
					utterance.startedAt <= endedAt &&
					utterance.endedAt >= startedAt,
			);

			if (!sessionId || blob.size === 0 || systemTrackUtterances.length === 0) {
				return;
			}

			setIsRefiningTranscript(true);
			setTranscriptRefinementError(null);

			try {
				await transcriptSessionRepository.setRefinementStatus({
					sessionId,
					status: "running",
				});
				const refinedTranscript = await refineSystemAudioTranscript({
					blob,
					currentUtterances,
					endedAt,
					startedAt,
				});

				if (!refinedTranscript) {
					await transcriptSessionRepository.setRefinementStatus({
						sessionId,
						status: "completed",
					});
					return;
				}

				persistedTranscriptUtteranceIdsRef.current = new Set(
					refinedTranscript.nextUtterances.map((utterance) => utterance.id),
				);
				transcriptUtterancesRef.current = refinedTranscript.nextUtterances;
				setTranscriptUtterances(refinedTranscript.nextUtterances);
				setPendingGenerateTranscript(refinedTranscript.nextTranscript);
				await transcriptSessionRepository.replaceSpeakerUtterances({
					sessionId,
					targetSpeakers: refinedTranscript.targetSpeakers,
					targetUtteranceIds: refinedTranscript.targetUtteranceIds,
					utterances: refinedTranscript.refinedUtterances,
					finalTranscript: refinedTranscript.nextTranscript,
				});
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: "Failed to refine system audio transcript.";
				console.error(message, error);
				setTranscriptRefinementError(message);
				await transcriptSessionRepository
					.setRefinementStatus({
						sessionId,
						status: "failed",
						error: message,
					})
					.catch(() => {});
			} finally {
				setIsRefiningTranscript(false);
			}
		},
		[activeTranscriptSessionId, transcriptSessionRepository],
	);

	return {
		activeTranscriptSessionId,
		autoStartKey: autoStartTranscription && noteId ? `${noteId}:capture` : null,
		captureScopeKey: noteId ? `note:${noteId}` : "note:draft",
		fullTranscript,
		handleGenerateNotes,
		hasPendingGenerateTranscript,
		isGeneratingNotes,
		isRefiningTranscript,
		isSpeechListening,
		liveTranscriptEntries,
		onLiveTranscriptChange: setLiveTranscript,
		onRecoveryStatusChange: setRecoveryStatus,
		onSystemAudioRecordingReady: handleSystemAudioRecordingReady,
		onSystemAudioStatusChange: setSystemAudioStatus,
		onTranscriptListeningChange: setIsSpeechListening,
		onTranscriptUtterance: handleTranscriptUtterance,
		orderedTranscriptUtterances,
		recoveryStatus,
		systemAudioStatus,
		transcriptRefinementError,
		transcriptViewportRef,
	};
};
