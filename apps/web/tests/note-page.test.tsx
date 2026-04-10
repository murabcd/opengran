import { cleanup, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useMutationMock = vi.fn();
const useQueryMock = vi.fn();

const chainRunMock = vi.fn();
const editorChain = {
	focus: () => editorChain,
	undo: () => editorChain,
	redo: () => editorChain,
	insertContent: () => editorChain,
	run: chainRunMock,
};

const mockEditor = {
	setEditable: vi.fn(),
	on: vi.fn(),
	off: vi.fn(),
	state: {
		schema: {},
	},
	commands: {
		setContent: vi.fn(),
	},
	getJSON: vi.fn(() => ({
		type: "doc",
		content: [{ type: "paragraph" }],
	})),
	getText: vi.fn(() => ""),
	getMarkdown: vi.fn(() => ""),
	getHTML: vi.fn(() => "<p></p>"),
	can: () => ({
		undo: () => false,
		redo: () => false,
	}),
	chain: () => editorChain,
};

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
	useQuery: useQueryMock,
}));

vi.mock("@tiptap/react", () => ({
	EditorContent: ({ className }: { className?: string }) => (
		<div data-testid="editor-content" className={className} />
	),
	useEditor: () => mockEditor,
}));

vi.mock("../src/hooks/use-active-workspace", () => ({
	useActiveWorkspaceId: () => "workspace-1",
}));

vi.mock("../src/lib/note-editor", () => ({
	EMPTY_DOCUMENT: {
		type: "doc",
		content: [{ type: "paragraph" }],
	},
	EMPTY_DOCUMENT_STRING: JSON.stringify({
		type: "doc",
		content: [{ type: "paragraph" }],
	}),
	createNoteEditorExtensions: () => [],
	handleMarkdownPaste: () => false,
	looksLikeMarkdown: () => false,
	normalizePastedPlainText: (text: string) => text,
	normalizePastedSlice: (slice: unknown) => slice,
	parseMarkdownToDocument: () => ({
		toJSON: () => ({
			content: [],
		}),
	}),
	parseStoredNoteContent: () => ({
		type: "doc",
		content: [{ type: "paragraph" }],
	}),
}));

vi.mock("../src/components/note/note-composer", () => ({
	NoteComposer: (_props: unknown) => <div data-testid="note-composer" />,
}));

vi.mock("../src/components/note/share-note", () => ({
	writeRichTextToClipboard: vi.fn(),
}));

vi.mock("streamdown", () => ({
	Streamdown: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("../src/components/ai-elements/shimmer", () => ({
	ShimmerText: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe("NotePage", () => {
	beforeEach(() => {
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
			window.setTimeout(() => callback(performance.now()), 0),
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) =>
			window.clearTimeout(id),
		);

		useQueryMock.mockReturnValue({
			_id: "note-1",
			title: "",
			content: JSON.stringify({
				type: "doc",
				content: [{ type: "paragraph" }],
			}),
			searchableText: "",
			templateSlug: null,
			calendarEventKey: undefined,
		});

		useMutationMock.mockImplementation(() => {
			const mutation = vi.fn().mockResolvedValue(undefined);
			return Object.assign(mutation, {
				withOptimisticUpdate: () => mutation,
			});
		});
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("hides the body placeholder for a new empty note", async () => {
		const { NotePage } = await import("../src/components/note/note-page");

		render(<NotePage noteId={"note-1" as never} />);

		expect(screen.getByTestId("editor-content").className).toContain(
			"note-editor--hide-placeholder",
		);
	});

	it("moves focus into the body when pressing enter in the title", async () => {
		const { NotePage } = await import("../src/components/note/note-page");

		render(<NotePage noteId={"note-1" as never} />);

		const titleInput = screen.getByLabelText("Note title");
		chainRunMock.mockClear();
		titleInput.focus();

		titleInput.dispatchEvent(
			new KeyboardEvent("keydown", {
				bubbles: true,
				key: "Enter",
			}),
		);

		expect(chainRunMock).toHaveBeenCalled();
	});
});
