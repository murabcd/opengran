import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SearchCommand } from "../src/components/search/search-command";

describe("SearchCommand filters", () => {
	beforeAll(() => {
		window.HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
	});

	it("shows only the date filter when filters are visible", async () => {
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

		expect(screen.getByRole("button", { name: "Date" })).toBeDefined();
		expect(screen.queryByRole("button", { name: "All" })).toBeNull();
		expect(screen.queryByPlaceholderText("Search projects")).toBeNull();
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
