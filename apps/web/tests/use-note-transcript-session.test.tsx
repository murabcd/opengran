import { act, renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptionControllerState } from "../src/lib/transcription-controller";
import type { TranscriptionSessionEvent } from "../src/lib/transcription-session-store";

const useTranscriptSessionRepositoryMock = vi.fn();
const stopTranscriptionSessionMock = vi.fn();
const subscribeToEventsMock = vi.fn();
const useTranscriptionSessionMock = vi.fn();
const getTranscriptionSessionSnapshotMock = vi.fn();

let transcriptionSessionEventListeners = new Set<
	(event: TranscriptionSessionEvent) => void
>();
let transcriptionSessionState: TranscriptionControllerState;

vi.mock("../src/hooks/use-sticky-scroll-to-bottom", () => ({
	useStickyScrollToBottom: () => ({
		containerRef: {
			current: null,
		},
	}),
}));

vi.mock("../src/hooks/use-transcript-session-repository", () => ({
	useTranscriptSessionRepository: useTranscriptSessionRepositoryMock,
}));

vi.mock("../src/hooks/use-transcription-session", () => ({
	useTranscriptionSession: useTranscriptionSessionMock,
}));

vi.mock("../src/lib/transcription-session-manager", () => ({
	transcriptionSessionManager: {
		controller: {
			stop: stopTranscriptionSessionMock,
		},
		store: {
			getSnapshot: getTranscriptionSessionSnapshotMock,
			subscribeToEvents: subscribeToEventsMock,
		},
	},
}));

const createSessionState = (
	overrides: Partial<TranscriptionControllerState> = {},
): TranscriptionControllerState => ({
	autoStartKey: null,
	error: null,
	isAvailable: true,
	isConnecting: false,
	isListening: false,
	liveTranscript: {
		them: {
			speaker: "them",
			startedAt: null,
			text: "",
		},
		you: {
			speaker: "you",
			startedAt: null,
			text: "",
		},
	},
	phase: "idle",
	recoveryStatus: {
		attempt: 0,
		maxAttempts: 0,
		message: null,
		state: "idle",
	},
	scopeKey: "note:note-1",
	systemAudioStatus: {
		sourceMode: "display-media",
		state: "ready",
	},
	utterances: [],
	...overrides,
});

const setTranscriptionSessionState = (
	overrides: Partial<TranscriptionControllerState> = {},
) => {
	transcriptionSessionState = createSessionState(overrides);
	useTranscriptionSessionMock.mockImplementation(
		() => transcriptionSessionState,
	);
	getTranscriptionSessionSnapshotMock.mockImplementation(
		() => transcriptionSessionState,
	);
};

const emitTranscriptionSessionEvent = (event: TranscriptionSessionEvent) => {
	for (const listener of transcriptionSessionEventListeners) {
		listener(event);
	}
};

describe("useNoteTranscriptSession", () => {
	beforeEach(() => {
		vi.useRealTimers();
		useTranscriptSessionRepositoryMock.mockReset();
		stopTranscriptionSessionMock.mockReset();
		subscribeToEventsMock.mockReset();
		useTranscriptionSessionMock.mockReset();
		getTranscriptionSessionSnapshotMock.mockReset();
		transcriptionSessionEventListeners = new Set();
		window.openGranDesktop = undefined;
		subscribeToEventsMock.mockImplementation((listener) => {
			transcriptionSessionEventListeners.add(listener);
			return () => {
				transcriptionSessionEventListeners.delete(listener);
			};
		});
		setTranscriptionSessionState();
	});

	it("hydrates the latest stored transcript session in StrictMode", async () => {
		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn(),
			latestTranscriptSession: {
				sessionId: "session-1",
				finalTranscript: "[23:31:41] You: Raz, dva, tri",
				refinementError: null,
				refinementStatus: "idle",
				utterances: [
					{
						endedAt: 2,
						id: "utt-1",
						speaker: "you",
						startedAt: 1,
						text: "Raz, dva, tri",
					},
				],
			},
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn(),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result } = renderHook(
			() =>
				useNoteTranscriptSession({
					noteId: "note-1" as never,
				}),
			{
				wrapper: ({ children }: React.PropsWithChildren) => (
					<React.StrictMode>{children}</React.StrictMode>
				),
			},
		);

		await waitFor(() => {
			expect(result.current.orderedTranscriptUtterances).toHaveLength(1);
		});

		expect(result.current.fullTranscript).toContain("Raz, dva, tri");
		expect(result.current.isSpeechListening).toBe(false);
	});

	it("completes the active transcript session before hydrating a stored snapshot after listening stops", async () => {
		const completeSessionMock = vi.fn().mockResolvedValue(null);
		const startSessionMock = vi.fn().mockResolvedValue("session-live");
		let latestTranscriptSession: {
			sessionId: string;
			finalTranscript: string;
			generatedNoteAt: number | null;
			refinementError: string | null;
			refinementStatus: "idle" | "running" | "completed" | "failed";
			updatedAt: number;
			utterances: Array<{
				endedAt: number;
				id: string;
				speaker: "you" | "them";
				startedAt: number;
				text: string;
			}>;
		} | null = null;

		useTranscriptSessionRepositoryMock.mockImplementation(() => ({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: completeSessionMock,
			isLatestTranscriptSessionLoading: false,
			latestTranscriptSession,
			loadDraft: vi.fn().mockResolvedValue(null),
			markGenerated: vi.fn(),
			saveDraft: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: startSessionMock,
		}));

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		setTranscriptionSessionState({
			isListening: true,
			phase: "listening",
			scopeKey: "note:note-1",
		});

		const { result, rerender } = renderHook(() =>
			useNoteTranscriptSession({
				noteId: "note-1" as never,
			}),
		);

		await waitFor(() => {
			expect(result.current.activeTranscriptSessionId).toBe("session-live");
		});

		latestTranscriptSession = {
			sessionId: "session-live",
			finalTranscript: "",
			generatedNoteAt: null,
			refinementError: null,
			refinementStatus: "idle",
			updatedAt: 10,
			utterances: [
				{
					endedAt: 2,
					id: "utt-1",
					speaker: "you",
					startedAt: 1,
					text: "hello",
				},
			],
		};
		setTranscriptionSessionState({
			isListening: false,
			phase: "reconnecting",
			scopeKey: "note:note-1",
		});

		rerender();

		await waitFor(() => {
			expect(completeSessionMock).toHaveBeenCalledWith({
				sessionId: "session-live",
			});
		});
	});

	it("consumes note auto-start after the first emission even if the prop stays true", async () => {
		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn().mockResolvedValue(null),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-auto-start"),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result } = renderHook(() =>
			useNoteTranscriptSession({
				autoStartTranscription: true,
				noteId: "note-1" as never,
				transcriptionLanguage: null,
			}),
		);

		await waitFor(() => {
			expect(result.current.autoStartKey).toBe("note-1:capture");
		});

		await waitFor(() => {
			expect(result.current.autoStartKey).toBeNull();
		});

		expect(result.current.autoStartKey).toBeNull();
	});

	it("stops a meeting-controlled desktop capture when the browser meeting signal disappears", async () => {
		let meetingDetectionListener:
			| ((state: DesktopMeetingDetectionState) => void)
			| null = null;

		window.openGranDesktop = {
			onMeetingDetectionState: (listener) => {
				meetingDetectionListener = listener;
				return () => {
					meetingDetectionListener = null;
				};
			},
		} as Window["openGranDesktop"];

		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn().mockResolvedValue(null),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-2"),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result, rerender } = renderHook(() =>
			useNoteTranscriptSession({
				autoStartTranscription: true,
				noteId: "note-1" as never,
				stopTranscriptionWhenMeetingEnds: true,
			}),
		);

		setTranscriptionSessionState({
			isListening: true,
			phase: "listening",
		});
		rerender({
			stopTranscriptionWhenMeetingEnds: true,
		});

		await waitFor(() => {
			expect(result.current.isSpeechListening).toBe(true);
		});

		meetingDetectionListener?.({
			candidateStartedAt: Date.now(),
			confidence: 1,
			dismissedUntil: null,
			hasBrowserMeetingSignal: true,
			hasMeetingSignal: true,
			isMicrophoneActive: false,
			isSuppressed: false,
			sourceName: "Google Meet",
			status: "monitoring",
		});

		meetingDetectionListener?.({
			candidateStartedAt: null,
			confidence: 0,
			dismissedUntil: null,
			hasBrowserMeetingSignal: false,
			hasMeetingSignal: false,
			isMicrophoneActive: false,
			isSuppressed: true,
			sourceName: null,
			status: "idle",
		});

		await waitFor(() => {
			expect(stopTranscriptionSessionMock).toHaveBeenCalledTimes(1);
		});
	});

	it("keeps a meeting-controlled capture running until a browser meeting signal is seen", async () => {
		let meetingDetectionListener:
			| ((state: DesktopMeetingDetectionState) => void)
			| null = null;

		window.openGranDesktop = {
			onMeetingDetectionState: (listener) => {
				meetingDetectionListener = listener;
				return () => {
					meetingDetectionListener = null;
				};
			},
		} as Window["openGranDesktop"];

		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn().mockResolvedValue(null),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-3"),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result, rerender } = renderHook(() =>
			useNoteTranscriptSession({
				autoStartTranscription: true,
				noteId: "note-1" as never,
				stopTranscriptionWhenMeetingEnds: true,
			}),
		);

		setTranscriptionSessionState({
			isListening: true,
			phase: "listening",
		});
		rerender();

		await waitFor(() => {
			expect(result.current.isSpeechListening).toBe(true);
		});

		meetingDetectionListener?.({
			candidateStartedAt: null,
			confidence: 0,
			dismissedUntil: null,
			hasBrowserMeetingSignal: false,
			hasMeetingSignal: false,
			isMicrophoneActive: false,
			isSuppressed: true,
			sourceName: null,
			status: "idle",
		});

		await waitFor(() => {
			expect(stopTranscriptionSessionMock).not.toHaveBeenCalled();
		});
	});

	it("keeps meeting-control latched after the auto-start prop is cleared", async () => {
		let meetingDetectionListener:
			| ((state: DesktopMeetingDetectionState) => void)
			| null = null;

		window.openGranDesktop = {
			onMeetingDetectionState: (listener) => {
				meetingDetectionListener = listener;
				return () => {
					meetingDetectionListener = null;
				};
			},
		} as Window["openGranDesktop"];

		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn(),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-4"),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result, rerender } = renderHook(
			(
				{ stopTranscriptionWhenMeetingEnds } = {
					stopTranscriptionWhenMeetingEnds: true,
				},
			) =>
				useNoteTranscriptSession({
					autoStartTranscription: true,
					noteId: "note-1" as never,
					stopTranscriptionWhenMeetingEnds,
				}),
			{
				initialProps: {
					stopTranscriptionWhenMeetingEnds: true,
				},
			},
		);

		setTranscriptionSessionState({
			isListening: true,
			phase: "listening",
		});
		rerender();

		await waitFor(() => {
			expect(result.current.isSpeechListening).toBe(true);
		});

		rerender({
			stopTranscriptionWhenMeetingEnds: false,
		});

		meetingDetectionListener?.({
			candidateStartedAt: Date.now(),
			confidence: 1,
			dismissedUntil: null,
			hasBrowserMeetingSignal: true,
			hasMeetingSignal: true,
			isMicrophoneActive: false,
			isSuppressed: false,
			sourceName: "Google Meet",
			status: "monitoring",
		});

		meetingDetectionListener?.({
			candidateStartedAt: null,
			confidence: 0,
			dismissedUntil: null,
			hasBrowserMeetingSignal: false,
			hasMeetingSignal: false,
			isMicrophoneActive: false,
			isSuppressed: true,
			sourceName: null,
			status: "idle",
		});

		await waitFor(() => {
			expect(stopTranscriptionSessionMock).toHaveBeenCalledTimes(1);
		});
	});

	it("keeps a desktop capture running without meeting-control when the browser signal disappears", async () => {
		let meetingDetectionListener:
			| ((state: DesktopMeetingDetectionState) => void)
			| null = null;

		window.openGranDesktop = {
			onMeetingDetectionState: (listener) => {
				meetingDetectionListener = listener;
				return () => {
					meetingDetectionListener = null;
				};
			},
		} as Window["openGranDesktop"];

		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn(),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-5"),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result, rerender } = renderHook(() =>
			useNoteTranscriptSession({
				autoStartTranscription: true,
				noteId: "note-1" as never,
				stopTranscriptionWhenMeetingEnds: false,
			}),
		);

		setTranscriptionSessionState({
			isListening: true,
			phase: "listening",
		});
		rerender();

		await waitFor(() => {
			expect(result.current.isSpeechListening).toBe(true);
		});

		meetingDetectionListener?.({
			candidateStartedAt: null,
			confidence: 0,
			dismissedUntil: null,
			hasBrowserMeetingSignal: false,
			hasMeetingSignal: true,
			isMicrophoneActive: true,
			isSuppressed: true,
			sourceName: null,
			status: "idle",
		});

		await waitFor(() => {
			expect(stopTranscriptionSessionMock).not.toHaveBeenCalled();
		});
	});

	it("stops a capture after 15 minutes with no new audio", async () => {
		vi.useFakeTimers();

		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn(),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-6"),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result, rerender } = renderHook(() =>
			useNoteTranscriptSession({
				noteId: "note-1" as never,
			}),
		);

		setTranscriptionSessionState({
			isListening: true,
			phase: "listening",
		});
		rerender();

		expect(result.current.isSpeechListening).toBe(true);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 15 * 1000);
		});

		expect(stopTranscriptionSessionMock).toHaveBeenCalledTimes(1);
	});

	it("consumes committed utterance events directly from the transcription session store", async () => {
		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn(),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-7"),
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result } = renderHook(() =>
			useNoteTranscriptSession({
				noteId: "note-1" as never,
			}),
		);

		await act(async () => {
			emitTranscriptionSessionEvent({
				type: "session.utterance_committed",
				utterance: {
					endedAt: 2,
					id: "utt-direct",
					speaker: "you",
					startedAt: 1,
					text: "hello there",
				},
			});
		});

		await waitFor(() => {
			expect(result.current.orderedTranscriptUtterances).toHaveLength(1);
		});
		expect(result.current.fullTranscript).toContain("hello there");
	});

	it("ignores transcription events from a different capture scope", async () => {
		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn(),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-8"),
		});
		setTranscriptionSessionState({
			scopeKey: "note:other-note",
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result } = renderHook(() =>
			useNoteTranscriptSession({
				noteId: "note-1" as never,
			}),
		);

		await act(async () => {
			emitTranscriptionSessionEvent({
				type: "session.utterance_committed",
				utterance: {
					endedAt: 2,
					id: "utt-ignored",
					speaker: "you",
					startedAt: 1,
					text: "should be ignored",
				},
			});
		});

		expect(result.current.orderedTranscriptUtterances).toHaveLength(0);
	});

	it("keeps the draft capture scope latched while a note id is assigned mid-recording", async () => {
		useTranscriptSessionRepositoryMock.mockReturnValue({
			appendUtterance: vi.fn(),
			clearDraft: vi.fn(),
			completeSession: vi.fn().mockResolvedValue(null),
			latestTranscriptSession: null,
			loadDraft: vi.fn().mockResolvedValue(null),
			replaceSpeakerUtterances: vi.fn(),
			saveDraft: vi.fn(),
			setRefinementStatus: vi.fn(),
			setSystemAudioSourceMode: vi.fn(),
			startSession: vi.fn().mockResolvedValue("session-9"),
		});
		setTranscriptionSessionState({
			scopeKey: "note:draft",
		});

		const { useNoteTranscriptSession } = await import(
			"../src/hooks/use-note-transcript-session"
		);

		const { result, rerender } = renderHook(
			({ noteId }: { noteId: string | null }) =>
				useNoteTranscriptSession({
					noteId: noteId as never,
				}),
			{
				initialProps: {
					noteId: null,
				},
			},
		);

		expect(result.current.captureScopeKey).toBe("note:draft");

		setTranscriptionSessionState({
			isListening: true,
			phase: "listening",
			scopeKey: "note:draft",
		});
		rerender({
			noteId: "note-1",
		});

		await waitFor(() => {
			expect(result.current.isSpeechListening).toBe(true);
		});
		expect(result.current.captureScopeKey).toBe("note:draft");

		setTranscriptionSessionState({
			isListening: false,
			phase: "idle",
			scopeKey: "note:draft",
		});
		rerender({
			noteId: "note-1",
		});

		await waitFor(() => {
			expect(result.current.captureScopeKey).toBe("note:note-1");
		});
	});
});
