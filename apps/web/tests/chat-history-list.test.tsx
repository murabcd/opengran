import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@workspace/ui/lib/utils", () => ({
	cn: (...values: Array<string | false | null | undefined>) =>
		values.filter(Boolean).join(" "),
}));

vi.mock("@/lib/chat", () => ({
	getChatId: (chat: { _id: string }) => chat._id,
}));

describe("ChatHistoryList", () => {
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
});
