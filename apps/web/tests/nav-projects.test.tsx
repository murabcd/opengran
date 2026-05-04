// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useMutationMock = vi.fn();

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
}));

vi.mock("@workspace/ui/components/alert-dialog", async () => {
	const React = await import("react");
	const AlertDialogContext = React.createContext<{ open: boolean }>({
		open: false,
	});

	return {
		AlertDialog: ({
			open = false,
			children,
		}: React.PropsWithChildren<{ open?: boolean }>) => (
			<AlertDialogContext.Provider value={{ open }}>
				{children}
			</AlertDialogContext.Provider>
		),
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
			<AlertDialogContentInner>{children}</AlertDialogContentInner>
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
	};

	function AlertDialogContentInner({ children }: React.PropsWithChildren) {
		const { open } = React.use(AlertDialogContext);
		return open ? <div>{children}</div> : null;
	}
});

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

vi.mock("@workspace/ui/components/dialog", async () => {
	const React = await import("react");
	const DialogContext = React.createContext<{ open: boolean }>({ open: false });

	return {
		Dialog: ({
			open,
			children,
		}: React.PropsWithChildren<{ open: boolean }>) => (
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
			onClick,
			onSelect,
			...props
		}: React.PropsWithChildren<
			React.ButtonHTMLAttributes<HTMLButtonElement> & {
				onSelect?: (event: Event) => void;
			}
		>) => {
			const { onOpenChange } = React.use(DropdownMenuContext);

			return (
				<button
					type="button"
					{...props}
					onClick={(event) => {
						onClick?.(event);
						onSelect?.(event.nativeEvent);
						onOpenChange?.(false);
					}}
				>
					{children}
				</button>
			);
		},
		DropdownMenuLabel: ({ children }: React.PropsWithChildren) => (
			<div>{children}</div>
		),
		DropdownMenuSeparator: () => <div />,
		DropdownMenuTrigger: ({
			asChild: _asChild,
			children,
		}: React.PropsWithChildren<{ asChild?: boolean }>) => {
			const { open, onOpenChange } = React.use(DropdownMenuContext);
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
						onOpenChange?.(!open);
					},
				},
			);
		},
	};
});

vi.mock("@workspace/ui/components/icons", () => ({
	Icons: {
		sidebarRecordingSpinner: () => <span>recording</span>,
	},
}));

vi.mock("@workspace/ui/components/popover", async () => {
	const React = await import("react");
	const PopoverContext = React.createContext<{ open: boolean }>({
		open: false,
	});

	return {
		Popover: ({
			open = false,
			children,
		}: React.PropsWithChildren<{ open?: boolean }>) => (
			<PopoverContext.Provider value={{ open }}>
				{children}
			</PopoverContext.Provider>
		),
		PopoverAnchor: ({ children }: React.PropsWithChildren) => <>{children}</>,
		PopoverContent: ({ children }: React.PropsWithChildren) => {
			const { open } = React.use(PopoverContext);
			return open ? <div>{children}</div> : null;
		},
	};
});

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
	SidebarMenuSubButton: ({
		asChild,
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			asChild?: boolean;
		}
	>) =>
		asChild ? (
			children
		) : (
			<button type="button" {...props}>
				{children}
			</button>
		),
	SidebarMenuSubItem: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/skeleton", () => ({
	Skeleton: () => <div />,
}));

vi.mock("@workspace/ui/components/tooltip", () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("../src/components/nav/sidebar-collapsible-group", () => ({
	SIDEBAR_COLLAPSIBLE_GROUP_ACTION_CLASS_NAME: "header-actions",
	SidebarCollapsibleGroup: ({
		title,
		actions,
		children,
	}: React.PropsWithChildren<{ title: string; actions?: React.ReactNode }>) => (
		<section>
			<div>
				<span>{title}</span>
				{actions}
			</div>
			<div>{children}</div>
		</section>
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
		value,
		onValueChange,
	}: {
		value: string;
		onValueChange: (value: string) => void;
	}) => (
		<input
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
		/>
	),
}));

vi.mock("../src/components/projects/project-composer", () => ({
	ProjectComposer: ({
		name,
		onNameChange,
	}: {
		name: string;
		onNameChange: (value: string) => void;
	}) => (
		<input
			value={name}
			onChange={(event) => onNameChange(event.target.value)}
		/>
	),
}));

vi.mock("../src/lib/note-title", () => ({
	getNoteDisplayTitle: (title: string) => title,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

function createProject({
	id,
	name,
	createdAt,
	updatedAt,
	isStarred = false,
}: {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	isStarred?: boolean;
}) {
	return {
		_id: id,
		_creationTime: createdAt,
		ownerTokenIdentifier: "owner",
		workspaceId: "workspace-1",
		name,
		normalizedName: name.toLowerCase(),
		isStarred,
		createdAt,
		updatedAt,
	} as never;
}

function createNote({
	id,
	projectId,
	title,
	createdAt,
	updatedAt,
}: {
	id: string;
	projectId: string;
	title: string;
	createdAt: number;
	updatedAt: number;
}) {
	return {
		_id: id,
		_creationTime: createdAt,
		ownerTokenIdentifier: "owner",
		workspaceId: "workspace-1",
		projectId,
		title,
		content: "",
		searchableText: "",
		visibility: "private",
		isArchived: false,
		createdAt,
		updatedAt,
	} as never;
}

describe("NavProjects", () => {
	beforeEach(() => {
		const mutation = vi.fn();
		Object.assign(mutation, {
			withOptimisticUpdate: () => mutation,
		});
		useMutationMock.mockReturnValue(mutation);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("renders project actions and sorts projects by name by default", async () => {
		const { NavProjects } = await import("../src/components/nav/nav-projects");

		render(
			<NavProjects
				workspaceId={"workspace-1" as never}
				projects={[
					createProject({
						id: "project-b",
						name: "Beta",
						createdAt: 20,
						updatedAt: 20,
					}),
					createProject({
						id: "project-a",
						name: "Alpha",
						createdAt: 10,
						updatedAt: 10,
					}),
					createProject({
						id: "project-c",
						name: "Gamma",
						createdAt: 30,
						updatedAt: 30,
					}),
				]}
				notes={[]}
				currentNoteId={null}
				onPrefetchNote={vi.fn()}
				onNoteSelect={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "Sort projects" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Add project" })).toBeTruthy();
		expect(getRenderedProjectNames()).toEqual(["Alpha", "Beta", "Gamma"]);
	});

	it("renders project star and trash actions", async () => {
		const { NavProjects } = await import("../src/components/nav/nav-projects");

		render(
			<NavProjects
				workspaceId={"workspace-1" as never}
				projects={[
					createProject({
						id: "project-a",
						name: "Alpha",
						createdAt: 10,
						updatedAt: 10,
					}),
				]}
				notes={[]}
				currentNoteId={null}
				onPrefetchNote={vi.fn()}
				onNoteSelect={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Open actions for Alpha" }),
		);

		expect(screen.getByRole("button", { name: /rename/i })).toBeTruthy();
		expect(screen.getByRole("button", { name: /^star$/i })).toBeTruthy();
		expect(
			screen.getByRole("button", { name: /move notes to trash/i }),
		).toBeTruthy();
		expect(screen.getByRole("button", { name: /^delete$/i })).toBeTruthy();
	});

	it("confirms before moving project notes to trash", async () => {
		const { NavProjects } = await import("../src/components/nav/nav-projects");

		render(
			<NavProjects
				workspaceId={"workspace-1" as never}
				projects={[
					createProject({
						id: "project-a",
						name: "Alpha",
						createdAt: 10,
						updatedAt: 10,
					}),
				]}
				notes={[
					createNote({
						id: "note-1",
						projectId: "project-a",
						title: "Project note",
						createdAt: 20,
						updatedAt: 20,
					}),
				]}
				currentNoteId={null}
				onPrefetchNote={vi.fn()}
				onNoteSelect={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Open actions for Alpha" }),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /move notes to trash/i }),
		);

		expect(screen.getByText("Move notes to trash?")).toBeTruthy();
		expect(screen.getByText(/This will move your notes to Trash/)).toBeTruthy();
	});

	it("renders unstar for starred projects", async () => {
		const { NavProjects } = await import("../src/components/nav/nav-projects");

		render(
			<NavProjects
				workspaceId={"workspace-1" as never}
				projects={[
					createProject({
						id: "project-a",
						name: "Alpha",
						createdAt: 10,
						updatedAt: 10,
						isStarred: true,
					}),
				]}
				notes={[]}
				currentNoteId={null}
				onPrefetchNote={vi.fn()}
				onNoteSelect={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /open actions/i }));

		expect(screen.getByRole("button", { name: /unstar/i })).toBeTruthy();
	});

	it("sorts projects by latest activity from the filter menu", async () => {
		const { NavProjects } = await import("../src/components/nav/nav-projects");

		render(
			<NavProjects
				workspaceId={"workspace-1" as never}
				projects={[
					createProject({
						id: "project-b",
						name: "Beta",
						createdAt: 20,
						updatedAt: 20,
					}),
					createProject({
						id: "project-a",
						name: "Alpha",
						createdAt: 10,
						updatedAt: 10,
					}),
					createProject({
						id: "project-c",
						name: "Gamma",
						createdAt: 30,
						updatedAt: 30,
					}),
				]}
				notes={[
					createNote({
						id: "note-1",
						projectId: "project-b",
						title: "Beta note",
						createdAt: 40,
						updatedAt: 200,
					}),
				]}
				currentNoteId={null}
				onPrefetchNote={vi.fn()}
				onNoteSelect={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Sort projects" }));
		fireEvent.click(screen.getByRole("button", { name: "Updated" }));

		expect(getRenderedProjectNames()).toEqual(["Beta", "Gamma", "Alpha"]);
	});

	it("shows more and less controls for long project note lists", async () => {
		const { NavProjects } = await import("../src/components/nav/nav-projects");
		const notes = Array.from({ length: 6 }, (_, index) =>
			createNote({
				id: `note-${index + 1}`,
				projectId: "project-a",
				title: `Project note ${index + 1}`,
				createdAt: index + 1,
				updatedAt: index + 1,
			}),
		);

		render(
			<NavProjects
				workspaceId={"workspace-1" as never}
				projects={[
					createProject({
						id: "project-a",
						name: "Alpha",
						createdAt: 10,
						updatedAt: 10,
					}),
				]}
				notes={notes}
				currentNoteId={null}
				onPrefetchNote={vi.fn()}
				onNoteSelect={vi.fn()}
			/>,
		);

		expect(screen.getByText("Project note 5")).toBeTruthy();
		expect(screen.queryByText("Project note 6")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /show more/i }));

		expect(screen.getByText("Project note 6")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /show less/i }));

		expect(screen.queryByText("Project note 6")).toBeNull();
	});
});

function getRenderedProjectNames() {
	const projectNames: string[] = [];

	for (const button of screen.getAllByRole("button")) {
		const value = button.textContent?.trim();
		if (value === "Alpha" || value === "Beta" || value === "Gamma") {
			projectNames.push(value);
		}
	}

	return projectNames;
}
