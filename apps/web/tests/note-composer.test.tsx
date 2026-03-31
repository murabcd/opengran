import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useChatMock = vi.fn();
const useQueryMock = vi.fn();
const useNoteTranscriptSessionMock = vi.fn();
const useSidebarMock = vi.fn();

vi.mock("@ai-sdk/react", () => ({
	useChat: useChatMock,
}));

vi.mock("ai", () => ({
	DefaultChatTransport: class DefaultChatTransport {},
}));

vi.mock("convex/react", () => ({
	useQuery: useQueryMock,
}));

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

vi.mock("@workspace/ui/components/card", () => ({
	Card: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	CardContent: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	CardHeader: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => {
	const Div = ({
		asChild: _asChild,
		children,
		...props
	}: React.PropsWithChildren<
		React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }
	>) => <div {...props}>{children}</div>;

	return {
		DropdownMenu: Div,
		DropdownMenuContent: Div,
		DropdownMenuGroup: Div,
		DropdownMenuItem: Div,
		DropdownMenuLabel: Div,
		DropdownMenuTrigger: Div,
	};
});

vi.mock("@workspace/ui/components/sidebar", () => ({
	Sidebar: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	useSidebar: useSidebarMock,
}));

vi.mock("@workspace/ui/components/textarea", () => ({
	Textarea: React.forwardRef<
		HTMLTextAreaElement,
		React.TextareaHTMLAttributes<HTMLTextAreaElement>
	>(({ children, ...props }, ref) => (
		<textarea ref={ref} {...props}>
			{children}
		</textarea>
	)),
}));

vi.mock("@workspace/ui/components/tooltip", () => {
	const Div = ({
		asChild: _asChild,
		children,
		...props
	}: React.PropsWithChildren<
		React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }
	>) => <div {...props}>{children}</div>;

	return {
		Tooltip: Div,
		TooltipContent: Div,
		TooltipTrigger: Div,
	};
});

vi.mock("@workspace/ui/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("streamdown", () => ({
	Streamdown: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("../src/components/ai-elements/shimmer", () => ({
	ShimmerText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("../src/components/ai-elements/speech-input", () => ({
	SpeechInput: () => <button data-testid="speech-input" type="button" />,
}));

vi.mock("../src/hooks/use-note-transcript-session", () => ({
	useNoteTranscriptSession: useNoteTranscriptSessionMock,
}));

vi.mock("../src/hooks/use-sticky-scroll-to-bottom", () => ({
	useStickyScrollToBottom: () => ({
		containerRef: {
			current: null,
		},
	}),
}));

vi.mock("../src/lib/auth-client", () => ({
	authClient: {
		convex: {
			token: vi.fn(),
		},
	},
}));

describe("NoteComposer", () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		useSidebarMock.mockReturnValue({
			isMobile: false,
			rightMode: "sidebar",
			rightOpen: false,
			rightOpenMobile: false,
			setHasRightSidebar: vi.fn(),
			setRightMode: vi.fn(),
			setRightOpen: vi.fn(),
			setRightOpenMobile: vi.fn(),
		});

		useQueryMock.mockReturnValue(undefined);
		useChatMock.mockReturnValue({
			error: undefined,
			messages: [],
			sendMessage: vi.fn(),
			setMessages: vi.fn(),
			status: "ready",
			stop: vi.fn(),
		});

		useNoteTranscriptSessionMock.mockReturnValue({
			autoStartKey: null,
			captureScopeKey: "note:note-1",
			fullTranscript: "",
			handleGenerateNotes: vi.fn(),
			isGeneratingNotes: false,
			isRefiningTranscript: false,
			isSpeechListening: false,
			liveTranscriptEntries: [],
			onLiveTranscriptChange: vi.fn(),
			onRecoveryStatusChange: vi.fn(),
			onSystemAudioRecordingReady: vi.fn(),
			onSystemAudioStatusChange: vi.fn(),
			onTranscriptListeningChange: vi.fn(),
			onTranscriptUtterance: vi.fn(),
			orderedTranscriptUtterances: [],
			recoveryStatus: {
				attempt: 0,
				maxAttempts: 0,
				message: null,
				state: "idle",
			},
			systemAudioStatus: {
				sourceMode: "display-media",
				state: "idle",
			},
			transcriptRefinementError: null,
			transcriptViewportRef: {
				current: null,
			},
		});
	});

	it("shows only the send button in the composer actions when empty", async () => {
		const { NoteComposer } = await import(
			"../src/components/note/note-composer"
		);

		render(
			<NoteComposer
				noteContext={{
					noteId: "note-1",
					text: "",
					title: "New note",
				}}
			/>,
		);

		expect(screen.getByRole("button", { name: "Send message" })).toHaveProperty(
			"disabled",
			true,
		);
		expect(
			screen.queryByRole("button", { name: "Add attachments" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Audio visualization" }),
		).toBeNull();
	});

	it("keeps the full chat title accessible from the selector trigger", async () => {
		const fullTitle = "New chat for the quarterly planning table follow-up";
		let queryCall = 0;

		useQueryMock.mockImplementation(() => {
			const index = queryCall % 4;
			queryCall += 1;

			if (index === 0) {
				return [
					{
						_id: "chat-doc-1",
						_creationTime: 1,
						chatId: "chat-1",
						createdAt: 1,
						title: fullTitle,
						updatedAt: 1,
					},
				];
			}

			if (index === 1) {
				return [];
			}

			if (index === 2) {
				return {
					title: fullTitle,
				};
			}

			if (index === 3) {
				return {
					transcriptionLanguage: null,
				};
			}

			return undefined;
		});

		const { NoteComposer } = await import(
			"../src/components/note/note-composer"
		);

		render(
			<NoteComposer
				noteContext={{
					noteId: "note-1",
					text: "",
					title: "New note",
				}}
			/>,
		);

		fireEvent.focus(screen.getByRole("textbox"));

		const selector = await screen.findByRole("combobox", {
			name: "Select note chat",
		});

		expect(selector.getAttribute("title")).toBe(fullTitle);
	});

	it("closes the inline transcript panel on outside press without changing listening state", async () => {
		const onTranscriptListeningChange = vi.fn();

		useNoteTranscriptSessionMock.mockReturnValue({
			autoStartKey: null,
			captureScopeKey: "note:note-1",
			fullTranscript: "hello",
			handleGenerateNotes: vi.fn(),
			isGeneratingNotes: false,
			isRefiningTranscript: false,
			isSpeechListening: true,
			liveTranscriptEntries: [],
			onLiveTranscriptChange: vi.fn(),
			onRecoveryStatusChange: vi.fn(),
			onSystemAudioRecordingReady: vi.fn(),
			onSystemAudioStatusChange: vi.fn(),
			onTranscriptListeningChange,
			onTranscriptUtterance: vi.fn(),
			orderedTranscriptUtterances: [
				{
					endedAt: 2,
					id: "utt-1",
					speaker: "you",
					startedAt: 1,
					text: "hello",
				},
			],
			recoveryStatus: {
				attempt: 0,
				maxAttempts: 0,
				message: null,
				state: "idle",
			},
			systemAudioStatus: {
				sourceMode: "display-media",
				state: "ready",
			},
			transcriptRefinementError: null,
			transcriptViewportRef: {
				current: null,
			},
		});

		const { NoteComposer } = await import(
			"../src/components/note/note-composer"
		);

		render(
			<NoteComposer
				noteContext={{
					noteId: "note-1",
					text: "",
					title: "New note",
				}}
			/>,
		);

		const expandButtons = screen.getAllByRole("button", {
			name: "Expand speech controls",
		});

		fireEvent.click(expandButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Live transcript")).toBeDefined();
		});

		expect(screen.getByTestId("speech-input")).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Expand speech controls" }),
		).toBeDefined();

		fireEvent.pointerDown(document.body);

		await waitFor(() => {
			expect(screen.queryByText("Live transcript")).toBeNull();
		});

		expect(onTranscriptListeningChange).not.toHaveBeenCalled();
		expect(screen.getAllByTestId("speech-input").length).toBeGreaterThan(0);
	});

	it("shows only speech controls in the inline transcript panel", async () => {
		useNoteTranscriptSessionMock.mockReturnValue({
			autoStartKey: null,
			captureScopeKey: "note:note-1",
			fullTranscript: "hello",
			handleGenerateNotes: vi.fn(),
			isGeneratingNotes: false,
			isRefiningTranscript: false,
			isSpeechListening: true,
			liveTranscriptEntries: [],
			onLiveTranscriptChange: vi.fn(),
			onRecoveryStatusChange: vi.fn(),
			onSystemAudioRecordingReady: vi.fn(),
			onSystemAudioStatusChange: vi.fn(),
			onTranscriptListeningChange: vi.fn(),
			onTranscriptUtterance: vi.fn(),
			orderedTranscriptUtterances: [
				{
					endedAt: 2,
					id: "utt-1",
					speaker: "you",
					startedAt: 1,
					text: "hello",
				},
			],
			recoveryStatus: {
				attempt: 0,
				maxAttempts: 0,
				message: null,
				state: "idle",
			},
			systemAudioStatus: {
				sourceMode: "display-media",
				state: "ready",
			},
			transcriptRefinementError: null,
			transcriptViewportRef: {
				current: null,
			},
		});

		const { NoteComposer } = await import(
			"../src/components/note/note-composer"
		);

		render(
			<NoteComposer
				noteContext={{
					noteId: "note-1",
					text: "",
					title: "New note",
				}}
			/>,
		);

		fireEvent.click(
			screen.getAllByRole("button", {
				name: "Expand speech controls",
			})[0],
		);

		await waitFor(() => {
			expect(screen.getByText("Live transcript")).toBeDefined();
		});

		expect(screen.queryByPlaceholderText("Ask anything")).toBeNull();
		expect(screen.queryByPlaceholderText("Continue chat")).toBeNull();
		expect(
			screen.getByRole("button", { name: "Expand speech controls" }),
		).toBeDefined();
	});

	it("shows inline chat without speech controls", async () => {
		let queryCall = 0;

		useQueryMock.mockImplementation(() => {
			const index = queryCall % 4;
			queryCall += 1;

			if (index === 0) {
				return [
					{
						_id: "chat-doc-1",
						_creationTime: 1,
						chatId: "chat-1",
						createdAt: 1,
						title: "New chat",
						updatedAt: 1,
					},
				];
			}

			if (index === 1) {
				return [];
			}

			if (index === 2) {
				return {
					title: "New chat",
				};
			}

			if (index === 3) {
				return {
					transcriptionLanguage: null,
				};
			}

			return undefined;
		});

		const { NoteComposer } = await import(
			"../src/components/note/note-composer"
		);

		render(
			<NoteComposer
				noteContext={{
					noteId: "note-1",
					text: "",
					title: "New note",
				}}
			/>,
		);

		fireEvent.focus(screen.getByRole("textbox"));

		await waitFor(() => {
			expect(
				screen.getByRole("combobox", { name: "Select note chat" }),
			).toBeDefined();
		});

		expect(screen.getByPlaceholderText("Continue chat")).toBeDefined();
		expect(
			screen.queryByRole("button", { name: "Expand speech controls" }),
		).toBeNull();
	});

	it("moves the inline chat composer text to the left when speech controls are hidden", async () => {
		let queryCall = 0;

		useQueryMock.mockImplementation(() => {
			const index = queryCall % 4;
			queryCall += 1;

			if (index === 0) {
				return [
					{
						_id: "chat-doc-1",
						_creationTime: 1,
						chatId: "chat-1",
						createdAt: 1,
						title: "New chat",
						updatedAt: 1,
					},
				];
			}

			if (index === 1) {
				return [];
			}

			if (index === 2) {
				return {
					title: "New chat",
				};
			}

			if (index === 3) {
				return {
					transcriptionLanguage: null,
				};
			}

			return undefined;
		});

		const { NoteComposer } = await import(
			"../src/components/note/note-composer"
		);

		render(
			<NoteComposer
				noteContext={{
					noteId: "note-1",
					text: "",
					title: "New note",
				}}
			/>,
		);

		fireEvent.focus(screen.getByRole("textbox"));

		const composerInput = await screen.findByPlaceholderText("Continue chat");
		const composerFooter = composerInput.closest("form")?.parentElement;
		const reservedSpeechSpacer = [...(composerFooter?.children ?? [])].find(
			(element) =>
				element instanceof HTMLDivElement &&
				element.className.includes("w-[60px]"),
		);

		expect(composerFooter?.className).toContain("px-6 pb-4");
		expect(reservedSpeechSpacer).toBeUndefined();
	});

	it("keeps the inline transcript controls pinned to the dock position", async () => {
		useNoteTranscriptSessionMock.mockReturnValue({
			autoStartKey: null,
			captureScopeKey: "note:note-1",
			fullTranscript: "hello",
			handleGenerateNotes: vi.fn(),
			isGeneratingNotes: false,
			isRefiningTranscript: false,
			isSpeechListening: true,
			liveTranscriptEntries: [],
			onLiveTranscriptChange: vi.fn(),
			onRecoveryStatusChange: vi.fn(),
			onSystemAudioRecordingReady: vi.fn(),
			onSystemAudioStatusChange: vi.fn(),
			onTranscriptListeningChange: vi.fn(),
			onTranscriptUtterance: vi.fn(),
			orderedTranscriptUtterances: [
				{
					endedAt: 2,
					id: "utt-1",
					speaker: "you",
					startedAt: 1,
					text: "hello",
				},
			],
			recoveryStatus: {
				attempt: 0,
				maxAttempts: 0,
				message: null,
				state: "idle",
			},
			systemAudioStatus: {
				sourceMode: "display-media",
				state: "ready",
			},
			transcriptRefinementError: null,
			transcriptViewportRef: {
				current: null,
			},
		});

		const { NoteComposer } = await import(
			"../src/components/note/note-composer"
		);

		render(
			<NoteComposer
				noteContext={{
					noteId: "note-1",
					text: "",
					title: "New note",
				}}
			/>,
		);

		fireEvent.click(
			screen.getAllByRole("button", {
				name: "Expand speech controls",
			})[0],
		);

		const inlineExpand = await screen.findByRole("button", {
			name: "Expand speech controls",
		});
		const consentText = await screen.findByText(
			"Always get consent when transcribing others.",
		);
		const controlsGroup = inlineExpand.closest("div");
		const leadingArea = controlsGroup?.parentElement;
		const footerSurface = leadingArea?.parentElement;
		const footerSurfaceWrapper = footerSurface?.parentElement;

		expect(controlsGroup?.className).toContain("flex");
		expect(controlsGroup?.className).toContain("gap-1");
		expect(leadingArea?.className).toContain("flex");
		expect(leadingArea?.className).toContain("items-center");
		expect(consentText).toBeDefined();
		expect(footerSurface?.className).toContain("w-full");
		expect(footerSurface?.className).toContain("border");
		expect(footerSurface?.className).toContain("bg-card");
		expect(footerSurface?.className).toContain("grid");
		expect(footerSurfaceWrapper).not.toBeNull();
		expect(footerSurfaceWrapper?.className).toContain("px-6");
		expect(footerSurfaceWrapper?.className).toContain("pb-4");
	});
});
