import type { JSONContent } from "@tiptap/core";

export type StructuredNoteSection = {
	title: string;
	items: string[];
};

export type StructuredNoteBody = {
	overview: string[];
	sections: StructuredNoteSection[];
};

export type StructuredNote = StructuredNoteBody & {
	title: string;
};

const createTextNode = (text: string): JSONContent => ({
	type: "text",
	text,
});

const createParagraphNode = (text: string): JSONContent => ({
	type: "paragraph",
	content: [createTextNode(text)],
});

const createHeadingNode = (text: string, level: 2 | 3 = 2): JSONContent => ({
	type: "heading",
	attrs: {
		level,
	},
	content: [createTextNode(text)],
});

const createBulletListNode = (items: string[]): JSONContent => ({
	type: "bulletList",
	content: items.map((item) => ({
		type: "listItem",
		content: [
			{
				type: "paragraph",
				content: [createTextNode(item)],
			},
		],
	})),
});

export const structuredNoteToDocument = ({
	overview,
	sections,
}: StructuredNoteBody): JSONContent => {
	const overviewParagraphs = overview
		.map((item) => item.trim())
		.filter(Boolean)
		.map((item) => createParagraphNode(item));

	const sectionNodes = sections.flatMap((section) => {
		const title = section.title.trim();
		const items = section.items.map((item) => item.trim()).filter(Boolean);

		if (!title && items.length === 0) {
			return [];
		}

		if (!title) {
			return [createBulletListNode(items)];
		}

		return [
			createHeadingNode(title, 2),
			...(items.length > 0 ? [createBulletListNode(items)] : []),
		];
	});

	const nextContent = [...overviewParagraphs, ...sectionNodes];

	return {
		type: "doc",
		content: nextContent.length > 0 ? nextContent : [{ type: "paragraph" }],
	};
};

export const structuredNoteToSearchableText = ({
	overview,
	sections,
}: StructuredNoteBody) =>
	[
		...overview.map((item) => item.trim()).filter(Boolean),
		...sections.flatMap((section) => [
			section.title.trim(),
			...section.items.map((item) => item.trim()),
		]),
	]
		.filter(Boolean)
		.join("\n");
