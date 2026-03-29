import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({
	Streamdown: ({ children }: { children: string }) => <div>{children}</div>,
}));

vi.mock("../src/hooks/use-sticky-scroll-to-bottom", () => ({
	useStickyScrollToBottom: () => ({
		containerRef: { current: null },
	}),
}));

describe("ChatMessages", () => {
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
});
