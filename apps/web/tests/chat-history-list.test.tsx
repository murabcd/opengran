import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renameChatMock = vi.fn();
const toggleChatStarMock = vi.fn();
const moveChatToTrashMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const useMutationMock = vi.fn();
const TEST_NOW = new Date("2026-05-01T12:00:00.000Z").getTime();
const testTimeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

vi.mock("@workspace/ui/components/dropdown-menu", async () => {
	const React = await import("react");
	const DropdownMenuContext = React.createContext<{
		open: boolean;
		onOpenChange?: (open: boolean) => void;
	}>({
		open: false,
	});

	return {
		DropdownMenu: ({
			open = false,
			onOpenChange,
			children,
		}: React.PropsWithChildren<{
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}>) => (
			<DropdownMenuContext.Provider value={{ open, onOpenChange }}>
				{children}
			</DropdownMenuContext.Provider>
		),
		DropdownMenuContent: ({ children }: React.PropsWithChildren) => {
			const { open } = React.use(DropdownMenuContext);
			return open ? <div>{children}</div> : null;
		},
		DropdownMenuItem: ({
			children,
			onSelect,
			...props
		}: React.PropsWithChildren<
			React.ButtonHTMLAttributes<HTMLButtonElement> & {
				onSelect?: () => void;
			}
		>) => (
			<button
				type="button"
				{...props}
				onClick={() => {
					onSelect?.();
				}}
			>
				{children}
			</button>
		),
		DropdownMenuSeparator: () => <hr />,
		DropdownMenuTrigger: ({
			asChild: _asChild,
			children,
		}: React.PropsWithChildren<{ asChild?: boolean }>) => {
			const { onOpenChange } = React.use(DropdownMenuContext);
			const child = React.Children.only(children);

			if (!React.isValidElement(child)) {
				return null;
			}

			return React.cloneElement(
				child as React.ReactElement<{
					onClick?: React.MouseEventHandler;
				}>,
				{
					onClick: (event: React.MouseEvent) => {
						child.props.onClick?.(event);
						onOpenChange?.(true);
					},
				},
			);
		},
	};
});

vi.mock("@workspace/ui/components/dialog", async () => {
	const React = await import("react");
	const DialogContext = React.createContext<{ open: boolean }>({
		open: false,
	});

	return {
		Dialog: ({
			open = false,
			children,
		}: React.PropsWithChildren<{ open?: boolean }>) => (
			<DialogContext.Provider value={{ open }}>
				{children}
			</DialogContext.Provider>
		),
		DialogContent: ({ children }: React.PropsWithChildren) => {
			const { open } = React.use(DialogContext);
			return open ? <div>{children}</div> : null;
		},
		DialogDescription: ({ children }: React.PropsWithChildren) => (
			<div>{children}</div>
		),
		DialogHeader: ({ children }: React.PropsWithChildren) => (
			<div>{children}</div>
		),
		DialogTitle: ({ children }: React.PropsWithChildren) => (
			<div>{children}</div>
		),
	};
});

vi.mock("@workspace/ui/components/empty", () => ({
	Empty: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	EmptyDescription: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	EmptyHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	EmptyMedia: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	EmptyTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/skeleton", () => ({
	Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));

vi.mock("@workspace/ui/components/input", () => ({
	Input: ({
		ref,
		...props
	}: React.InputHTMLAttributes<HTMLInputElement> & {
		ref?: React.Ref<HTMLInputElement>;
	}) => <input ref={ref} {...props} />,
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
	buttonVariants: () => "",
}));

vi.mock("@workspace/ui/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

vi.mock("@/lib/chat", () => ({
	getChatId: (chat: { _id: string }) => chat._id,
}));

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
}));

vi.mock("../src/hooks/use-active-workspace", () => ({
	useActiveWorkspaceId: () => "workspace-1",
}));

vi.mock("sonner", () => ({
	toast: {
		success: toastSuccessMock,
		error: toastErrorMock,
	},
}));

describe("ChatHistoryList", () => {
	beforeEach(() => {
		renameChatMock.mockReset();
		toggleChatStarMock.mockReset();
		moveChatToTrashMock.mockReset();
		toastSuccessMock.mockReset();
		toastErrorMock.mockReset();
		useMutationMock.mockReset();
		let mutationCallIndex = 0;
		useMutationMock.mockImplementation(() => {
			mutationCallIndex += 1;
			const mutationPhase = ((mutationCallIndex - 1) % 3) + 1;

			if (mutationPhase === 1) {
				return {
					withOptimisticUpdate:
						() =>
						async (args: {
							chatId: string;
							title?: string;
							workspaceId: string;
						}) =>
							renameChatMock(args),
				};
			}

			if (mutationPhase === 2) {
				return {
					withOptimisticUpdate:
						() => async (args: { chatId: string; workspaceId: string }) =>
							toggleChatStarMock(args),
				};
			}

			return {
				withOptimisticUpdate:
					() => async (args: { chatId: string; workspaceId: string }) =>
						moveChatToTrashMock(args),
			};
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("closes the chat actions menu when move to trash is selected", async () => {
		const { ChatHistoryList } = await import(
			"../src/components/chat/chat-history-list"
		);
		const onMoveToTrash = vi.fn();
		moveChatToTrashMock.mockResolvedValue(null);

		render(
			<ChatHistoryList
				chats={[
					{
						_id: "chat-1",
						_creationTime: TEST_NOW,
						authorName: "Murad",
						createdAt: TEST_NOW,
						title: "New chat",
						updatedAt: TEST_NOW,
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
				onPrefetchChat={vi.fn()}
				onMoveToTrash={onMoveToTrash}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Open actions for New chat" }),
		);
		expect(screen.getByRole("button", { name: "Move to trash" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));
		const confirmButtons = screen.getAllByRole("button", {
			name: "Move to trash",
		});
		const confirmButton = confirmButtons.at(-1);
		if (!confirmButton) {
			throw new Error("Expected move to trash confirmation button");
		}
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(onMoveToTrash).toHaveBeenCalledWith("chat-1");
		});
	});

	it("renames a chat from the Home page actions menu", async () => {
		const { ChatHistoryList } = await import(
			"../src/components/chat/chat-history-list"
		);
		renameChatMock.mockResolvedValue({ title: "Renamed chat" });

		render(
			<ChatHistoryList
				chats={[
					{
						_id: "chat-1",
						_creationTime: TEST_NOW,
						authorName: "Murad",
						createdAt: TEST_NOW,
						chatId: "chat-1",
						noteId: undefined,
						title: "Old chat title",
						updatedAt: TEST_NOW,
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
				onPrefetchChat={vi.fn()}
				onMoveToTrash={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Open actions for Old chat title" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Rename" }));

		const input = screen.getByDisplayValue("Old chat title");
		expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
		fireEvent.change(input, { target: { value: "Renamed chat" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(renameChatMock).toHaveBeenCalledWith({
			workspaceId: "workspace-1",
			chatId: "chat-1",
			title: "Renamed chat",
		});
		await waitFor(() => {
			expect(toastSuccessMock).toHaveBeenCalledWith("Chat renamed");
		});
	});

	it("stars a chat from the Home page actions menu", async () => {
		const { ChatHistoryList } = await import(
			"../src/components/chat/chat-history-list"
		);
		toggleChatStarMock.mockResolvedValue({ isStarred: true });

		render(
			<ChatHistoryList
				chats={[
					{
						_id: "chat-1",
						_creationTime: TEST_NOW,
						authorName: "Murad",
						createdAt: TEST_NOW,
						chatId: "chat-1",
						noteId: undefined,
						isStarred: false,
						title: "Star me",
						updatedAt: TEST_NOW,
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
				onPrefetchChat={vi.fn()}
				onMoveToTrash={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Open actions for Star me" }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Star" }));

		expect(toggleChatStarMock).toHaveBeenCalledWith({
			workspaceId: "workspace-1",
			chatId: "chat-1",
		});
		await waitFor(() => {
			expect(toastSuccessMock).toHaveBeenCalledWith("Chat starred");
		});
	});

	it("renders starred chats in a dedicated section before dated groups", async () => {
		const { ChatHistoryList } = await import(
			"../src/components/chat/chat-history-list"
		);
		const now = TEST_NOW;

		render(
			<ChatHistoryList
				chats={[
					{
						_id: "chat-starred",
						_creationTime: now,
						authorName: "Murad",
						createdAt: now,
						chatId: "chat-starred",
						noteId: undefined,
						isStarred: true,
						title: "Starred chat",
						updatedAt: now,
					} as never,
					{
						_id: "chat-today",
						_creationTime: now - 1_000,
						authorName: "Murad",
						createdAt: now - 1_000,
						chatId: "chat-today",
						noteId: undefined,
						isStarred: false,
						title: "Today chat",
						updatedAt: now - 1_000,
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
				onPrefetchChat={vi.fn()}
				onMoveToTrash={vi.fn()}
			/>,
		);

		expect(screen.getByText("Starred")).toBeTruthy();
		expect(screen.getByText("Today")).toBeTruthy();
		expect(screen.getByText("Starred chat")).toBeTruthy();
		expect(screen.getByText("Today chat")).toBeTruthy();

		const labels = Array.from(
			document.querySelectorAll(
				"div.flex.h-6.shrink-0.items-center.rounded-md.px-2.text-xs.font-medium.text-foreground\\/70",
			),
		).map((element) => element.textContent);
		expect(labels.slice(0, 2)).toEqual(["Starred", "Today"]);
	});

	it("shows the latest message time instead of the original chat creation time", async () => {
		const { ChatHistoryList } = await import(
			"../src/components/chat/chat-history-list"
		);
		const createdAt = new Date("2026-04-25T12:50:54.000Z").getTime();
		const lastMessageAt = new Date("2026-04-26T06:00:09.000Z").getTime();
		const expectedTime = testTimeFormatter.format(new Date(lastMessageAt));

		render(
			<ChatHistoryList
				chats={[
					{
						_id: "chat-1",
						_creationTime: createdAt,
						authorName: "Murad",
						createdAt,
						chatId: "chat-1",
						lastMessageAt,
						noteId: undefined,
						title: "Meeting recap",
						updatedAt: lastMessageAt,
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
				onPrefetchChat={vi.fn()}
				onMoveToTrash={vi.fn()}
			/>,
		);

		const time = screen.getByText(expectedTime);
		expect(time.getAttribute("dateTime")).toBe(
			new Date(lastMessageAt).toISOString(),
		);
	});

	it("prefetches a chat on hover and focus before opening it", async () => {
		const { ChatHistoryList } = await import(
			"../src/components/chat/chat-history-list"
		);
		const onPrefetchChat = vi.fn();

		render(
			<ChatHistoryList
				chats={[
					{
						_id: "chat-1",
						_creationTime: TEST_NOW,
						authorName: "Murad",
						createdAt: TEST_NOW,
						chatId: "chat-1",
						noteId: undefined,
						title: "Warm chat",
						updatedAt: TEST_NOW,
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
				onPrefetchChat={onPrefetchChat}
				onMoveToTrash={vi.fn()}
			/>,
		);

		const [openButton] = screen.getAllByRole("button", { name: /Warm chat/i });
		fireEvent.mouseEnter(openButton);
		fireEvent.focus(openButton);

		expect(onPrefetchChat).toHaveBeenCalledWith("chat-1");
		expect(onPrefetchChat).toHaveBeenCalledTimes(2);
	});
});
