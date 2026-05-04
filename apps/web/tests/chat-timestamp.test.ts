import { describe, expect, it } from "vitest";
import {
	formatChatMessageTimestamp,
	formatRelativeTimestamp,
	getChatMessageTimestamp,
} from "../src/lib/chat-timestamp";

describe("chat timestamps", () => {
	it("formats same-day timestamps as time", () => {
		expect(
			formatChatMessageTimestamp(
				new Date(2026, 4, 3, 10, 5),
				new Date(2026, 4, 3, 12, 0),
			),
		).toBe("10:05 AM");
	});

	it("formats older timestamps as date", () => {
		expect(
			formatChatMessageTimestamp(
				new Date(2026, 4, 2, 10, 5),
				new Date(2026, 4, 3, 12, 0),
			),
		).toBe("May 2, 10:05 AM");
	});

	it("formats list timestamps like chat message timestamps", () => {
		expect(
			formatRelativeTimestamp(
				new Date(2026, 4, 3, 10, 5),
				new Date(2026, 4, 3, 12, 0),
			),
		).toBe("10:05 AM");
		expect(
			formatRelativeTimestamp(
				new Date(2026, 4, 2, 10, 5),
				new Date(2026, 4, 3, 12, 0),
			),
		).toBe("May 2, 10:05 AM");
	});

	it("reads persisted timestamps from UI messages", () => {
		expect(
			getChatMessageTimestamp({
				id: "message-1",
				role: "user",
				parts: [{ type: "text", text: "Hello" }],
				createdAt: 1_777_777_777,
			}),
		).toBe(1_777_777_777);
	});
});
