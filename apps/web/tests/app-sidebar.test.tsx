import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();
const useSidebarShellMock = vi.fn();
const useTranscriptionSessionMock = vi.fn();

vi.mock("convex/react", () => ({
	useQuery: useQueryMock,
}));

vi.mock("@workspace/ui/components/sidebar", () => ({
	Sidebar: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	SidebarContent: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	SidebarFooter: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	SidebarHeader: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	useSidebarShell: useSidebarShellMock,
}));

vi.mock("../src/components/inbox/inbox-sheet", () => ({
	InboxSheet: () => null,
}));

vi.mock("../src/components/nav/nav-main", () => ({
	NavMain: ({
		onInboxToggle,
		onSearchOpen,
		onViewChange,
	}: {
		onInboxToggle: () => void;
		onSearchOpen: () => void;
		onViewChange: (view: "home" | "chat" | "shared" | "note") => void;
	}) => (
		<div>
			<button type="button" onClick={onInboxToggle}>
				Open inbox
			</button>
			<button type="button" onClick={onSearchOpen}>
				Open search
			</button>
			<button type="button" onClick={() => onViewChange("home")}>
				Go home
			</button>
		</div>
	),
}));

vi.mock("../src/components/nav/nav-notes", () => ({
	NavNotes: ({
		notes,
		onCreateNote,
		onNoteSelect,
	}: {
		notes?: Array<{ _id: string; title: string }>;
		onCreateNote?: () => void;
		onNoteSelect: (noteId: never) => void;
	}) => (
		<div>
			{notes?.map((note) => (
				<button
					key={note._id}
					type="button"
					onClick={() => onNoteSelect(note._id as never)}
				>
					{note.title}
				</button>
			))}
			{onCreateNote ? (
				<button type="button" onClick={onCreateNote}>
					Create note
				</button>
			) : null}
		</div>
	),
}));

vi.mock("../src/components/nav/nav-projects", () => ({
	NavProjects: () => null,
}));

vi.mock("../src/components/nav/nav-trash", () => ({
	NavTrash: () => null,
}));

vi.mock("../src/components/recipes/recipes-dialog", () => ({
	RecipesDialog: () => null,
}));

vi.mock("../src/components/search/search-command", () => ({
	SearchCommand: () => null,
}));

vi.mock("../src/components/settings/settings-dialog", () => ({
	SettingsDialog: () => null,
}));

vi.mock("../src/components/sidebar/nav-user", () => ({
	NavUser: () => null,
}));

vi.mock("../src/components/templates/templates-dialog", () => ({
	TemplatesDialog: () => null,
}));

vi.mock("../src/components/workspaces/workspace-switcher", () => ({
	WorkspaceSwitcher: ({
		onSelect,
		workspaces,
	}: {
		onSelect: (workspaceId: never) => void;
		workspaces: Array<{ _id: string; name: string }>;
	}) => (
		<button type="button" onClick={() => onSelect(workspaces[0]?._id as never)}>
			Switch workspace
		</button>
	),
}));

vi.mock("../src/hooks/use-transcription-session", () => ({
	useTranscriptionSession: useTranscriptionSessionMock,
}));

vi.mock("../src/lib/navigation", () => ({
	SIDEBAR_NAVIGATION: [
		{ title: "Home", action: "view", view: "home" },
		{ title: "Inbox", action: "inbox" },
	],
}));

vi.mock("../src/lib/note-title", () => ({
	getNoteDisplayTitle: (title: string) => title,
}));

describe("AppSidebar mobile interactions", () => {
	afterEach(() => {
		cleanup();
	});

	beforeEach(() => {
		useQueryMock.mockReturnValue([]);
		useTranscriptionSessionMock.mockReturnValue({
			isListening: false,
			scopeKey: null,
		});
	});

	it("closes the mobile sidebar before opening inbox, search, or notes", async () => {
		const setOpenMobile = vi.fn();
		const onInboxOpenChange = vi.fn();
		const onNoteSelect = vi.fn();
		const onCreateNote = vi.fn();
		const onWorkspaceSelect = vi.fn();

		useSidebarShellMock.mockReturnValue({
			isMobile: true,
			setOpenMobile,
			state: "expanded",
		});

		const { AppSidebar } = await import(
			"../src/components/sidebar/app-sidebar"
		);

		render(
			<AppSidebar
				workspaces={[{ _id: "workspace-1", name: "Workspace" } as never]}
				activeWorkspaceId={"workspace-1" as never}
				currentView="note"
				inboxOpen={false}
				user={{
					name: "Murad",
					email: "murad@example.com",
					avatar: "",
				}}
				chats={[]}
				notes={[
					{
						_id: "note-1",
						title: "First note",
						searchableText: "",
						projectId: null,
						updatedAt: Date.now(),
					} as never,
				]}
				sharedNotes={[]}
				onWorkspaceSelect={onWorkspaceSelect}
				onWorkspaceCreate={vi.fn()}
				onViewChange={vi.fn()}
				onInboxOpenChange={onInboxOpenChange}
				settingsOpen={false}
				onSettingsOpenChange={vi.fn()}
				onSignOut={vi.fn()}
				currentNoteId={"note-1" as never}
				currentNoteTitle="First note"
				onChatSelect={vi.fn()}
				onNoteSelect={onNoteSelect}
				onCreateNote={onCreateNote}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open inbox" }));
		fireEvent.click(screen.getByRole("button", { name: "Open search" }));
		fireEvent.click(screen.getByRole("button", { name: "First note" }));
		fireEvent.click(screen.getByRole("button", { name: "Create note" }));
		fireEvent.click(screen.getByRole("button", { name: "Switch workspace" }));

		expect(setOpenMobile).toHaveBeenCalledTimes(5);
		expect(setOpenMobile).toHaveBeenNthCalledWith(1, false);
		expect(onInboxOpenChange).toHaveBeenCalledWith(true);
		expect(onNoteSelect).toHaveBeenCalledWith("note-1");
		expect(onCreateNote).toHaveBeenCalledTimes(1);
		expect(onWorkspaceSelect).toHaveBeenCalledWith("workspace-1");
	});
});
