import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

		fireEvent.click(
			screen.getByRole("button", { name: "Expand speech controls" }),
		);

		await waitFor(() => {
			expect(screen.getByText("Live transcript")).toBeDefined();
		});

		fireEvent.pointerDown(document.body);

		await waitFor(() => {
			expect(screen.queryByText("Live transcript")).toBeNull();
		});

		expect(onTranscriptListeningChange).not.toHaveBeenCalled();
		expect(screen.getByTestId("speech-input")).toBeDefined();
	});
});
