import { describe, expect, it } from "vitest";
import {
	structuredNoteToDocument,
	structuredNoteToSearchableText,
} from "../src/lib/structured-note";

describe("structured note formatting", () => {
	it("converts structured notes into semantic headings and bullet lists", () => {
		const document = structuredNoteToDocument({
			overview: ["Discussed priorities for next week."],
			sections: [
				{
					title: "Priorities",
					items: ["Ship editor polish", "Review onboarding flow"],
				},
				{
					title: "Risks",
					items: ["Desktop sync is still flaky"],
				},
			],
		});

		expect(document).toMatchObject({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Discussed priorities for next week." },
					],
				},
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: "Priorities" }],
				},
				{
					type: "bulletList",
				},
				{
					type: "heading",
					attrs: { level: 2 },
					content: [{ type: "text", text: "Risks" }],
				},
				{
					type: "bulletList",
				},
			],
		});
	});

	it("keeps searchable text flat for indexing", () => {
		expect(
			structuredNoteToSearchableText({
				overview: ["Alpha"],
				sections: [{ title: "Beta", items: ["Gamma", "Delta"] }],
			}),
		).toBe("Alpha\nBeta\nGamma\nDelta");
	});
});
