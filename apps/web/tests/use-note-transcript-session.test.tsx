import { renderHook, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useTranscriptSessionRepositoryMock = vi.fn();

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

describe("useNoteTranscriptSession", () => {
	beforeEach(() => {
		useTranscriptSessionRepositoryMock.mockReset();
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
});
