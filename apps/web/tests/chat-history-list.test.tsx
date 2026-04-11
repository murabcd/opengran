import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renameChatMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const useMutationMock = vi.fn();

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
			const { open } = React.useContext(DropdownMenuContext);
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
		DropdownMenuTrigger: ({
			asChild: _asChild,
			children,
		}: React.PropsWithChildren<{ asChild?: boolean }>) => {
			const { onOpenChange } = React.useContext(DropdownMenuContext);
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
			const { open } = React.useContext(DialogContext);
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
	Input: React.forwardRef<
		HTMLInputElement,
		React.InputHTMLAttributes<HTMLInputElement>
	>((props, ref) => <input ref={ref} {...props} />),
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
		toastSuccessMock.mockReset();
		toastErrorMock.mockReset();
		useMutationMock.mockReset();
		useMutationMock.mockReturnValue({
			withOptimisticUpdate: () => renameChatMock,
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

		render(
			<ChatHistoryList
				chats={[
					{
						_id: "chat-1",
						_creationTime: Date.now(),
						authorName: "Murad",
						createdAt: Date.now(),
						title: "New chat",
						updatedAt: Date.now(),
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
				onMoveToTrash={onMoveToTrash}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Open actions for New chat" }),
		);
		expect(screen.getByRole("button", { name: "Move to trash" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));

		expect(onMoveToTrash).toHaveBeenCalledWith("chat-1");
		expect(screen.queryByRole("button", { name: "Move to trash" })).toBeNull();
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
						_creationTime: Date.now(),
						authorName: "Murad",
						createdAt: Date.now(),
						chatId: "chat-1",
						noteId: undefined,
						title: "Old chat title",
						updatedAt: Date.now(),
					} as never,
				]}
				isChatsLoading={false}
				activeChatId={null}
				onOpenChat={vi.fn()}
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
});
