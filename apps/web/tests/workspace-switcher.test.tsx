import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/ui/components/avatar", () => ({
	Avatar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AvatarFallback: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
		<img alt={props.alt} src={props.src} />
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
			onSelect,
			onClick,
			...props
		}: React.PropsWithChildren<
			React.ButtonHTMLAttributes<HTMLButtonElement> & {
				onSelect?: () => void;
			}
		>) => (
			<button
				type="button"
				{...props}
				onClick={(event) => {
					onClick?.(event);
					onSelect?.();
				}}
			>
				{children}
			</button>
		),
		DropdownMenuSeparator: () => <div />,
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

vi.mock("@workspace/ui/components/kbd", () => ({
	Kbd: ({
		children,
		...props
	}: React.PropsWithChildren<React.ComponentProps<"kbd">>) => (
		<kbd {...props}>{children}</kbd>
	),
}));

vi.mock("@workspace/ui/components/sidebar", () => ({
	SidebarMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	SidebarMenuButton: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement>
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	SidebarMenuItem: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@/components/workspaces/workspace-composer", () => ({
	WorkspaceComposer: ({
		name,
		onNameChange,
		error,
		nameInputId,
	}: {
		name: string;
		onNameChange: (value: string) => void;
		error: string | null;
		nameInputId: string;
	}) => (
		<div>
			<input
				id={nameInputId}
				value={name}
				onChange={(event) => onNameChange(event.target.value)}
			/>
			{error ? <div>{error}</div> : null}
		</div>
	),
}));

vi.mock("@/lib/avatar", () => ({
	getAvatarSrc: ({ name }: { name: string }) => `avatar:${name}`,
}));

vi.mock("@/lib/workspaces", () => ({
	getWorkspaceRoleOption: () => ({
		summary: "Meeting notes",
	}),
}));

describe("WorkspaceSwitcher", () => {
	afterEach(() => {
		cleanup();
	});

	it("closes the menu when opening the create workspace dialog", async () => {
		const { WorkspaceSwitcher } = await import(
			"../src/components/workspaces/workspace-switcher"
		);

		render(
			<WorkspaceSwitcher
				workspaces={[
					{
						_id: "workspace-1",
						name: "Murad workspace",
						role: "owner",
						iconUrl: null,
					} as never,
				]}
				activeWorkspaceId={"workspace-1" as never}
				onSelect={vi.fn()}
				onCreateWorkspace={vi.fn().mockResolvedValue({
					_id: "workspace-2",
					name: "New workspace",
					role: "owner",
				})}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Murad workspace/i }));
		expect(screen.getByRole("button", { name: "Add workspace" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Add workspace" }));

		expect(screen.getByText("Create a workspace")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Add workspace" })).toBeNull();
	});

	it("renders workspace shortcuts with hover-only visibility classes", async () => {
		const { WorkspaceSwitcher } = await import(
			"../src/components/workspaces/workspace-switcher"
		);

		const { container } = render(
			<WorkspaceSwitcher
				workspaces={[
					{
						_id: "workspace-1",
						name: "Murad workspace",
						role: "owner",
						iconUrl: null,
					} as never,
					{
						_id: "workspace-2",
						name: "Personal",
						role: "owner",
						iconUrl: null,
					} as never,
				]}
				activeWorkspaceId={"workspace-1" as never}
				onSelect={vi.fn()}
				onCreateWorkspace={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Murad workspace/i }));

		const workspaceItems = Array.from(
			container.querySelectorAll(".group\\/workspace-item"),
		);
		expect(workspaceItems).toHaveLength(2);

		const shortcuts = Array.from(container.querySelectorAll("kbd"));
		expect(shortcuts).toHaveLength(2);
		expect(shortcuts[0]?.className).toContain("opacity-0");
		expect(shortcuts[0]?.className).toContain("bg-muted");
		expect(shortcuts[0]?.className).toContain("border");
		expect(shortcuts[0]?.className).toContain(
			"group-hover/workspace-item:opacity-100",
		);
		expect(shortcuts[0]?.className).toContain(
			"group-focus-visible/workspace-item:opacity-100",
		);
		expect(shortcuts[0]?.className).not.toContain(
			"group-data-[highlighted]/workspace-item:opacity-100",
		);
	});
});
