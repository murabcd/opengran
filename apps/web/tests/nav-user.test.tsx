import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavUser } from "../src/components/sidebar/nav-user";

const { useSidebarShellMock, useThemeMock } = vi.hoisted(() => ({
	useSidebarShellMock: vi.fn(),
	useThemeMock: vi.fn(),
}));

vi.mock("@workspace/ui/components/avatar", () => ({
	Avatar: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	AvatarFallback: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
		<img alt={props.alt ?? ""} {...props} />
	),
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuContent: ({
		children,
		sideOffset: _sideOffset,
		...props
	}: React.PropsWithChildren<
		React.HTMLAttributes<HTMLDivElement> & { sideOffset?: number }
	>) => <div {...props}>{children}</div>,
	DropdownMenuGroup: ({ children }: React.PropsWithChildren) => (
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
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/kbd", () => ({
	Kbd: ({
		children,
		...props
	}: React.PropsWithChildren<React.ComponentProps<"kbd">>) => (
		<kbd {...props}>{children}</kbd>
	),
}));

vi.mock("@workspace/ui/components/sidebar", () => ({
	SidebarMenu: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLUListElement>>) => (
		<ul {...props}>{children}</ul>
	),
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
	SidebarMenuItem: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLLIElement>>) => (
		<li {...props}>{children}</li>
	),
	useSidebarShell: useSidebarShellMock,
}));

vi.mock("@workspace/ui/components/theme-provider", () => ({
	useTheme: useThemeMock,
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
	},
}));

vi.mock("../src/lib/avatar", () => ({
	getAvatarSrc: () => "avatar.png",
}));

vi.mock("../src/lib/desktop-release", () => ({
	resolveLatestDesktopDownloadUrl: vi.fn(),
}));

describe("NavUser", () => {
	beforeEach(() => {
		useSidebarShellMock.mockReturnValue({ isMobile: false });
		useThemeMock.mockReturnValue({ theme: "light", setTheme: vi.fn() });
	});

	afterEach(() => {
		cleanup();
	});

	it("shows the settings shortcut only as a hover/focus hint", () => {
		renderNavUser();

		const settingsButton = screen.getByRole("button", { name: "Settings" });
		expect(settingsButton.className).toContain("group/settings-item");

		const settingsShortcut = settingsButton.querySelector("kbd");
		expect(settingsShortcut).toBeTruthy();
		expect(settingsShortcut?.className).toContain("opacity-0");
		expect(settingsShortcut?.className).toContain("bg-muted");
		expect(settingsShortcut?.className).toContain("border");
		expect(settingsShortcut?.className).toContain(
			"group-hover/settings-item:opacity-100",
		);
		expect(settingsShortcut?.className).toContain(
			"group-focus-visible/settings-item:opacity-100",
		);
		expect(settingsShortcut?.className).not.toContain(
			"group-data-[highlighted]/settings-item:opacity-100",
		);
		expect(settingsShortcut?.getAttribute("aria-hidden")).toBe("true");
	});

	it("keeps the settings action wired to the existing handler", () => {
		const onSettingsOpen = vi.fn();

		renderNavUser({ onSettingsOpen });
		fireEvent.click(screen.getByRole("button", { name: "Settings" }));

		expect(onSettingsOpen).toHaveBeenCalledTimes(1);
	});
});

function renderNavUser({
	onSettingsOpen = vi.fn(),
}: {
	onSettingsOpen?: () => void;
} = {}) {
	return render(
		<NavUser
			user={{
				name: "Murad Abdulkadyrov",
				email: "murad@example.com",
				avatar: "",
			}}
			onRecipesOpen={vi.fn()}
			onTemplatesOpen={vi.fn()}
			onSettingsOpen={onSettingsOpen}
			onSignOut={vi.fn()}
			signingOut={false}
		/>,
	);
}
