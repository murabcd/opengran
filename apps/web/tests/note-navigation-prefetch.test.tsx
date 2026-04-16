import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useMutationMock = vi.fn();

vi.mock("@workspace/ui/components/alert-dialog", () => ({
	AlertDialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AlertDialogAction: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement>
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	AlertDialogCancel: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement>
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	AlertDialogContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AlertDialogFooter: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
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

vi.mock("@workspace/ui/components/collapsible", () => ({
	Collapsible: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CollapsibleContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/dialog", () => ({
	Dialog: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	DialogContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement>
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	DropdownMenuSeparator: () => <div />,
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/icons", () => ({
	Icons: {
		sidebarRecordingSpinner: () => <span>recording</span>,
	},
}));

vi.mock("@workspace/ui/components/popover", () => ({
	Popover: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	PopoverAnchor: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	PopoverContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
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
		isActive: _isActive,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			isActive?: boolean;
		}
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	SidebarMenuItem: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	SidebarMenuSub: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/skeleton", () => ({
	Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("../src/components/nav/sidebar-collapsible-group", () => ({
	SidebarCollapsibleGroup: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("../src/components/note/note-actions-menu", () => ({
	NoteActionsMenu: ({
		children,
		renameAnchor,
	}: React.PropsWithChildren<{ renameAnchor: React.ReactNode }>) => (
		<div>
			{renameAnchor}
			{children}
		</div>
	),
}));

vi.mock("../src/components/note/note-title-edit-input", () => ({
	NoteTitleEditInput: ({
		focusOnMount: _focusOnMount,
		commitOnBlur: _commitOnBlur,
		inputRef,
		onValueChange,
		onCommit,
		onCancel,
		value,
		...props
	}: React.InputHTMLAttributes<HTMLInputElement> & {
		focusOnMount?: boolean;
		commitOnBlur?: boolean;
		inputRef?: React.Ref<HTMLInputElement>;
		onValueChange?: (value: string) => void;
		onCommit?: () => void;
		onCancel?: () => void;
	}) => (
		<input
			{...props}
			ref={inputRef}
			value={typeof value === "string" ? value : ""}
			onChange={(event) => onValueChange?.(event.target.value)}
			onBlur={() => onCommit?.()}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					onCancel?.();
				}
			}}
		/>
	),
}));

vi.mock("../src/components/projects/project-composer", () => ({
	ProjectComposer: () => null,
}));

vi.mock("../src/lib/note-title", () => ({
	getNoteDisplayTitle: (title: string) => title,
}));

describe("note navigation prefetch", () => {
	beforeEach(() => {
		useMutationMock.mockReset();
		useMutationMock.mockImplementation(() => {
			const mutation = vi.fn();
			mutation.withOptimisticUpdate = () => mutation;
			return mutation;
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("prefetches note opens from the main notes list before click", async () => {
		const { NavNotes } = await import("../src/components/nav/nav-notes");
		const onPrefetchNote = vi.fn();
		const onNoteSelect = vi.fn();

		render(
			<NavNotes
				notes={[
					{
						_id: "note-1",
						title: "First note",
						projectId: null,
						isStarred: false,
					} as never,
				]}
				currentNoteId={null}
				onPrefetchNote={onPrefetchNote}
				onNoteSelect={onNoteSelect}
			/>,
		);

		const noteButton = screen.getByRole("button", { name: "First note" });
		fireEvent.mouseEnter(noteButton);
		fireEvent.focus(noteButton);
		fireEvent.pointerDown(noteButton);
		fireEvent.click(noteButton);

		expect(onPrefetchNote).toHaveBeenCalledTimes(3);
		expect(onPrefetchNote).toHaveBeenCalledWith("note-1");
		expect(onNoteSelect).toHaveBeenCalledWith("note-1");
	});

	it("prefetches project notes before opening them", async () => {
		const { NavProjects } = await import("../src/components/nav/nav-projects");
		const onPrefetchNote = vi.fn();
		const onNoteSelect = vi.fn();

		render(
			<NavProjects
				projects={[
					{
						_id: "project-1",
						name: "Project alpha",
					} as never,
				]}
				notes={[
					{
						_id: "note-1",
						title: "Project note",
						projectId: "project-1",
						isStarred: false,
					} as never,
				]}
				workspaceId={"workspace-1" as never}
				currentNoteId={"note-1" as never}
				onPrefetchNote={onPrefetchNote}
				onNoteSelect={onNoteSelect}
			/>,
		);

		const noteButton = screen.getByRole("button", { name: "Project note" });
		fireEvent.mouseEnter(noteButton);
		fireEvent.focus(noteButton);
		fireEvent.pointerDown(noteButton);
		fireEvent.click(noteButton);

		expect(onPrefetchNote).toHaveBeenCalledTimes(3);
		expect(onPrefetchNote).toHaveBeenCalledWith("note-1");
		expect(onNoteSelect).toHaveBeenCalledWith("note-1");
	});
});
