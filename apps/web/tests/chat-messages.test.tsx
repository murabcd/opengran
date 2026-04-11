import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({
	Streamdown: ({
		children,
		className,
	}: {
		children: string;
		className?: string;
	}) => <div className={className}>{children}</div>,
}));

vi.mock("../src/hooks/use-sticky-scroll-to-bottom", () => ({
	useStickyScrollToBottom: () => ({
		containerRef: { current: null },
	}),
}));

afterEach(() => {
	cleanup();
});

describe("ChatMessages", () => {
	it("renders user messages with the shared app bubble radius", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "user-1",
						role: "user",
						parts: [
							{
								type: "text",
								text: "Round this bubble",
							},
						],
					},
				]}
			/>,
		);

		expect(
			screen.getByText("Round this bubble").parentElement?.className,
		).toContain("rounded-lg");
	});

	it("renders sources from structured tool output parts", async () => {
		const user = userEvent.setup();
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-1",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "Found the most relevant Tracker items.",
							},
							{
								type: "tool-yandex_tracker_search",
								toolCallId: "tool-1",
								state: "output-available",
								input: {
									query: "bitrix24 integration",
								},
								output: {
									sources: [
										{
											url: "https://tracker.yandex.ru/issue/PROJ-123",
											title: "PROJ-123",
										},
									],
								},
							},
						],
					},
				]}
			/>,
		);

		expect(
			screen.getByText("Found the most relevant Tracker items."),
		).toBeDefined();
		await user.click(screen.getByRole("button", { name: "Used 1 sources" }));
		expect(
			screen.getByRole("link", { name: "PROJ-123" }).getAttribute("href"),
		).toBe("https://tracker.yandex.ru/issue/PROJ-123");
	});

	it("renders native source-url parts from AI SDK streams", async () => {
		const user = userEvent.setup();
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-2",
						role: "assistant",
						parts: [
							{
								type: "source-url",
								sourceId: "source-1",
								url: "https://openai.com/index/introducing-gpt-5",
								title: "Introducing GPT-5",
							},
							{
								type: "text",
								text: "Here is the latest model announcement.",
							},
						],
					},
				]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Used 1 sources" }));
		expect(
			screen
				.getByRole("link", { name: "Introducing GPT-5" })
				.getAttribute("href"),
		).toBe("https://openai.com/index/introducing-gpt-5");
	});

	it("keeps sources visually attached to the assistant answer and clickable", async () => {
		const user = userEvent.setup();
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-4",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "Here are the supporting references.",
							},
							{
								type: "source-url",
								sourceId: "source-2",
								url: "https://openai.com/research",
								title: "OpenAI Research",
							},
						],
					},
				]}
			/>,
		);

		const trigger = screen.getByRole("button", { name: "Used 1 sources" });
		const sourcesSection = trigger.parentElement;
		const messageColumn = sourcesSection?.parentElement;
		const messageRow = sourcesSection?.previousElementSibling;

		expect(trigger.className).toContain("cursor-pointer");
		expect(messageRow?.className).toContain("pb-2");
		expect(messageColumn?.className).not.toContain("space-y-4");

		await user.click(trigger);

		expect(
			screen.getByRole("link", { name: "OpenAI Research" }).className,
		).toContain("cursor-pointer");
	});

	it("applies note typography styles to assistant markdown", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");

		const { container } = render(
			<ChatMessages
				messages={[
					{
						id: "assistant-3",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "- First\n- Second",
							},
						],
					},
				]}
			/>,
		);

		expect(container.querySelector(".note-streamdown")?.textContent).toBe(
			"- First\n- Second",
		);
	});

	it("keeps streaming assistant thinking aligned with assistant messages", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				isLoading
				messages={[
					{
						id: "assistant-streaming",
						role: "assistant",
						parts: [],
					},
				]}
			/>,
		);

		expect(
			screen.getByText("Thinking").closest(".flex.w-full.gap-4")?.className,
		).not.toContain("ml-auto");
	});
});
