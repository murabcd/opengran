import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	SearchCommand,
	type SearchCommandItem,
} from "../src/components/search/search-command";

function TestIcon() {
	return null;
}

describe("SearchCommand filters", () => {
	beforeAll(() => {
		window.HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
	});

	it("shows title-only and date filters when filters are visible", async () => {
		const user = userEvent.setup();

		render(
			<TooltipProvider>
				<SearchCommand
					open
					onOpenChange={vi.fn()}
					items={[]}
					onSelectItem={vi.fn()}
				/>
			</TooltipProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Show filters" }));

		expect(
			screen.getByRole("button", { name: "Search titles only" }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "Date" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "All" })).toBeNull();
		expect(screen.queryByPlaceholderText("Search projects")).toBeNull();
	});

	it("filters local results by title when title-only is enabled", async () => {
		const user = userEvent.setup();
		const items: SearchCommandItem[] = [
			{
				id: "alpha",
				title: "Alpha title",
				kind: "note",
				icon: TestIcon,
				preview: "needle preview",
				updatedAt: Date.now(),
			},
			{
				id: "needle",
				title: "Needle title",
				kind: "note",
				icon: TestIcon,
				updatedAt: Date.now(),
			},
		];

		render(
			<TooltipProvider>
				<SearchCommand
					open
					onOpenChange={vi.fn()}
					items={items}
					onSelectItem={vi.fn()}
				/>
			</TooltipProvider>,
		);

		await user.type(
			screen.getByPlaceholderText("Search notes and chats..."),
			"needle",
		);

		expect(screen.getByText("Alpha title")).toBeDefined();
		expect(screen.getByText("Needle title")).toBeDefined();

		await user.click(screen.getByRole("button", { name: "Show filters" }));
		await user.click(
			screen.getByRole("button", { name: "Search titles only" }),
		);

		await waitFor(() => expect(screen.queryByText("Alpha title")).toBeNull());
		expect(screen.getByText("Needle title")).toBeDefined();
	});

	it("opens date presets from the date filter", async () => {
		const user = userEvent.setup();

		render(
			<TooltipProvider>
				<SearchCommand
					open
					onOpenChange={vi.fn()}
					items={[]}
					onSelectItem={vi.fn()}
				/>
			</TooltipProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Show filters" }));
		await user.click(screen.getByRole("button", { name: "Date" }));

		expect(screen.getByText("Today")).toBeDefined();
		expect(screen.getByText("Last 7 days")).toBeDefined();
		expect(screen.getByText("Last 30 days")).toBeDefined();
	});

	it("shows keyboard hints when the footer is enabled", () => {
		render(
			<TooltipProvider>
				<SearchCommand
					open
					onOpenChange={vi.fn()}
					items={[]}
					showKeyboardHintsFooter
					onSelectItem={vi.fn()}
				/>
			</TooltipProvider>,
		);

		expect(screen.getByText("navigate")).toBeDefined();
		expect(screen.getByText("open")).toBeDefined();
		expect(screen.getByText("close")).toBeDefined();
	});
});
