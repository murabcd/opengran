import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptionControllerState } from "../src/lib/transcription-controller";
import type { TranscriptionSessionEvent } from "../src/lib/transcription-session-store";

const subscribeToEventsMock = vi.fn();
const useTranscriptionControlsMock = vi.fn();
const useTranscriptionSessionMock = vi.fn();

vi.mock("@workspace/ui/components/button", () => ({
	Button: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement>
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

vi.mock("@workspace/ui/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

vi.mock("../src/hooks/use-transcription-controls", () => ({
	useTranscriptionControls: useTranscriptionControlsMock,
}));

vi.mock("../src/hooks/use-transcription-session", () => ({
	useTranscriptionSession: useTranscriptionSessionMock,
}));

vi.mock("../src/lib/transcription-session-manager", () => ({
	transcriptionSessionManager: {
		store: {
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
	scopeKey: "note:1",
	systemAudioStatus: {
		sourceMode: "display-media",
		state: "ready",
	},
	utterances: [],
	...overrides,
});

describe("SpeechInput", () => {
	beforeEach(() => {
		subscribeToEventsMock.mockReset();
		useTranscriptionControlsMock.mockReset();
		useTranscriptionSessionMock.mockReset();
		subscribeToEventsMock.mockReturnValue(() => {});
		useTranscriptionControlsMock.mockReturnValue({
			detachSystemAudio: vi.fn(),
			requestSystemAudio: vi.fn(),
			start: vi.fn(async () => true),
			stop: vi.fn(async () => {}),
		});
		useTranscriptionSessionMock.mockReturnValue(createSessionState());
	});

	afterEach(() => {
		cleanup();
	});

	it("wires controller state and event subscriptions into the button UI", async () => {
		const onListeningChange = vi.fn();
		const onLiveTranscriptChange = vi.fn();
		const onSystemAudioStatusChange = vi.fn();
		const onRecoveryStatusChange = vi.fn();
		const onUtterance = vi.fn();
		const controls = {
			detachSystemAudio: vi.fn(),
			requestSystemAudio: vi.fn(),
			start: vi.fn(async () => true),
			stop: vi.fn(async () => {}),
		};
		useTranscriptionControlsMock.mockReturnValue(controls);
		useTranscriptionSessionMock.mockReturnValue(
			createSessionState({
				autoStartKey: "note-1:capture",
				liveTranscript: {
					them: {
						speaker: "them",
						startedAt: null,
						text: "",
					},
					you: {
						speaker: "you",
						startedAt: 123,
						text: "hello",
					},
				},
			}),
		);

		const { SpeechInput } = await import(
			"../src/components/ai-elements/speech-input"
		);

		render(
			<SpeechInput
				autoStartKey="note-1:capture"
				scopeKey="note:1"
				onListeningChange={onListeningChange}
				onLiveTranscriptChange={onLiveTranscriptChange}
				onRecoveryStatusChange={onRecoveryStatusChange}
				onSystemAudioStatusChange={onSystemAudioStatusChange}
				onUtterance={onUtterance}
			/>,
		);

		await waitFor(() => {
			expect(useTranscriptionControlsMock).toHaveBeenCalledWith({
				autoStartKey: "note-1:capture",
				lang: undefined,
				scopeKey: "note:1",
			});
		});
		expect(subscribeToEventsMock).toHaveBeenCalledTimes(1);
		const utteranceListener = subscribeToEventsMock.mock.calls[0]?.[0] as
			| ((event: TranscriptionSessionEvent) => void)
			| undefined;
		utteranceListener?.({
			type: "session.utterance_committed",
			utterance: {
				endedAt: 2,
				id: "u1",
				speaker: "you",
				startedAt: 1,
				text: "hello",
			},
		});
		expect(onUtterance).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "u1",
			}),
		);
		expect(onListeningChange).toHaveBeenCalledWith(false);
		expect(onLiveTranscriptChange).toHaveBeenCalledWith(
			expect.objectContaining({
				you: expect.objectContaining({
					text: "hello",
				}),
			}),
		);
		expect(onSystemAudioStatusChange).toHaveBeenCalledWith({
			sourceMode: "display-media",
			state: "ready",
		});
		expect(onRecoveryStatusChange).toHaveBeenCalledWith({
			attempt: 0,
			maxAttempts: 0,
			message: null,
			state: "idle",
		});

		fireEvent.click(screen.getByRole("button"));
		expect(controls.start).toHaveBeenCalledTimes(1);
	});

	it("stops instead of starting when the session is already listening", async () => {
		const controls = {
			detachSystemAudio: vi.fn(),
			requestSystemAudio: vi.fn(),
			start: vi.fn(async () => true),
			stop: vi.fn(async () => {}),
		};
		useTranscriptionControlsMock.mockReturnValue(controls);
		useTranscriptionSessionMock.mockReturnValue(
			createSessionState({
				isListening: true,
				phase: "listening",
			}),
		);

		const { SpeechInput } = await import(
			"../src/components/ai-elements/speech-input"
		);

		render(<SpeechInput scopeKey="note:1" />);

		fireEvent.click(screen.getByRole("button"));
		expect(controls.stop).toHaveBeenCalledTimes(1);
		expect(controls.start).not.toHaveBeenCalled();
	});
});
