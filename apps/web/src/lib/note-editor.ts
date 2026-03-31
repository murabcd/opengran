import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown, MarkdownManager } from "@tiptap/markdown";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { Node as PMNode, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

export const EMPTY_DOCUMENT: JSONContent = {
	type: "doc",
	content: [{ type: "paragraph" }],
};

export const EMPTY_DOCUMENT_STRING = JSON.stringify(EMPTY_DOCUMENT);

const PLACEHOLDER_TEXT = "Write notes...";
const BULLET_SYMBOL_PATTERN = /^(\s*)[•◦▪‣·]\s+/u;
const MARKDOWN_LIST_PATTERN = /^\s*(?:[-+*]|\d+\.)\s+/;
const MARKDOWN_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/;

const markdownManagerBySchema = new WeakMap<Schema, MarkdownManager>();

const isTextNode = (
	node: JSONContent | undefined,
): node is JSONContent & {
	type: "text";
	text: string;
} => node?.type === "text" && typeof node.text === "string";

const getParagraphTextMetadata = (node: JSONContent) => {
	if (node.type !== "paragraph" || !node.content?.length) {
		return null;
	}

	let text = "";
	let sawBold = false;
	let sawPlain = false;

	for (const child of node.content) {
		if (!isTextNode(child)) {
			return null;
		}

		text += child.text;

		const marks = child.marks ?? [];
		if (marks.length === 0) {
			if (child.text.trim()) {
				sawPlain = true;
			}
			continue;
		}

		const hasOnlyBoldMark =
			marks.length === 1 &&
			marks[0]?.type === "bold" &&
			child.text.trim().length > 0;

		if (!hasOnlyBoldMark) {
			return null;
		}

		sawBold = true;
	}

	return {
		text: text.trim(),
		isBoldOnly: sawBold && !sawPlain,
		isPlainOnly: !sawBold && sawPlain,
	};
};

const shouldPromoteParagraphToHeading = (
	node: JSONContent,
	nextNode?: JSONContent,
) => {
	const metadata = getParagraphTextMetadata(node);
	if (!metadata) {
		return false;
	}

	const text = metadata.text;
	if (!text || text.length > 120) {
		return false;
	}

	if (metadata.isBoldOnly) {
		return true;
	}

	if (!metadata.isPlainOnly) {
		return false;
	}

	if (
		!nextNode ||
		!["bulletList", "orderedList"].includes(nextNode.type ?? "")
	) {
		return false;
	}

	if (/[.!?;:]$/.test(text)) {
		return false;
	}

	return text.split(/\s+/).length <= 10;
};

const normalizeTopLevelNoteContentNodes = (
	content?: JSONContent[],
): JSONContent[] | undefined => {
	if (!content) {
		return content;
	}

	return content.map((node, index) => {
		const nextNode = content[index + 1];
		if (!shouldPromoteParagraphToHeading(node, nextNode)) {
			return node;
		}

		const text = getParagraphTextMetadata(node)?.text ?? "";
		return {
			type: "heading",
			attrs: {
				level: 2,
			},
			content: text ? [{ type: "text", text }] : undefined,
		} satisfies JSONContent;
	});
};

const normalizeNoteDocument = (document: JSONContent): JSONContent => {
	if (document.type !== "doc") {
		return document;
	}

	return {
		...document,
		content: normalizeTopLevelNoteContentNodes(document.content),
	};
};

export const normalizePastedPlainText = (text: string) => {
	const lines = text.replace(/\r/g, "").split("\n");
	const normalizedLines = lines.map((line) =>
		line.replace(BULLET_SYMBOL_PATTERN, "$1- "),
	);

	return normalizedLines
		.map((line, index) => {
			const trimmed = line.trim();
			if (
				!trimmed ||
				MARKDOWN_HEADING_PATTERN.test(trimmed) ||
				MARKDOWN_LIST_PATTERN.test(trimmed)
			) {
				return line;
			}

			const nextNonEmptyIndex = normalizedLines.findIndex(
				(candidate, candidateIndex) =>
					candidateIndex > index && candidate.trim().length > 0,
			);
			if (nextNonEmptyIndex < 0) {
				return line;
			}

			const nextLine = normalizedLines[nextNonEmptyIndex]?.trim() ?? "";
			if (!MARKDOWN_LIST_PATTERN.test(nextLine)) {
				return line;
			}

			if (/[.!?;:]$/.test(trimmed) || trimmed.split(/\s+/).length > 10) {
				return line;
			}

			return `## ${trimmed}`;
		})
		.join("\n");
};

export const normalizePastedSlice = (slice: Slice, schema: Schema) => {
	const normalizedDocument = normalizeNoteDocument({
		type: "doc",
		content: slice.content.toJSON() as JSONContent[],
	});
	const normalizedNode = PMNode.fromJSON(schema, normalizedDocument);

	return new Slice(normalizedNode.content, slice.openStart, slice.openEnd);
};

export const createNoteEditorExtensions = () => [
	StarterKit,
	Markdown.configure({
		indentation: {
			style: "space",
			size: 2,
		},
	}),
	Placeholder.configure({
		placeholder: PLACEHOLDER_TEXT,
		emptyEditorClass: "is-editor-empty",
	}),
];

const getMarkdownManager = (schema: Schema) => {
	const existing = markdownManagerBySchema.get(schema);

	if (existing) {
		return existing;
	}

	const nextManager = new MarkdownManager({
		extensions: createNoteEditorExtensions(),
		indentation: {
			style: "space",
			size: 2,
		},
	});
	markdownManagerBySchema.set(schema, nextManager);
	return nextManager;
};

const validateDocument = (document: JSONContent, schema: Schema) =>
	schema.nodeFromJSON(document).toJSON() as JSONContent;

export const parseMarkdownToDocument = (markdown: string, schema: Schema) => {
	const normalizedDocument = normalizeNoteDocument(
		getMarkdownManager(schema).parse(markdown),
	);

	return PMNode.fromJSON(schema, validateDocument(normalizedDocument, schema));
};

export const parseStoredNoteContent = (content: string, schema: Schema) => {
	if (!content.trim()) {
		return EMPTY_DOCUMENT;
	}

	try {
		const parsed = JSON.parse(content) as JSONContent;

		if (parsed && typeof parsed === "object" && parsed.type === "doc") {
			return validateDocument(normalizeNoteDocument(parsed), schema);
		}
	} catch {
		// Fall through to markdown parsing.
	}

	try {
		return parseMarkdownToDocument(content, schema).toJSON() as JSONContent;
	} catch {
		return EMPTY_DOCUMENT;
	}
};

export const serializeDocumentToMarkdown = (
	document: ProseMirrorNode,
	schema: Schema,
) =>
	getMarkdownManager(schema)
		.serialize(document.toJSON() as JSONContent)
		.trim();

export const looksLikeMarkdown = (value: string) =>
	[
		/^\s{0,3}#{1,6}\s+/m,
		/^\s{0,3}>\s+/m,
		/^\s{0,3}[-+*]\s+/m,
		/^\s{0,3}\d+\.\s+/m,
		/^\s{0,3}```/m,
		/^\s{0,3}(?:---|\*\*\*|___)\s*$/m,
		/\[[^\]]+\]\([^)]+\)/,
		/(^|[^\w])\*\*[^*\n]+\*\*/,
		/(^|[^\w])\*[^*\n]+\*/,
		/`[^`\n]+`/,
	].some((pattern) => pattern.test(value));

export const handleMarkdownPaste = (
	view: EditorView,
	event: ClipboardEvent,
) => {
	const html = event.clipboardData?.getData("text/html") ?? "";
	const text = event.clipboardData?.getData("text/plain") ?? "";
	const normalizedText = normalizePastedPlainText(text);

	if (
		html.trim() ||
		!normalizedText.trim() ||
		!looksLikeMarkdown(normalizedText)
	) {
		return false;
	}

	try {
		const document = parseMarkdownToDocument(normalizedText, view.state.schema);
		const slice = new Slice(document.content, 0, 0);

		view.dispatch(
			view.state.tr
				.replaceSelection(normalizePastedSlice(slice, view.state.schema))
				.scrollIntoView(),
		);
		return true;
	} catch {
		return false;
	}
};
