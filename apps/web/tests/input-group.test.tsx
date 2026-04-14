import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import { afterEach, describe, expect, it } from "vitest";

describe("InputGroup", () => {
	afterEach(() => {
		cleanup();
	});

	it("focuses the textarea when clicking a non-interactive surface", () => {
		render(
			<InputGroup>
				<InputGroupAddon align="block-start">
					<span>Context</span>
				</InputGroupAddon>
				<InputGroupTextarea aria-label="Prompt" />
			</InputGroup>,
		);

		const textarea = screen.getByRole("textbox", { name: "Prompt" });
		const addon = screen.getByText("Context");

		expect(document.activeElement).not.toBe(textarea);

		fireEvent.pointerDown(addon);

		expect(document.activeElement).toBe(textarea);
	});

	it("does not steal focus from interactive controls inside the group", () => {
		render(
			<InputGroup>
				<InputGroupAddon align="block-start">
					<InputGroupButton aria-label="Choose recipe">Recipe</InputGroupButton>
				</InputGroupAddon>
				<InputGroupTextarea aria-label="Prompt" />
			</InputGroup>,
		);

		const textarea = screen.getByRole("textbox", { name: "Prompt" });
		const button = screen.getByRole("button", { name: "Choose recipe" });

		fireEvent.pointerDown(button);

		expect(document.activeElement).not.toBe(textarea);
	});
});
