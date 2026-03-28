import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
	createNoteEditorExtensions,
	looksLikeMarkdown,
	parseStoredNoteContent,
	serializeDocumentToMarkdown,
} from "../src/lib/note-editor";

const schema = getSchema(createNoteEditorExtensions());

describe("note editor markdown bridge", () => {
	it("parses markdown note content into tiptap json", () => {
		const parsed = parseStoredNoteContent(
			"# Summary\n\n- shipped ~~markdown~~\n- kept autosave\n\n```ts\nconst ready = true\n```",
			schema,
		);

		expect(parsed).toMatchObject({
			type: "doc",
			content: [
				{
					type: "heading",
					attrs: { level: 1 },
				},
				{
					type: "bulletList",
				},
				{
					type: "codeBlock",
					attrs: { language: "ts" },
				},
			],
		});

		expect(
			parsed.content?.[1]?.content?.[0]?.content?.[0]?.content?.[1]?.marks,
		).toEqual([{ type: "strike" }]);
	});

	it("keeps stored tiptap json content unchanged", () => {
		const document = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "Existing note" }],
				},
			],
		};

		expect(parseStoredNoteContent(JSON.stringify(document), schema)).toEqual(
			document,
		);
	});

	it("serializes tiptap documents back to markdown", () => {
		const document = schema.nodeFromJSON({
			type: "doc",
			content: [
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: "Release notes" }],
				},
				{
					type: "orderedList",
					attrs: { start: 3 },
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [
										{ type: "text", text: "Ship " },
										{
											type: "text",
											text: "markdown",
											marks: [{ type: "strike" }],
										},
									],
								},
							],
						},
					],
				},
			],
		});

		expect(serializeDocumentToMarkdown(document, schema)).toBe(
			"## Release notes\n\n3. Ship ~~markdown~~",
		);
	});

	it("detects markdown-like paste content", () => {
		expect(looksLikeMarkdown("- first item\n- second item")).toBe(true);
		expect(looksLikeMarkdown("Plain note sentence with no formatting")).toBe(
			false,
		);
	});
});
