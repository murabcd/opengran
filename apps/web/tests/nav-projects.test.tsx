// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useMutationMock = vi.fn();

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
}));

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
			onClick,
			onSelect,
			...props
		}: React.PropsWithChildren<
			React.ButtonHTMLAttributes<HTMLButtonElement> & {
				onSelect?: (event: Event) => void;
			}
		>) => {
			const { onOpenChange } = React.useContext(DropdownMenuContext);

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
			const { open, onOpenChange } = React.useContext(DropdownMenuContext);
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
			const { open } = React.useContext(PopoverContext);
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
}: {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
}) {
	return {
		_id: id,
		_creationTime: createdAt,
		ownerTokenIdentifier: "owner",
		workspaceId: "workspace-1",
		name,
		normalizedName: name.toLowerCase(),
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
});

function getRenderedProjectNames() {
	return screen
		.getAllByRole("button")
		.map((button) => button.textContent?.trim())
		.filter(
			(value): value is string =>
				value === "Alpha" || value === "Beta" || value === "Gamma",
		);
}
