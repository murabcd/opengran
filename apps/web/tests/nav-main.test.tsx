import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavMain } from "../src/components/nav/nav-main";

vi.mock("@workspace/ui/components/kbd", () => ({
	Kbd: ({
		children,
		...props
	}: React.PropsWithChildren<React.ComponentProps<"kbd">>) => (
		<kbd {...props}>{children}</kbd>
	),
}));

vi.mock("@workspace/ui/components/sidebar", () => ({
	SidebarGroup: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	SidebarMenu: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLUListElement>>) => (
		<ul {...props}>{children}</ul>
	),
	SidebarMenuBadge: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
		<div {...props}>{children}</div>
	),
	SidebarMenuButton: ({
		children,
		asChild: _asChild,
		isActive: _isActive,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			asChild?: boolean;
			isActive?: boolean;
		}
	>) => <div {...props}>{children}</div>,
	SidebarMenuItem: ({
		children,
		...props
	}: React.PropsWithChildren<React.HTMLAttributes<HTMLLIElement>>) => (
		<li {...props}>{children}</li>
	),
}));

vi.mock("../src/components/nav/sidebar-collapsible-group", () => ({
	SidebarCollapsibleGroup: ({
		children,
		labelClassName: _labelClassName,
		...props
	}: React.PropsWithChildren<
		React.HTMLAttributes<HTMLDivElement> & { labelClassName?: string }
	>) => <div {...props}>{children}</div>,
}));

describe("NavMain", () => {
	afterEach(() => {
		cleanup();
	});

	it("shows hover-only shortcut hints without changing button names", () => {
		const { container } = renderNavMain();

		expect(screen.getByRole("button", { name: "New note" })).toBeTruthy();
		expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();

		const shortcuts = Array.from(container.querySelectorAll("kbd"));
		expect(shortcuts).toHaveLength(2);
		for (const shortcut of shortcuts) {
			expect(shortcut.className).toContain("opacity-0");
			expect(shortcut.className).toContain("group-hover/menu-item:opacity-100");
			expect(shortcut.getAttribute("aria-hidden")).toBe("true");
		}
	});

	it("opens search on Cmd+K and creates a note on Cmd+N", () => {
		const onCreateNote = vi.fn();
		const onSearchOpen = vi.fn();

		renderNavMain({ onCreateNote, onSearchOpen });

		fireEvent.keyDown(document, { key: "k", metaKey: true });
		fireEvent.keyDown(document, { key: "n", metaKey: true });

		expect(onSearchOpen).toHaveBeenCalledTimes(1);
		expect(onCreateNote).toHaveBeenCalledTimes(1);
	});

	it("ignores modified shortcuts that should not trigger note creation", () => {
		const onCreateNote = vi.fn();

		renderNavMain({ onCreateNote });

		fireEvent.keyDown(document, { key: "n" });
		fireEvent.keyDown(document, { key: "n", metaKey: true, shiftKey: true });
		fireEvent.keyDown(document, { key: "n", metaKey: true, altKey: true });

		expect(onCreateNote).not.toHaveBeenCalled();
	});
});

function renderNavMain({
	onCreateNote = vi.fn(),
	onInboxToggle = vi.fn(),
	onSearchOpen = vi.fn(),
	onViewChange = vi.fn(),
}: {
	onCreateNote?: () => void;
	onInboxToggle?: () => void;
	onSearchOpen?: () => void;
	onViewChange?: (view: "home" | "chat" | "shared" | "note") => void;
} = {}) {
	return render(
		<NavMain
			items={[
				{
					action: "search",
					icon: () => null,
					title: "Search",
				},
				{
					action: "view",
					icon: () => null,
					title: "Home",
					view: "home",
				},
			]}
			onCreateNote={onCreateNote}
			onInboxToggle={onInboxToggle}
			onSearchOpen={onSearchOpen}
			onViewChange={onViewChange}
		/>,
	);
}
