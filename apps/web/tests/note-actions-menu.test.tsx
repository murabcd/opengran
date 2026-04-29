import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useMutationMock = vi.fn();
const useQueryMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
	useQuery: useQueryMock,
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

vi.mock("../src/components/note/share-note", () => ({
	buildNoteShareUrl: vi.fn(),
	writeTextToClipboard: vi.fn(),
}));

vi.mock("../src/components/note/optimistic-rename-note", () => ({
	optimisticRenameNote: vi.fn(),
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

vi.mock("@workspace/ui/components/dialog", () => ({
	Dialog: ({ children }: React.PropsWithChildren) => <>{children}</>,
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

vi.mock("@workspace/ui/components/popover", () => ({
	Popover: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PopoverAnchor: ({ children }: React.PropsWithChildren) => <>{children}</>,
	PopoverContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/tooltip", () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
	TooltipContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({
		asChild: _asChild,
		children,
	}: React.PropsWithChildren<{ asChild?: boolean }>) => <>{children}</>,
}));

vi.mock("@workspace/ui/components/command", () => ({
	Command: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CommandEmpty: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	CommandGroup: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	CommandInput: ({
		value,
		onValueChange,
		...props
	}: React.InputHTMLAttributes<HTMLInputElement> & {
		onValueChange?: (value: string) => void;
	}) => (
		<input
			{...props}
			value={value ?? ""}
			onChange={(event) => onValueChange?.(event.target.value)}
		/>
	),
	CommandItem: ({
		children,
		onSelect,
		value,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			onSelect?: (value: string) => void;
			value?: string;
		}
	>) => (
		<button type="button" {...props} onClick={() => onSelect?.(value ?? "")}>
			{children}
		</button>
	),
	CommandList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/alert-dialog", async () => {
	const React = await import("react");
	const AlertDialogContext = React.createContext<{ open: boolean }>({
		open: false,
	});

	return {
		AlertDialog: ({
			open,
			children,
		}: React.PropsWithChildren<{ open: boolean }>) => (
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
		AlertDialogContent: ({ children }: React.PropsWithChildren) => {
			const { open } = React.useContext(AlertDialogContext);
			return open ? <div>{children}</div> : null;
		},
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
			onSelect,
			...props
		}: React.PropsWithChildren<
			React.ButtonHTMLAttributes<HTMLButtonElement> & {
				onSelect?: (event: { preventDefault: () => void }) => void;
			}
		>) => {
			const { onOpenChange } = React.useContext(DropdownMenuContext);

			return (
				<button
					type="button"
					{...props}
					onClick={() => {
						let prevented = false;
						onSelect?.({
							preventDefault: () => {
								prevented = true;
							},
						});

						if (!prevented) {
							onOpenChange?.(false);
						}
					}}
				>
					{children}
				</button>
			);
		},
		DropdownMenuPortal: ({ children }: React.PropsWithChildren) => (
			<>{children}</>
		),
		DropdownMenuSeparator: () => <div />,
		DropdownMenuSub: ({ children }: React.PropsWithChildren) => <>{children}</>,
		DropdownMenuSubContent: ({ children }: React.PropsWithChildren) => (
			<div>{children}</div>
		),
		DropdownMenuSubTrigger: ({
			children,
		}: React.PropsWithChildren<
			React.ButtonHTMLAttributes<HTMLButtonElement>
		>) => <button type="button">{children}</button>,
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

describe("NoteActionsMenu", () => {
	beforeEach(() => {
		useQueryMock.mockImplementation((_query, args) =>
			args && typeof args === "object" && "id" in args
				? {
						_id: "note-1",
						title: "Test note",
						visibility: "private",
						shareId: null,
						isStarred: false,
					}
				: [],
		);

		useMutationMock.mockImplementation(() => {
			const mutation = vi.fn().mockResolvedValue({});
			return Object.assign(mutation, {
				withOptimisticUpdate: () => mutation,
			});
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("closes the note actions menu when opening the trash confirmation", async () => {
		const { NoteActionsMenu } = await import(
			"../src/components/note/note-actions-menu"
		);

		render(
			<NoteActionsMenu noteId={"note-1" as never} showRename={false}>
				<button type="button">Open actions</button>
			</NoteActionsMenu>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open actions" }));
		expect(screen.getByRole("button", { name: "Move to trash" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Move to trash" }));

		expect(screen.getByText("Move note to trash?")).toBeTruthy();
		expect(
			screen.queryAllByRole("button", { name: "Move to trash" }),
		).toHaveLength(1);
	});

	it("renders a searchable move menu and assigns the selected project", async () => {
		const mutations: Array<ReturnType<typeof vi.fn>> = [];

		useQueryMock.mockImplementation((_query, args) =>
			args && typeof args === "object" && "id" in args
				? {
						_id: "note-1",
						title: "Test note",
						visibility: "private",
						shareId: null,
						isStarred: false,
						projectId: undefined,
					}
				: [
						{ _id: "project-1", name: "Flomni" },
						{ _id: "project-2", name: "Forward" },
					],
		);

		useMutationMock.mockImplementation(() => {
			const mutation = vi.fn().mockResolvedValue({});
			mutations.push(mutation);

			return Object.assign(mutation, {
				withOptimisticUpdate: () => mutation,
			});
		});

		const { NoteActionsMenu } = await import(
			"../src/components/note/note-actions-menu"
		);

		render(
			<NoteActionsMenu noteId={"note-1" as never} showRename={false}>
				<button type="button">Open actions</button>
			</NoteActionsMenu>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open actions" }));

		expect(screen.getByRole("button", { name: "Move to" })).toBeTruthy();
		expect(screen.getByPlaceholderText("Move note to...")).toBeTruthy();

		fireEvent.change(screen.getByPlaceholderText("Move note to..."), {
			target: { value: "flo" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Flomni" }));

		await waitFor(() => {
			expect(
				mutations.some((mutation) =>
					mutation.mock.calls.some(
						([args]) =>
							args?.workspaceId === "workspace-1" &&
							args?.id === "note-1" &&
							args?.projectId === "project-1",
					),
				),
			).toBe(true);
		});

		expect(toastSuccessMock).toHaveBeenCalledWith("Note moved to project");
	});

	it("shows cancel and rename actions in the note rename dialog", async () => {
		const { NoteActionsMenu } = await import(
			"../src/components/note/note-actions-menu"
		);

		render(
			<NoteActionsMenu noteId={"note-1" as never}>
				<button type="button">Open actions</button>
			</NoteActionsMenu>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open actions" }));
		fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);

		expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
		expect(
			screen.getAllByRole("button", { name: "Rename" }).length,
		).toBeGreaterThan(0);
	});

	it("renders an unstar icon when the note is starred", async () => {
		useQueryMock.mockImplementation((_query, args) =>
			args && typeof args === "object" && "id" in args
				? {
						_id: "note-1",
						title: "Test note",
						visibility: "private",
						shareId: null,
						isStarred: true,
					}
				: [],
		);

		const { NoteStarButton } = await import(
			"../src/components/note/note-actions-menu"
		);

		const { container } = render(<NoteStarButton noteId={"note-1" as never} />);
		const button = screen.getByRole("button", {
			name: "Remove note from favorites",
		});
		const starIcon = container.querySelector("svg");

		expect(button.className).toContain("text-muted-foreground");
		expect(starIcon?.getAttribute("class")).not.toContain("fill-current");
	});
});
