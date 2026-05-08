import type { JSONContent } from "@tiptap/core";

export type StructuredNoteBody = {
	overview: string[];
	sections: Array<{
		title: string;
		items: string[];
	}>;
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
	const overviewParagraphs = overview.flatMap((item) => {
		const text = item.trim();
		return text ? [createParagraphNode(text)] : [];
	});

	const sectionNodes = sections.flatMap((section) => {
		const title = section.title.trim();
		const items = section.items.flatMap((item) => {
			const text = item.trim();
			return text ? [text] : [];
		});

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
		...overview.flatMap((item) => {
			const text = item.trim();
			return text ? [text] : [];
		}),
		...sections.flatMap((section) => {
			const title = section.title.trim();
			const items = section.items.flatMap((item) => {
				const text = item.trim();
				return text ? [text] : [];
			});
			return title ? [title, ...items] : items;
		}),
	].join("\n");
