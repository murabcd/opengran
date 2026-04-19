import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

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

vi.mock("@workspace/ui/components/tooltip", () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	TooltipContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("sonner", () => ({
	toast: {
		success: toastSuccessMock,
		error: toastErrorMock,
	},
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

	it("uses the note chat width and right alignment for user messages", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "user-layout",
						role: "user",
						parts: [
							{
								type: "text",
								text: "Match the note chat layout",
							},
						],
					},
				]}
			/>,
		);

		const bubble = screen.getByText("Match the note chat layout").parentElement;
		const column = bubble?.parentElement?.parentElement;
		const row = column?.parentElement;

		expect(row?.className).toContain("justify-end");
		expect(column?.className).toContain("max-w-[85%]");
		expect(column?.className).not.toContain("w-full");
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

	it("renders sources from PostHog tool output parts", async () => {
		const user = userEvent.setup();
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-posthog",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "I found the relevant PostHog insight.",
							},
							{
								type: "tool-posthog_insight_get",
								toolCallId: "tool-posthog-1",
								state: "output-available",
								input: {
									insightId: "weekly-signups",
								},
								output: {
									sources: [
										{
											url: "https://eu.posthog.com/project/1/insights/weekly-signups",
											title: "Weekly signups",
										},
									],
								},
							},
						],
					},
				]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Used 1 sources" }));
		expect(
			screen.getByRole("link", { name: "Weekly signups" }).getAttribute("href"),
		).toBe("https://eu.posthog.com/project/1/insights/weekly-signups");
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
		const actionsRow = sourcesSection?.previousElementSibling;
		const messageRow = actionsRow?.previousElementSibling;
		const messageList = messageColumn?.parentElement?.parentElement;

		expect(trigger.className).toContain("cursor-pointer");
		expect(actionsRow?.className).toContain("mt-2");
		expect(sourcesSection?.className).toContain("mt-1");
		expect(messageRow?.className).not.toContain("pb-2");
		expect(messageRow?.className).not.toContain("pb-4");
		expect(messageColumn?.className).not.toContain("space-y-4");
		expect(messageList?.className).toContain("pb-9");

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

	it("collapses long user messages behind a show more toggle", async () => {
		const user = userEvent.setup();
		const { ChatMessages } = await import("../src/components/chat/messages");
		const longMessage = Array.from(
			{ length: 16 },
			(_, index) => `Line ${index + 1} of a very long response`,
		).join("\n");

		const { container } = render(
			<ChatMessages
				messages={[
					{
						id: "user-long",
						role: "user",
						parts: [
							{
								type: "text",
								text: longMessage,
							},
						],
					},
				]}
			/>,
		);

		const toggle = screen.getByRole("button", { name: "Show more" });
		const contentWrapper =
			container.querySelector(".note-streamdown")?.parentElement;

		expect(toggle.getAttribute("aria-expanded")).toBe("false");
		expect(contentWrapper?.className).toContain("max-h-80");

		await user.click(toggle);

		expect(
			screen
				.getByRole("button", { name: "Show less" })
				.getAttribute("aria-expanded"),
		).toBe("true");
		expect(contentWrapper?.className).toContain("max-h-[999rem]");
	});

	it("does not add a show more toggle for short user messages", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "user-short",
						role: "user",
						parts: [
							{
								type: "text",
								text: "Short response",
							},
						],
					},
				]}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
	});

	it("does not collapse long assistant messages", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");
		const longMessage = Array.from(
			{ length: 16 },
			(_, index) => `Line ${index + 1} of a very long response`,
		).join("\n");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-long",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: longMessage,
							},
						],
					},
				]}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
		expect(screen.getByText(/Line 16 of a very long response/)).toBeDefined();
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
			screen.getByText("Thinking").closest("div[class*='group/message']")
				?.className,
		).toContain("justify-start");
	});

	it("keeps the initial loading thinking aligned with assistant messages", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(<ChatMessages isLoading messages={[]} />);

		expect(
			screen.getByText("Thinking").closest("div[class*='group/message']")
				?.className,
		).toContain("justify-start");
	});

	it("copies assistant responses from the message actions", async () => {
		const user = userEvent.setup();
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: {
				writeText: writeTextMock,
			},
		});
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-copy",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "Copy me",
							},
						],
					},
				]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Copy" }));

		expect(writeTextMock).toHaveBeenCalledWith("Copy me");
		expect(toastSuccessMock).toHaveBeenCalledWith("Copied");
	});

	it("keeps message actions hover-only on desktop layouts", async () => {
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-actions",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "Hover me",
							},
						],
					},
				]}
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Copy" }).parentElement?.parentElement
				?.className,
		).toContain("md:opacity-0");
	});

	it("creates a note from the assistant response", async () => {
		const user = userEvent.setup();
		const onPlusAction = vi.fn().mockResolvedValue("created");
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-create-note",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "Turn this into a note",
							},
						],
					},
				]}
				onPlusAction={onPlusAction}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Create note" }));

		expect(onPlusAction).toHaveBeenCalledWith("Turn this into a note");
		expect(toastSuccessMock).toHaveBeenCalledWith("Note created");
	});

	it("regenerates an assistant response from the message actions", async () => {
		const user = userEvent.setup();
		const onRegenerateMessage = vi.fn();
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "assistant-regenerate",
						role: "assistant",
						parts: [
							{
								type: "text",
								text: "Try again",
							},
						],
					},
				]}
				onRegenerateMessage={onRegenerateMessage}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Regenerate" }));

		expect(onRegenerateMessage).toHaveBeenCalledWith("assistant-regenerate");
	});

	it("calls the edit handler for user message actions", async () => {
		const user = userEvent.setup();
		const onEditMessage = vi.fn();
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "user-edit",
						role: "user",
						parts: [
							{
								type: "text",
								text: "Edit me",
							},
						],
					},
				]}
				onEditMessage={onEditMessage}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Edit" }));

		expect(onEditMessage).toHaveBeenCalledWith("user-edit", "Edit me");
	});

	it("deletes a user message from the message actions", async () => {
		const user = userEvent.setup();
		const onDeleteMessage = vi.fn();
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "user-delete",
						role: "user",
						parts: [
							{
								type: "text",
								text: "Delete me",
							},
						],
					},
				]}
				onDeleteMessage={onDeleteMessage}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(onDeleteMessage).toHaveBeenCalledWith("user-delete");
	});

	it("copies user messages from the message actions", async () => {
		const user = userEvent.setup();
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", {
			...navigator,
			clipboard: {
				writeText: writeTextMock,
			},
		});
		const { ChatMessages } = await import("../src/components/chat/messages");

		render(
			<ChatMessages
				messages={[
					{
						id: "user-copy",
						role: "user",
						parts: [
							{
								type: "text",
								text: "Copy this user message",
							},
						],
					},
				]}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Copy" }));

		expect(writeTextMock).toHaveBeenCalledWith("Copy this user message");
		expect(toastSuccessMock).toHaveBeenCalledWith("Copied");
	});
});
