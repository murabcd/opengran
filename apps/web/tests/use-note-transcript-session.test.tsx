import { act, renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useTranscriptSessionRepositoryMock = vi.fn();
const stopTranscriptionSessionMock = vi.fn();

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

vi.mock("../src/lib/transcript-refinement-service", () => ({
	refineSystemAudioTranscript: vi.fn(),
}));

vi.mock("../src/lib/transcription-session-manager", () => ({
	transcriptionSessionManager: {
		controller: {
			stop: stopTranscriptionSessionMock,
		},
	},
}));

describe("useNoteTranscriptSession", () => {
	beforeEach(() => {
		vi.useRealTimers();
		useTranscriptSessionRepositoryMock.mockReset();
		stopTranscriptionSessionMock.mockReset();
		window.openGranDesktop = undefined;
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

	it("consumes note auto-start after the first emission even if the prop stays true", async () => {
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

		await act(async () => {
			result.current.onTranscriptListeningChange(false);
		});

		await act(async () => {
			await Promise.resolve();
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
			completeSession: vi.fn(),
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

		const { result } = renderHook(() =>
			useNoteTranscriptSession({
				autoStartTranscription: true,
				noteId: "note-1" as never,
				stopTranscriptionWhenMeetingEnds: true,
			}),
		);

		result.current.onTranscriptListeningChange(true);

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
			completeSession: vi.fn(),
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

		const { result } = renderHook(() =>
			useNoteTranscriptSession({
				autoStartTranscription: true,
				noteId: "note-1" as never,
				stopTranscriptionWhenMeetingEnds: true,
			}),
		);

		result.current.onTranscriptListeningChange(true);

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
			({ stopTranscriptionWhenMeetingEnds }) =>
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

		result.current.onTranscriptListeningChange(true);

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

		const { result } = renderHook(() =>
			useNoteTranscriptSession({
				autoStartTranscription: true,
				noteId: "note-1" as never,
				stopTranscriptionWhenMeetingEnds: false,
			}),
		);

		result.current.onTranscriptListeningChange(true);

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

		const { result } = renderHook(() =>
			useNoteTranscriptSession({
				noteId: "note-1" as never,
			}),
		);

		await act(async () => {
			result.current.onTranscriptListeningChange(true);
		});

		expect(result.current.isSpeechListening).toBe(true);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 15 * 1000);
		});

		expect(stopTranscriptionSessionMock).toHaveBeenCalledTimes(1);
	});
});
