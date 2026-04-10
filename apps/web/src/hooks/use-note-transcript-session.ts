import * as React from "react";
import { useStickyScrollToBottom } from "@/hooks/use-sticky-scroll-to-bottom";
import { useTranscriptSessionRepository } from "@/hooks/use-transcript-session-repository";
import { useTranscriptionSession } from "@/hooks/use-transcription-session";
import {
	createEmptyLiveTranscriptState,
	createLiveTranscriptEntries,
	createSystemAudioCaptureStatus,
	createTranscriptBlocksText,
	createTranscriptDisplayEntries,
	createTranscriptExportText,
	createTranscriptRecoveryStatus,
	type LiveTranscriptState,
	type TranscriptUtterance,
} from "@/lib/transcript";
import { createTranscriptText } from "@/lib/transcript-session";
import { transcriptionSessionManager } from "@/lib/transcription-session-manager";
import type { Id } from "../../../../convex/_generated/dataModel";

const granolaIdleStopMs = 15 * 60 * 1000;
const granolaIdleCheckIntervalMs = 15 * 1000;

type UseNoteTranscriptSessionArgs = {
	autoStartTranscription?: boolean;
	noteId: Id<"notes"> | null;
	onAutoStartTranscriptionHandled?: () => void;
	onEnhanceTranscript?: (transcript: string) => Promise<void>;
	stopTranscriptionWhenMeetingEnds?: boolean;
	transcriptionLanguage?: string | null;
};

export const useNoteTranscriptSession = ({
	autoStartTranscription,
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
	const {
		containerRef: transcriptViewportRef,
		isAtBottom: isTranscriptViewportAtBottom,
		scrollToBottom: scrollTranscriptToBottom,
	} = useStickyScrollToBottom();
	const previousSpeechListeningRef = React.useRef(false);
	const previousNoteIdRef = React.useRef(noteId);
	const lastQueuedAutoStartKeyRef = React.useRef<string | null>(null);
	const hasHandledAutoStartRef = React.useRef(false);
	const shouldStopWhenMeetingEndsRef = React.useRef(false);
	const hasSeenBrowserMeetingSignalRef = React.useRef(false);
	const hasRequestedAutomaticStopRef = React.useRef(false);
	const hasRestoredTranscriptDraftRef = React.useRef(false);
	const hasHydratedStoredTranscriptSessionRef = React.useRef(false);
	const hasLoadedTranscriptDraftContentRef = React.useRef(false);
	const loadedTranscriptDraftUpdatedAtRef = React.useRef<number | null>(null);
	const lastAudioActivityAtRef = React.useRef(Date.now());
	const transcriptUtterancesRef = React.useRef<TranscriptUtterance[]>([]);
	const listeningStartedAtRef = React.useRef<number | null>(null);
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
	const liveTranscript = React.useMemo<LiveTranscriptState>(
		() =>
			isScopedTranscriptionSession
				? transcriptionSession.liveTranscript
				: createEmptyLiveTranscriptState(),
		[isScopedTranscriptionSession, transcriptionSession.liveTranscript],
	);

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
		() => createLiveTranscriptEntries(liveTranscript),
		[liveTranscript],
	);

	const displayTranscriptEntries = React.useMemo(
		() =>
			createTranscriptDisplayEntries({
				liveTranscript,
				utterances: orderedTranscriptUtterances,
			}),
		[liveTranscript, orderedTranscriptUtterances],
	);

	const transcriptStartedAt = React.useMemo(() => {
		const committedStartedAt =
			orderedTranscriptUtterances[0]?.startedAt ?? null;
		const liveStartedAt = liveTranscriptEntries.reduce<number | null>(
			(currentValue, entry) => {
				if (entry.startedAt == null) {
					return currentValue;
				}

				return currentValue == null
					? entry.startedAt
					: Math.min(currentValue, entry.startedAt);
			},
			null,
		);

		return (
			committedStartedAt ??
			liveStartedAt ??
			listeningStartedAtRef.current ??
			null
		);
	}, [liveTranscriptEntries, orderedTranscriptUtterances]);

	const fullTranscript = React.useMemo(
		() => createTranscriptBlocksText(displayTranscriptEntries),
		[displayTranscriptEntries],
	);

	const exportTranscript = React.useMemo(
		() =>
			createTranscriptExportText({
				entries: displayTranscriptEntries,
				startedAt: transcriptStartedAt,
			}),
		[displayTranscriptEntries, transcriptStartedAt],
	);

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
			setIsTranscriptDraftReady(false);
			setActiveTranscriptSessionId(null);
			listeningStartedAtRef.current = null;
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

		const activeSessionId = activeTranscriptSessionIdRef.current;

		if (activeSessionId) {
			void transcriptSessionRepository
				.completeSession({
					sessionId: activeSessionId,
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
	}, [noteId, resetTranscriptSessionState, transcriptSessionRepository]);

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
						createTranscriptText(draft.utterances),
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
		const latestSession = latestTranscriptSession;
		const latestServerTranscript = latestSession
			? createTranscriptText(latestSession.utterances) ||
				latestSession.finalTranscript
			: "";
		const latestSessionUpdatedAt = latestSession?.updatedAt ?? null;
		const hasNewerServerSnapshot =
			loadedTranscriptDraftUpdatedAtRef.current !== null &&
			latestSessionUpdatedAt !== null &&
			latestSessionUpdatedAt > loadedTranscriptDraftUpdatedAtRef.current;
		const hasMoreServerUtterances =
			latestSession !== null &&
			latestSession.utterances.length > transcriptUtterances.length;
		const hasLongerServerTranscript =
			latestServerTranscript.length > pendingGenerateTranscript.trim().length;
		const shouldHydrateFromServer =
			!hasHydratedStoredTranscriptSessionRef.current &&
			activeTranscriptSessionIdRef.current === null &&
			transcriptSessionStartPromiseRef.current === null &&
			!previousSpeechListeningRef.current &&
			!isSpeechListening &&
			latestSession !== null &&
			(!hasLoadedTranscriptDraftContentRef.current ||
				latestSession?.generatedNoteAt !== null ||
				hasNewerServerSnapshot ||
				hasMoreServerUtterances ||
				hasLongerServerTranscript);

		if (!isTranscriptDraftReady || !shouldHydrateFromServer || !latestSession) {
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
			listeningStartedAtRef.current = Date.now();
			setPendingGenerateTranscript("");
			hasRequestedAutomaticStopRef.current = false;
			lastAudioActivityAtRef.current = Date.now();
		}

		if (!isSpeechListening && previousSpeechListeningRef.current) {
			shouldStopWhenMeetingEndsRef.current = false;
			hasSeenBrowserMeetingSignalRef.current = false;
			hasRequestedAutomaticStopRef.current = false;
			const completedTranscript = createTranscriptText(
				transcriptUtterancesRef.current,
			);
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
					})
					.catch((error) => {
						console.error("Failed to complete transcript session", error);
					});
			}
		}

		previousSpeechListeningRef.current = isSpeechListening;
	}, [isSpeechListening, transcriptSessionRepository]);

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
		const transcript =
			pendingGenerateTranscript.trim() ||
			createTranscriptText(transcriptUtterancesRef.current);

		if (!transcript || isGeneratingNotes || !onEnhanceTranscript) {
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
				setActiveTranscriptSessionId(null);
				activeTranscriptSessionIdRef.current = null;
				transcriptSessionStartPromiseRef.current = null;
				sessionSystemAudioModePersistedRef.current = null;
			} catch (error) {
				console.error("Failed to generate notes from transcript", error);
			} finally {
				setIsGeneratingNotes(false);
			}
		})();
	}, [
		isGeneratingNotes,
		onEnhanceTranscript,
		pendingGenerateTranscript,
		transcriptDraftKey,
		transcriptSessionRepository,
	]);

	const handleTranscriptUtterance = React.useCallback(
		(utterance: TranscriptUtterance) => {
			const currentUtterances = transcriptUtterancesRef.current;
			lastAudioActivityAtRef.current = Date.now();
			const nextUtterances = [...currentUtterances, utterance];
			const nextTranscript = createTranscriptText(nextUtterances);
			transcriptUtterancesRef.current = nextUtterances;
			setTranscriptUtterances(nextUtterances);
			setPendingGenerateTranscript(nextTranscript);

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
			}
		});
	}, [captureScopeKey, handleTranscriptUtterance]);

	return {
		activeTranscriptSessionId,
		autoStartKey: pendingAutoStartKey,
		captureScopeKey,
		exportTranscript,
		fullTranscript,
		handleGenerateNotes,
		hasGeneratedLatestTranscript,
		hasPendingGenerateTranscript,
		isTranscriptSessionReady,
		isGeneratingNotes,
		isSpeechListening,
		displayTranscriptEntries,
		liveTranscriptEntries,
		orderedTranscriptUtterances,
		recoveryStatus,
		scrollTranscriptToBottom,
		systemAudioStatus,
		isTranscriptViewportAtBottom,
		transcriptStartedAt,
		transcriptViewportRef,
	};
};
