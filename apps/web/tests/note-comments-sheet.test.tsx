import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useConvexMock = vi.fn();
const useMutationMock = vi.fn();
const useQueryMock = vi.fn();
const convexQueryMock = vi.fn();
const writeTextToClipboardMock = vi.fn();
const functionNameSymbol = Symbol.for("functionName");

const getFunctionName = (query: unknown) =>
	typeof query === "object" && query !== null
		? (query as Record<symbol, string | undefined>)[functionNameSymbol]
		: undefined;

vi.mock("convex/react", () => ({
	useConvex: useConvexMock,
	useMutation: useMutationMock,
	useQuery: useQueryMock,
}));

vi.mock("@workspace/ui/components/avatar", () => ({
	Avatar: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	AvatarFallback: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
		<img alt="" {...props} />
	),
}));

vi.mock("@workspace/ui/components/breadcrumb", () => ({
	Breadcrumb: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLElement>>) => (
		<nav {...props}>{children}</nav>
	),
	BreadcrumbItem: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	BreadcrumbList: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	BreadcrumbPage: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLSpanElement>>) => (
		<span {...props}>{children}</span>
	),
}));

vi.mock("@workspace/ui/components/button", () => ({
	Button: ({
		asChild = false,
		children,
		type = "button",
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			asChild?: boolean;
		}
	>) =>
		asChild && React.isValidElement(children) ? (
			React.cloneElement(children, props)
		) : (
			<button type={type} {...props}>
				{children}
			</button>
		),
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => {
	const Div = ({
		asChild: _asChild,
		children,
		modal: _modal,
		onCloseAutoFocus: _onCloseAutoFocus,
		onOpenChange: _onOpenChange,
		...props
	}: React.PropsWithChildren<
		React.HTMLAttributes<HTMLDivElement> & {
			asChild?: boolean;
			modal?: boolean;
			onCloseAutoFocus?: (event: Event) => void;
			onOpenChange?: (open: boolean) => void;
		}
	>) => <div {...props}>{children}</div>;
	const Trigger = ({
		asChild: _asChild,
		children,
		...props
	}: React.PropsWithChildren<
		React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }
	>) => <div {...props}>{children}</div>;
	const Item = ({
		children,
		onClick,
		onSelect,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			onSelect?: (event: Event) => void;
		}
	>) => (
		<button
			type="button"
			{...props}
			onClick={(event) => {
				onClick?.(event);
				onSelect?.(event.nativeEvent);
			}}
		>
			{children}
		</button>
	);

	return {
		DropdownMenu: Div,
		DropdownMenuContent: Div,
		DropdownMenuItem: Item,
		DropdownMenuSeparator: Div,
		DropdownMenuTrigger: Trigger,
	};
});

vi.mock("@workspace/ui/components/empty", () => ({
	Empty: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	EmptyDescription: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => (
		<p {...props}>{children}</p>
	),
	EmptyHeader: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	EmptyMedia: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	EmptyTitle: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
		<h2 {...props}>{children}</h2>
	),
}));

vi.mock("@workspace/ui/components/input-group", () => ({
	InputGroup: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	InputGroupAddon: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	InputGroupButton: ({
		children,
		type = "button",
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement>
	>) => (
		<button type={type} {...props}>
			{children}
		</button>
	),
	InputGroupInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input data-slot="input-group-control" {...props} />
	),
	InputGroupTextarea: (
		props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
	) => <textarea data-slot="input-group-control" {...props} />,
}));

vi.mock("@workspace/ui/components/scroll-area", () => ({
	ScrollArea: ({
		children,
		viewportClassName: _viewportClassName,
		...props
	}: React.PropsWithChildren<
		React.HTMLAttributes<HTMLDivElement> & { viewportClassName?: string }
	>) => <div {...props}>{children}</div>,
}));

vi.mock("@workspace/ui/components/sheet", () => ({
	Sheet: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	SheetContent: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	SheetDescription: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => (
		<p {...props}>{children}</p>
	),
	SheetTitle: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
		<h2 {...props}>{children}</h2>
	),
}));

vi.mock("@workspace/ui/components/sidebar", () => ({
	useSidebarRight: () => ({
		hasRightSidebar: false,
		rightMode: "sidebar",
		rightOpen: false,
		rightSidebarWidth: 0,
		rightSidebarWidthOverride: undefined,
	}),
	useSidebarShell: () => ({
		state: "expanded",
	}),
}));

vi.mock("@workspace/ui/components/tooltip", () => ({
	Tooltip: ({
		children,
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div>{children}</div>
	),
	TooltipContent: ({
		children,
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({
		children,
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/hooks/use-mobile", () => ({
	useIsMobile: () => false,
}));

vi.mock("@workspace/ui/lib/panel-dimensions", () => ({
	APP_SIDEBAR_COLLAPSED_WIDTH: 64,
	APP_SIDEBAR_EXPANDED_WIDTH: 280,
}));

vi.mock("@workspace/ui/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

vi.mock("../src/components/layout/docked-panel-dimensions", () => ({
	DESKTOP_DOCKED_PANEL_DEFAULT_WIDTH: 360,
	DESKTOP_DOCKED_PANEL_MAX_WIDTH: 480,
	DESKTOP_DOCKED_PANEL_MIN_WIDTH: 280,
	MOBILE_DOCKED_PANEL_MIN_WIDTH: 280,
}));

vi.mock("../src/components/layout/docked-side-panel", () => ({
	DesktopDockedSidePanel: ({
		children,
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div>{children}</div>
	),
	DockedPanelPinButton: ({
		onTogglePinned,
	}: {
		onTogglePinned: () => void;
	}) => <button type="button" onClick={onTogglePinned} />,
	useDockedPanelInset: () => undefined,
}));

vi.mock("../src/components/layout/parse-css-length", () => ({
	parseCssLengthToPixels: () => 0,
}));

vi.mock("../src/components/layout/resizable-side-panel", () => ({
	ResizableSidePanelHandle: () => <div />,
	useResizableSidePanel: () => ({
		handleResizeKeyDown: vi.fn(),
		handleResizeStart: vi.fn(),
		isResizing: false,
		panelWidth: 360,
	}),
}));

vi.mock("../src/components/layout/use-desktop-panel-pin", () => ({
	useDesktopPanelPin: () => ({
		isPinned: false,
		togglePinned: vi.fn(),
	}),
}));

vi.mock("../src/components/note/note-comments-panel-state", () => ({
	getDesktopCommentsPanelPinnedStorageKey: () =>
		"opengran.note-comments-panel-pinned",
}));

vi.mock("../src/components/note/share-note", () => ({
	writeTextToClipboard: writeTextToClipboardMock,
}));

vi.mock("../src/hooks/use-active-workspace", () => ({
	useActiveWorkspaceId: () => "workspace-1",
}));

vi.mock("../src/lib/avatar", () => ({
	getAvatarSrc: () => null,
}));

vi.mock("../src/lib/desktop-chrome", () => ({
	DESKTOP_MAIN_HEADER_CONTENT_CLASS: "desktop-main-header",
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

describe("NoteCommentsSheet", () => {
	beforeEach(() => {
		useMutationMock.mockReturnValue(vi.fn().mockResolvedValue(null));
		useConvexMock.mockReturnValue({
			query: convexQueryMock,
		});
		convexQueryMock.mockResolvedValue({
			_id: "thread-1",
			_creationTime: 1,
			ownerTokenIdentifier: "test|owner",
			workspaceId: "workspace-1",
			noteId: "note-1",
			createdByName: "Owner",
			excerpt: "Review this section",
			isResolved: false,
			isRead: false,
			isMutedReplies: false,
			readAt: undefined,
			resolvedAt: undefined,
			resolvedByName: undefined,
			commentCount: 1,
			latestCommentPreview: "Can you clarify the decision here?",
			latestCommentIsReply: false,
			createdAt: 1,
			updatedAt: 1,
			lastCommentAt: 1,
			comments: [
				{
					_id: "comment-1",
					_creationTime: 1,
					threadId: "thread-1",
					ownerTokenIdentifier: "test|owner",
					workspaceId: "workspace-1",
					noteId: "note-1",
					authorName: "Owner",
					body: "Can you clarify the decision here?",
					createdAt: 1,
					updatedAt: 1,
				},
			],
		});
		useQueryMock.mockImplementation((query: unknown) => {
			const functionName = getFunctionName(query);

			if (functionName === "noteComments:listThreads") {
				return [
					{
						_id: "thread-1",
						_creationTime: 1,
						ownerTokenIdentifier: "test|owner",
						workspaceId: "workspace-1",
						noteId: "note-1",
						createdByName: "Owner",
						excerpt: "Review this section",
						isResolved: false,
						isRead: false,
						isMutedReplies: false,
						readAt: undefined,
						resolvedAt: undefined,
						resolvedByName: undefined,
						commentCount: 1,
						latestCommentPreview: "Can you clarify the decision here?",
						latestCommentIsReply: false,
						createdAt: 1,
						updatedAt: 1,
						lastCommentAt: 1,
					},
				];
			}

			if (functionName === "noteComments:getThread") {
				return undefined;
			}

			return undefined;
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("expands a prefetched thread from the reply zone without showing a loading placeholder", async () => {
		const { NoteCommentsSheet } = await import(
			"../src/components/note/note-comments-sheet"
		);

		const editor = {
			on: vi.fn(),
			off: vi.fn(),
			state: {
				doc: {
					descendants: (
						callback: (node: {
							marks: Array<{
								type: { name: string };
								attrs: { threadId: string };
							}>;
						}) => boolean,
					) => {
						callback({
							marks: [
								{
									type: { name: "noteComment" },
									attrs: { threadId: "thread-1" },
								},
							],
						});
					},
				},
			},
		};

		render(
			<NoteCommentsSheet
				noteId={"note-1" as never}
				noteContent="Review this section"
				editor={editor as never}
				currentUser={{
					name: "Owner",
					email: "owner@example.com",
					avatar: "",
				}}
				open
				onOpenChange={vi.fn()}
				activeThreadId={null}
				onActiveThreadIdChange={vi.fn()}
				pendingSelection={null}
				onPendingSelectionChange={vi.fn()}
			/>,
		);

		await waitFor(() => {
			expect(convexQueryMock).toHaveBeenCalled();
		});

		fireEvent.click(screen.getByText("Reply"));

		expect(await screen.findByLabelText("Reply to thread")).toBeTruthy();
		expect(screen.getByText("Can you clarify the decision here?")).toBeTruthy();
		expect(
			screen.queryByText("This discussion is no longer available."),
		).toBeNull();
	});
});
