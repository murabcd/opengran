import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/ui/components/icons", () => ({
	Icons: {
		sidebarRecordingSpinner: () => <span>recording</span>,
	},
}));

vi.mock("@workspace/ui/components/sidebar", () => ({
	SidebarMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	SidebarMenuAction: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement>
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	SidebarMenuButton: ({
		children,
		onClick,
	}: React.PropsWithChildren<{
		isActive?: boolean;
		onClick?: () => void;
	}>) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	SidebarMenuItem: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("../src/components/chat/chat-actions-menu", () => ({
	ChatActionsMenu: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("../src/components/note/note-actions-menu", () => ({
	NoteActionsMenu: ({
		children,
		renameAnchor,
	}: React.PropsWithChildren<{ renameAnchor?: React.ReactNode }>) => (
		<div>
			{renameAnchor}
			{children}
		</div>
	),
}));

vi.mock("../src/components/nav/sidebar-collapsible-group", () => ({
	SidebarCollapsibleGroup: ({
		children,
		title,
	}: React.PropsWithChildren<{ title: string }>) => (
		<section>
			<h2>{title}</h2>
			{children}
		</section>
	),
}));

vi.mock("../src/lib/chat", () => ({
	getChatId: (chat: { chatId?: string; _id: string }) =>
		chat.chatId ?? chat._id,
}));

vi.mock("../src/lib/note-title", () => ({
	getNoteDisplayTitle: (title: string) => title,
}));

describe("NavStarred", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders starred notes and chats under the same sidebar section", async () => {
		const { NavStarred } = await import("../src/components/nav/nav-starred");
		const onChatSelect = vi.fn();
		const onNoteSelect = vi.fn();

		render(
			<NavStarred
				chats={[
					{
						_id: "chat-1",
						chatId: "chat-1",
						title: "Starred chat",
						isStarred: true,
						updatedAt: 2,
					} as never,
				]}
				notes={[
					{
						_id: "note-1",
						title: "Starred note",
						isStarred: true,
						updatedAt: 1,
					} as never,
				]}
				currentChatId={null}
				currentNoteId={null}
				recordingNoteId={null}
				onChatSelect={onChatSelect}
				onNotePrefetch={vi.fn()}
				onNoteSelect={onNoteSelect}
			/>,
		);

		expect(screen.getByText("Starred")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Starred chat" }));
		fireEvent.click(screen.getByRole("button", { name: "Starred note" }));

		expect(onChatSelect).toHaveBeenCalledWith("chat-1");
		expect(onNoteSelect).toHaveBeenCalledWith("note-1");
	});
});
