// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeRichTextToClipboard } from "../src/components/note/share-note";

describe("writeRichTextToClipboard", () => {
	const originalClipboardItem = globalThis.ClipboardItem;
	const originalExecCommand = document.execCommand;
	const originalSecureContext = window.isSecureContext;
	const originalClipboard = navigator.clipboard;

	beforeEach(() => {
		Object.defineProperty(window, "isSecureContext", {
			configurable: true,
			value: true,
		});
		Object.defineProperty(globalThis, "ClipboardItem", {
			configurable: true,
			value: class ClipboardItem {
				constructor(readonly items: Record<string, Blob>) {}
			},
		});
		Object.defineProperty(document, "execCommand", {
			configurable: true,
			value: vi.fn(() => false),
		});
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				write: vi.fn().mockRejectedValue(new Error("blocked")),
				writeText: vi.fn().mockResolvedValue(undefined),
			},
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		Object.defineProperty(window, "isSecureContext", {
			configurable: true,
			value: originalSecureContext,
		});
		Object.defineProperty(globalThis, "ClipboardItem", {
			configurable: true,
			value: originalClipboardItem,
		});
		Object.defineProperty(document, "execCommand", {
			configurable: true,
			value: originalExecCommand,
		});
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: originalClipboard,
		});
	});

	it("falls back to plain text when rich clipboard writes fail", async () => {
		await writeRichTextToClipboard({
			html: "<article><h1>Title</h1><p>Body</p></article>",
			text: "Title\n\nBody",
		});

		expect(navigator.clipboard.write).toHaveBeenCalledTimes(1);
		expect(document.execCommand).toHaveBeenCalledWith("copy");
		expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Title\n\nBody");
	});
});
