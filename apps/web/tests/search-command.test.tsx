import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SearchCommand } from "../src/components/search/search-command";

describe("SearchCommand source filters", () => {
	beforeAll(() => {
		window.HTMLElement.prototype.scrollIntoView = vi.fn();
	});

	afterEach(() => {
		cleanup();
	});

	it("separates type filters from folders in the source popover", async () => {
		const user = userEvent.setup();

		render(
			<TooltipProvider>
				<SearchCommand
					open
					onOpenChange={vi.fn()}
					items={[]}
					projects={[{ id: "folder-internal", name: "Internal" }]}
					onSelectItem={vi.fn()}
				/>
			</TooltipProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Show filters" }));
		await user.click(screen.getByRole("button", { name: "All" }));

		expect(screen.getByPlaceholderText("Search projects")).toBeDefined();
		expect(screen.getByText("Types")).toBeDefined();
		expect(screen.getByText("Projects")).toBeDefined();
		expect(screen.getByText("Notes")).toBeDefined();
		expect(screen.getByText("Chats")).toBeDefined();
		expect(screen.getByText("Internal")).toBeDefined();
	});

	it("shows a project-specific empty state when no projects match", async () => {
		const user = userEvent.setup();

		render(
			<TooltipProvider>
				<SearchCommand
					open
					onOpenChange={vi.fn()}
					items={[]}
					projects={[{ id: "folder-internal", name: "Internal" }]}
					onSelectItem={vi.fn()}
				/>
			</TooltipProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Show filters" }));
		await user.click(screen.getByRole("button", { name: "All" }));
		await user.type(screen.getByPlaceholderText("Search projects"), "sales");

		expect(screen.getByText("No projects found")).toBeDefined();
		expect(screen.getByText("Types")).toBeDefined();
		expect(screen.getByText("Projects")).toBeDefined();
	});

	it("shows keyboard hints when the footer is enabled", () => {
		render(
			<TooltipProvider>
				<SearchCommand
					open
					onOpenChange={vi.fn()}
					items={[]}
					projects={[]}
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
