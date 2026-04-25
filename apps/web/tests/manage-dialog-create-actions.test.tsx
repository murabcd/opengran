import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useMutationMock = vi.fn();
const useQueryMock = vi.fn();

vi.mock("convex/react", () => ({
	useMutation: useMutationMock,
	useQuery: useQueryMock,
}));

vi.mock("../src/hooks/use-active-workspace", () => ({
	useActiveWorkspaceId: () => "workspace-1",
}));

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		success: vi.fn(),
	},
}));

describe("manage dialog create actions", () => {
	beforeEach(() => {
		useMutationMock.mockReturnValue(vi.fn());
		vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("section-1");
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("adds a new recipe draft from the sidebar action", async () => {
		useQueryMock.mockReturnValue([
			{
				slug: "write-prd",
				name: "Write PRD",
				prompt: "Prompt",
			},
		]);

		const { RecipesDialog } = await import(
			"../src/components/recipes/recipes-dialog"
		);

		render(<RecipesDialog open onOpenChange={vi.fn()} />);

		fireEvent.click(screen.getAllByRole("button", { name: "New recipe" })[0]);

		expect(await screen.findByDisplayValue("New recipe")).toBeTruthy();
		expect(screen.getByDisplayValue("")).toBeTruthy();
	});

	it("resets recipe edits and closes the dialog on cancel", async () => {
		useQueryMock.mockReturnValue([
			{
				slug: "write-prd",
				name: "Write PRD",
				prompt: "Original prompt",
			},
		]);
		const onOpenChange = vi.fn();

		const { RecipesDialog } = await import(
			"../src/components/recipes/recipes-dialog"
		);

		render(<RecipesDialog open onOpenChange={onOpenChange} />);

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		const saveButton = screen.getByRole("button", { name: "Save" });
		const promptInput = screen.getByLabelText("Prompt");

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);
		expect((saveButton as HTMLButtonElement).disabled).toBe(true);

		fireEvent.change(promptInput, { target: { value: "Updated prompt" } });

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);
		expect((saveButton as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(cancelButton);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect((screen.getByLabelText("Prompt") as HTMLTextAreaElement).value).toBe(
			"Original prompt",
		);
		expect(
			(screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		expect(
			(screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	it("adds a new template draft from the sidebar action", async () => {
		useQueryMock.mockReturnValue([
			{
				slug: "stand-up",
				name: "Stand-up",
				meetingContext: "Daily sync",
				sections: [
					{
						id: "updates",
						title: "Updates",
						prompt: "Share progress",
					},
				],
			},
		]);

		const { TemplatesDialog } = await import(
			"../src/components/templates/templates-dialog"
		);

		render(<TemplatesDialog open onOpenChange={vi.fn()} />);

		fireEvent.click(screen.getAllByRole("button", { name: "New template" })[0]);

		expect(await screen.findByDisplayValue("New template")).toBeTruthy();
		expect(screen.getByDisplayValue("Summary")).toBeTruthy();
	});

	it("resets template edits and closes the dialog on cancel", async () => {
		useQueryMock.mockReturnValue([
			{
				slug: "stand-up",
				name: "Stand-up",
				meetingContext: "Daily sync",
				sections: [
					{
						id: "updates",
						title: "Updates",
						prompt: "Share progress",
					},
				],
			},
		]);
		const onOpenChange = vi.fn();

		const { TemplatesDialog } = await import(
			"../src/components/templates/templates-dialog"
		);

		render(<TemplatesDialog open onOpenChange={onOpenChange} />);

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		const saveButton = screen.getByRole("button", { name: "Save" });
		const contextInput = screen.getByLabelText("Meeting context");

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);
		expect((saveButton as HTMLButtonElement).disabled).toBe(true);

		fireEvent.change(contextInput, { target: { value: "Updated sync" } });

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);
		expect((saveButton as HTMLButtonElement).disabled).toBe(false);

		fireEvent.click(cancelButton);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(
			(screen.getByLabelText("Meeting context") as HTMLTextAreaElement).value,
		).toBe("Daily sync");
		expect(
			(screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		expect(
			(screen.getByRole("button", { name: "Save" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
