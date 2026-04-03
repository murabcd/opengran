import * as React from "react";
import { useStickyScrollToBottom } from "@/hooks/use-sticky-scroll-to-bottom";
import { useTranscriptSessionRepository } from "@/hooks/use-transcript-session-repository";
import { useTranscriptionSession } from "@/hooks/use-transcription-session";
import {
	createEmptyLiveTranscriptState,
	createSystemAudioCaptureStatus,
	createTranscriptRecoveryStatus,
	formatTranscriptUtterance,
	type LiveTranscriptState,
	shouldSuppressEchoUtterance,
	type TranscriptUtterance,
} from "@/lib/transcript";
import {
	isSuspiciousCommittedTranscriptText,
	sanitizeLiveTranscriptStateText,
} from "@/lib/transcript-guard";
import { refineSystemAudioTranscript } from "@/lib/transcript-refinement-service";
import { createTranscriptText } from "@/lib/transcript-session";
import { transcriptionSessionManager } from "@/lib/transcription-session-manager";
import type { SystemAudioRecordingPayload } from "@/lib/transcription-session-types";
import type { Id } from "../../../../convex/_generated/dataModel";

const granolaIdleStopMs = 15 * 60 * 1000;
const granolaIdleCheckIntervalMs = 15 * 1000;

type UseNoteTranscriptSessionArgs = {
	autoStartTranscription?: boolean;
	autoGenerateNotesOnStop?: boolean;
	noteId: Id<"notes"> | null;
	onAutoStartTranscriptionHandled?: () => void;
	onEnhanceTranscript?: (transcript: string) => Promise<void>;
	stopTranscriptionWhenMeetingEnds?: boolean;
	transcriptionLanguage?: string | null;
};

const normalizeDisplayTranscriptText = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

export const useNoteTranscriptSession = ({
	autoStartTranscription,
	autoGenerateNotesOnStop,
	noteId,
	onAutoStartTranscriptionHandled,
	onEnhanceTranscript,
	stopTranscriptionWhenMeetingEnds,
	transcriptionLanguage,
}: UseNoteTranscriptSessionArgs) => {
	const [transcriptUtterances, setTranscriptUtterances] = React.useState<
		TranscriptUtterance[]
	>([]);
	const [pendingGenerateTranscript, setPendingGenerateTranscript] =
		React.useState("");
	const [isRefiningTranscript, setIsRefiningTranscript] = React.useState(false);
	const [transcriptRefinementError, setTranscriptRefinementError] =
		React.useState<string | null>(null);
	const [isTranscriptDraftReady, setIsTranscriptDraftReady] =
		React.useState(false);
	const [activeTranscriptSessionId, setActiveTranscriptSessionId] =
		React.useState<Id<"transcriptSessions"> | null>(null);
	const [isGeneratingNotes, setIsGeneratingNotes] = React.useState(false);
	const [generatedTranscriptSessionId, setGeneratedTranscriptSessionId] =
		React.useState<Id<"transcriptSessions"> | null>(null);
	const [pendingAutoStartKey, setPendingAutoStartKey] = React.useState<
		string | null
	>(null);
	const { containerRef: transcriptViewportRef } = useStickyScrollToBottom();
	const previousSpeechListeningRef = React.useRef(false);
	const previousNoteIdRef = React.useRef(noteId);
	const lastQueuedAutoStartKeyRef = React.useRef<string | null>(null);
	const hasHandledAutoStartRef = React.useRef(false);
	const shouldAutoGenerateNotesOnStopRef = React.useRef(false);
	const hasQueuedAutoGenerateNotesRef = React.useRef(false);
	const shouldStopWhenMeetingEndsRef = React.useRef(false);
	const hasSeenBrowserMeetingSignalRef = React.useRef(false);
	const hasRequestedAutomaticStopRef = React.useRef(false);
	const hasRestoredTranscriptDraftRef = React.useRef(false);
	const hasHydratedStoredTranscriptSessionRef = React.useRef(false);
	const hasLoadedTranscriptDraftContentRef = React.useRef(false);
	const loadedTranscriptDraftUpdatedAtRef = React.useRef<number | null>(null);
	const lastAudioActivityAtRef = React.useRef(Date.now());
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
	const resolvedCaptureScopeKey = noteId ? `note:${noteId}` : "note:draft";
	const [captureScopeKey, setCaptureScopeKey] = React.useState(
		resolvedCaptureScopeKey,
	);
	const transcriptDraftKey = noteId ? `note:${noteId}` : "note:draft";
	const transcriptSessionRepository = useTranscriptSessionRepository(noteId);
	const transcriptionSession = useTranscriptionSession();
	const isScopedTranscriptionSession =
		transcriptionSession.scopeKey === captureScopeKey;
	const isSpeechListening = isScopedTranscriptionSession
		? transcriptionSession.isListening
		: false;
	const systemAudioStatus = isScopedTranscriptionSession
		? transcriptionSession.systemAudioStatus
		: createSystemAudioCaptureStatus();
	const recoveryStatus = isScopedTranscriptionSession
		? transcriptionSession.recoveryStatus
		: createTranscriptRecoveryStatus();
	const liveTranscript = React.useMemo<LiveTranscriptState>(() => {
		const nextLiveTranscript = isScopedTranscriptionSession
			? transcriptionSession.liveTranscript
			: createEmptyLiveTranscriptState();

		return {
			them: {
				...nextLiveTranscript.them,
				text: sanitizeLiveTranscriptStateText({
					language: transcriptionLanguage,
					source: "systemAudio",
					text: nextLiveTranscript.them.text,
				}),
			},
			you: {
				...nextLiveTranscript.you,
				text: sanitizeLiveTranscriptStateText({
					language: transcriptionLanguage,
					source: "microphone",
					text: nextLiveTranscript.you.text,
				}),
			},
		};
	}, [
		isScopedTranscriptionSession,
		transcriptionLanguage,
		transcriptionSession.liveTranscript,
	]);

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

	const displayTranscriptEntries = React.useMemo(() => {
		const committedEntries = orderedTranscriptUtterances.map((utterance) => ({
			...utterance,
			isLive: false,
		}));
		const mergedEntries = [...committedEntries];

		for (const entry of liveTranscriptEntries) {
			const nextEntry = {
				endedAt: entry.startedAt ?? Date.now(),
				id: `live:${entry.speaker}:${entry.startedAt ?? 0}`,
				isLive: true,
				speaker: entry.speaker,
				startedAt: entry.startedAt ?? Date.now(),
				text: entry.text,
			};
			const normalizedLiveText = normalizeDisplayTranscriptText(entry.text);
			const hasCommittedReplacement = committedEntries.some((utterance) => {
				if (utterance.speaker !== entry.speaker) {
					return false;
				}

				if (
					Math.abs(
						(utterance.startedAt ?? Number.MAX_SAFE_INTEGER) -
							(entry.startedAt ?? Number.MAX_SAFE_INTEGER),
					) > 1_500
				) {
					return false;
				}

				const normalizedCommittedText = normalizeDisplayTranscriptText(
					utterance.text,
				);

				return (
					normalizedCommittedText === normalizedLiveText ||
					normalizedCommittedText.includes(normalizedLiveText) ||
					normalizedLiveText.includes(normalizedCommittedText)
				);
			});

			if (!hasCommittedReplacement) {
				mergedEntries.push(nextEntry);
			}
		}

		return mergedEntries.sort((left, right) => {
			if (left.startedAt !== right.startedAt) {
				return left.startedAt - right.startedAt;
			}

			if (left.endedAt !== right.endedAt) {
				return left.endedAt - right.endedAt;
			}

			return left.id.localeCompare(right.id);
		});
	}, [liveTranscriptEntries, orderedTranscriptUtterances]);

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
	const latestTranscriptSession =
		transcriptSessionRepository.latestTranscriptSession;
	const isTranscriptSessionReady =
		previousNoteIdRef.current === noteId &&
		isTranscriptDraftReady &&
		!transcriptSessionRepository.isLatestTranscriptSessionLoading;
	const hasGeneratedLatestTranscript = Boolean(
		latestTranscriptSession?.generatedNoteAt ||
			(latestTranscriptSession &&
				latestTranscriptSession.sessionId === generatedTranscriptSessionId),
	);

	React.useEffect(() => {
		if (isSpeechListening) {
			return;
		}

		setCaptureScopeKey((currentScopeKey) =>
			currentScopeKey === resolvedCaptureScopeKey
				? currentScopeKey
				: resolvedCaptureScopeKey,
		);
	}, [isSpeechListening, resolvedCaptureScopeKey]);

	React.useEffect(() => {
		if (autoGenerateNotesOnStop && onEnhanceTranscript) {
			shouldAutoGenerateNotesOnStopRef.current = true;
		}
	}, [autoGenerateNotesOnStop, onEnhanceTranscript]);

	React.useEffect(() => {
		if (
			!autoStartTranscription ||
			!noteId ||
			transcriptionLanguage === undefined
		) {
			lastQueuedAutoStartKeyRef.current = null;
			setPendingAutoStartKey(null);
			return;
		}

		const nextAutoStartKey = `${noteId}:capture`;

		if (lastQueuedAutoStartKeyRef.current === nextAutoStartKey) {
			return;
		}

		lastQueuedAutoStartKeyRef.current = nextAutoStartKey;
		setPendingAutoStartKey(nextAutoStartKey);
	}, [autoStartTranscription, noteId, transcriptionLanguage]);

	React.useEffect(() => {
		if (!pendingAutoStartKey) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setPendingAutoStartKey((currentValue) =>
				currentValue === pendingAutoStartKey ? null : currentValue,
			);
		}, 0);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [pendingAutoStartKey]);

	React.useEffect(() => {
		// Latch meeting-controlled auto-stop for the active capture even after
		// the route/query state is cleaned up post-start.
		if (
			stopTranscriptionWhenMeetingEnds &&
			typeof window !== "undefined" &&
			window.openGranDesktop
		) {
			shouldStopWhenMeetingEndsRef.current = true;
		}
	}, [stopTranscriptionWhenMeetingEnds]);

	React.useEffect(() => {
		if (typeof window === "undefined" || !window.openGranDesktop) {
			return;
		}

		return window.openGranDesktop.onMeetingDetectionState((state) => {
			if (state.hasBrowserMeetingSignal) {
				hasSeenBrowserMeetingSignalRef.current = true;
				shouldStopWhenMeetingEndsRef.current = true;
				return;
			}

			if (
				!shouldStopWhenMeetingEndsRef.current ||
				!hasSeenBrowserMeetingSignalRef.current ||
				!isSpeechListening ||
				hasRequestedAutomaticStopRef.current ||
				state.hasMeetingSignal
			) {
				return;
			}

			shouldStopWhenMeetingEndsRef.current = false;
			hasRequestedAutomaticStopRef.current = true;
			void transcriptionSessionManager.controller.stop();
		});
	}, [isSpeechListening]);

	React.useEffect(() => {
		activeTranscriptSessionIdRef.current = activeTranscriptSessionId;
	}, [activeTranscriptSessionId]);

	React.useEffect(() => {
		transcriptUtterancesRef.current = transcriptUtterances;
	}, [transcriptUtterances]);

	const resetTranscriptSessionState = React.useCallback(
		({ clearDraft = false }: { clearDraft?: boolean } = {}) => {
			setTranscriptUtterances([]);
			setPendingGenerateTranscript("");
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
		setGeneratedTranscriptSessionId(null);
		resetTranscriptSessionState();
	}, [
		fullTranscript,
		noteId,
		resetTranscriptSessionState,
		transcriptSessionRepository,
	]);

	React.useEffect(() => {
		let isCancelled = false;
		hasRestoredTranscriptDraftRef.current = false;
		hasLoadedTranscriptDraftContentRef.current = false;
		loadedTranscriptDraftUpdatedAtRef.current = null;
		setIsTranscriptDraftReady(false);
		void transcriptSessionRepository
			.loadDraft(transcriptDraftKey)
			.then((draft) => {
				if (isCancelled || !draft) {
					return;
				}

				hasLoadedTranscriptDraftContentRef.current = true;
				loadedTranscriptDraftUpdatedAtRef.current = draft.updatedAt;
				persistedTranscriptUtteranceIdsRef.current = new Set(
					draft.utterances.map((utterance) => utterance.id),
				);
				setTranscriptUtterances(draft.utterances);
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
					hasRestoredTranscriptDraftRef.current = true;
					setIsTranscriptDraftReady(true);
				}
			});

		return () => {
			isCancelled = true;
		};
	}, [transcriptDraftKey, transcriptSessionRepository.loadDraft]);

	React.useEffect(() => {
		const latestServerTranscript =
			latestTranscriptSession?.finalTranscript ||
			(latestTranscriptSession
				? createTranscriptText(latestTranscriptSession.utterances)
				: "");
		const hasNewerServerSnapshot =
			loadedTranscriptDraftUpdatedAtRef.current !== null &&
			latestTranscriptSession?.updatedAt >
				loadedTranscriptDraftUpdatedAtRef.current;
		const hasMoreServerUtterances = Boolean(
			latestTranscriptSession &&
				latestTranscriptSession.utterances.length > transcriptUtterances.length,
		);
		const hasLongerServerTranscript =
			latestServerTranscript.length > pendingGenerateTranscript.trim().length;
		const shouldHydrateFromServer =
			!hasHydratedStoredTranscriptSessionRef.current &&
			!isSpeechListening &&
			Boolean(latestTranscriptSession) &&
			(!hasLoadedTranscriptDraftContentRef.current ||
				latestTranscriptSession.generatedNoteAt !== null ||
				hasNewerServerSnapshot ||
				hasMoreServerUtterances ||
				hasLongerServerTranscript);

		if (
			!isTranscriptDraftReady ||
			!shouldHydrateFromServer ||
			!latestTranscriptSession
		) {
			return;
		}

		hasHydratedStoredTranscriptSessionRef.current = true;
		activeTranscriptSessionIdRef.current = null;
		lastCompletedTranscriptSessionIdRef.current =
			latestTranscriptSession.sessionId;
		setActiveTranscriptSessionId(null);
		persistedTranscriptUtteranceIdsRef.current = new Set(
			latestTranscriptSession.utterances.map((utterance) => utterance.id),
		);
		setTranscriptUtterances(latestTranscriptSession.utterances);
		setPendingGenerateTranscript(
			latestTranscriptSession.generatedNoteAt ||
				latestTranscriptSession.sessionId === generatedTranscriptSessionId
				? ""
				: latestServerTranscript,
		);
		setIsRefiningTranscript(
			latestTranscriptSession.refinementStatus === "running",
		);
		setTranscriptRefinementError(latestTranscriptSession.refinementError);
		if (hasLoadedTranscriptDraftContentRef.current) {
			void transcriptSessionRepository.clearDraft(transcriptDraftKey);
			hasLoadedTranscriptDraftContentRef.current = false;
			loadedTranscriptDraftUpdatedAtRef.current = null;
		}
	}, [
		generatedTranscriptSessionId,
		isSpeechListening,
		isTranscriptDraftReady,
		latestTranscriptSession,
		pendingGenerateTranscript,
		transcriptDraftKey,
		transcriptUtterances.length,
		transcriptSessionRepository,
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
			setPendingGenerateTranscript("");
			setTranscriptRefinementError(null);
			hasQueuedAutoGenerateNotesRef.current = false;
			hasRequestedAutomaticStopRef.current = false;
			lastAudioActivityAtRef.current = Date.now();
		}

		if (!isSpeechListening && previousSpeechListeningRef.current) {
			shouldStopWhenMeetingEndsRef.current = false;
			hasSeenBrowserMeetingSignalRef.current = false;
			hasRequestedAutomaticStopRef.current = false;
			hasQueuedAutoGenerateNotesRef.current =
				shouldAutoGenerateNotesOnStopRef.current;
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
		if (liveTranscriptEntries.some((entry) => entry.text.trim().length > 0)) {
			lastAudioActivityAtRef.current = Date.now();
		}
	}, [liveTranscriptEntries]);

	React.useEffect(() => {
		if (!isSpeechListening) {
			return;
		}

		const intervalId = window.setInterval(() => {
			if (
				hasRequestedAutomaticStopRef.current ||
				Date.now() - lastAudioActivityAtRef.current < granolaIdleStopMs
			) {
				return;
			}

			shouldStopWhenMeetingEndsRef.current = false;
			hasSeenBrowserMeetingSignalRef.current = false;
			hasRequestedAutomaticStopRef.current = true;
			void transcriptionSessionManager.controller.stop();
		}, granolaIdleCheckIntervalMs);

		return () => window.clearInterval(intervalId);
	}, [isSpeechListening]);

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

		setIsGeneratingNotes(true);
		void (async () => {
			try {
				await onEnhanceTranscript(transcript);
				const sessionId =
					lastCompletedTranscriptSessionIdRef.current ??
					activeTranscriptSessionIdRef.current;

				if (sessionId) {
					await transcriptSessionRepository.markGenerated({
						sessionId,
					});
					setGeneratedTranscriptSessionId(sessionId);
					lastCompletedTranscriptSessionIdRef.current = sessionId;
				}

				await transcriptSessionRepository.clearDraft(transcriptDraftKey);
				setPendingGenerateTranscript("");
				setTranscriptRefinementError(null);
				setActiveTranscriptSessionId(null);
				activeTranscriptSessionIdRef.current = null;
				transcriptSessionStartPromiseRef.current = null;
				sessionSystemAudioModePersistedRef.current = null;
				shouldAutoGenerateNotesOnStopRef.current = false;
			} catch (error) {
				console.error("Failed to generate notes from transcript", error);
			} finally {
				setIsGeneratingNotes(false);
			}
		})();
	}, [
		isGeneratingNotes,
		isRefiningTranscript,
		onEnhanceTranscript,
		pendingGenerateTranscript,
		transcriptDraftKey,
		transcriptSessionRepository,
	]);

	React.useEffect(() => {
		if (
			!hasQueuedAutoGenerateNotesRef.current ||
			isSpeechListening ||
			isGeneratingNotes ||
			isRefiningTranscript ||
			!hasPendingGenerateTranscript
		) {
			return;
		}

		hasQueuedAutoGenerateNotesRef.current = false;
		handleGenerateNotes();
	}, [
		handleGenerateNotes,
		hasPendingGenerateTranscript,
		isGeneratingNotes,
		isRefiningTranscript,
		isSpeechListening,
	]);

	const handleTranscriptUtterance = React.useCallback(
		(utterance: TranscriptUtterance) => {
			if (
				isSuspiciousCommittedTranscriptText({
					language: transcriptionLanguage,
					source: utterance.speaker === "them" ? "systemAudio" : "microphone",
					text: utterance.text,
				})
			) {
				return;
			}

			const currentUtterances = transcriptUtterancesRef.current;
			if (
				shouldSuppressEchoUtterance({
					candidate: utterance,
					utterances: currentUtterances,
				})
			) {
				return;
			}

			lastAudioActivityAtRef.current = Date.now();
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
		[persistTranscriptUtterance, transcriptionLanguage],
	);

	const handleSystemAudioRecordingReady = React.useCallback(
		async ({
			blob,
			chunks,
			endedAt,
			startedAt,
		}: SystemAudioRecordingPayload) => {
			const sessionId =
				activeTranscriptSessionIdRef.current ??
				activeTranscriptSessionId ??
				lastCompletedTranscriptSessionIdRef.current;
			const currentUtterances = transcriptUtterancesRef.current;
			const fallbackTranscript = createTranscriptText(currentUtterances);
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
					chunks,
					currentUtterances,
					endedAt,
					language: transcriptionLanguage,
					startedAt,
				});

				if (!refinedTranscript) {
					if (fallbackTranscript) {
						setPendingGenerateTranscript(fallbackTranscript);
					}

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
		[
			activeTranscriptSessionId,
			transcriptSessionRepository,
			transcriptionLanguage,
		],
	);

	React.useEffect(() => {
		return transcriptionSessionManager.store.subscribeToEvents((event) => {
			if (
				transcriptionSessionManager.store.getSnapshot().scopeKey !==
				captureScopeKey
			) {
				return;
			}

			if (event.type === "session.utterance_committed") {
				handleTranscriptUtterance(event.utterance);
				return;
			}

			if (event.type === "session.system_audio_recording_ready") {
				void handleSystemAudioRecordingReady(event.payload);
			}
		});
	}, [
		captureScopeKey,
		handleSystemAudioRecordingReady,
		handleTranscriptUtterance,
	]);

	return {
		activeTranscriptSessionId,
		autoStartKey: pendingAutoStartKey,
		captureScopeKey,
		fullTranscript,
		handleGenerateNotes,
		hasGeneratedLatestTranscript,
		hasPendingGenerateTranscript,
		isTranscriptSessionReady,
		isGeneratingNotes,
		isRefiningTranscript,
		isSpeechListening,
		displayTranscriptEntries,
		liveTranscriptEntries,
		orderedTranscriptUtterances,
		recoveryStatus,
		systemAudioStatus,
		transcriptRefinementError,
		transcriptViewportRef,
	};
};
