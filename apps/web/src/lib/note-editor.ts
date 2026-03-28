import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import {
	defaultMarkdownParser,
	MarkdownParser,
	MarkdownSerializer,
	type MarkdownSerializerState,
	type ParseSpec,
} from "@tiptap/pm/markdown";
import type {
	Mark as ProseMirrorMark,
	Node as ProseMirrorNode,
	Schema,
} from "@tiptap/pm/model";
import { Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";

export const EMPTY_DOCUMENT: JSONContent = {
	type: "doc",
	content: [{ type: "paragraph" }],
};

export const EMPTY_DOCUMENT_STRING = JSON.stringify(EMPTY_DOCUMENT);

const PLACEHOLDER_TEXT = "Write notes...";

const markdownParserBySchema = new WeakMap<Schema, MarkdownParser>();
const markdownSerializerBySchema = new WeakMap<Schema, MarkdownSerializer>();

const createMarkdownParser = (schema: Schema) => {
	defaultMarkdownParser.tokenizer.enable("strikethrough");

	const tokens: Record<string, ParseSpec> = {};

	if (schema.nodes.blockquote) {
		tokens.blockquote = { block: "blockquote" };
	}

	if (schema.nodes.paragraph) {
		tokens.paragraph = { block: "paragraph" };
	}

	if (schema.nodes.listItem) {
		tokens.list_item = { block: "listItem" };
	}

	if (schema.nodes.bulletList) {
		tokens.bullet_list = { block: "bulletList" };
	}

	if (schema.nodes.orderedList) {
		tokens.ordered_list = {
			block: "orderedList",
			getAttrs: (token) => {
				const start = Number(token.attrGet("start") ?? 1);
				return start > 1 ? { start } : {};
			},
		};
	}

	if (schema.nodes.heading) {
		tokens.heading = {
			block: "heading",
			getAttrs: (token) => ({
				level: Number(token.tag.slice(1)) || 1,
			}),
		};
	}

	if (schema.nodes.codeBlock) {
		tokens.code_block = { block: "codeBlock", noCloseToken: true };
		tokens.fence = {
			block: "codeBlock",
			getAttrs: (token) => ({
				language: token.info?.trim() || null,
			}),
			noCloseToken: true,
		};
	}

	if (schema.nodes.horizontalRule) {
		tokens.hr = { node: "horizontalRule" };
	}

	if (schema.nodes.hardBreak) {
		tokens.hardbreak = { node: "hardBreak" };
	}

	if (schema.marks.italic) {
		tokens.em = { mark: "italic" };
	}

	if (schema.marks.bold) {
		tokens.strong = { mark: "bold" };
	}

	if (schema.marks.link) {
		tokens.link = {
			mark: "link",
			getAttrs: (token) => ({
				href: token.attrGet("href"),
				title: token.attrGet("title") || null,
			}),
		};
	}

	if (schema.marks.code) {
		tokens.code_inline = { mark: "code", noCloseToken: true };
	}

	if (schema.marks.strike) {
		tokens.s = { mark: "strike" };
	}

	return new MarkdownParser(schema, defaultMarkdownParser.tokenizer, tokens);
};

const backticksFor = (node: ProseMirrorNode, side: number) => {
	const ticks = /`+/g;
	let length = 0;

	if (node.isText) {
		let match = ticks.exec(node.text ?? "");

		while (match !== null) {
			length = Math.max(length, match[0].length);
			match = ticks.exec(node.text ?? "");
		}
	}

	let result = length > 0 && side > 0 ? " `" : "`";

	for (let index = 0; index < length; index += 1) {
		result += "`";
	}

	if (length > 0 && side < 0) {
		result += " ";
	}

	return result;
};

const isPlainUrl = (
	link: ProseMirrorMark,
	parent: ProseMirrorNode,
	index: number,
) => {
	if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) {
		return false;
	}

	const content = parent.child(index);
	if (
		!content.isText ||
		content.text !== link.attrs.href ||
		content.marks[content.marks.length - 1] !== link
	) {
		return false;
	}

	return (
		index === parent.childCount - 1 ||
		!link.isInSet(parent.child(index + 1).marks)
	);
};

const createMarkdownSerializer = (schema: Schema) => {
	const nodes: ConstructorParameters<typeof MarkdownSerializer>[0] = {
		paragraph(state, node) {
			state.renderInline(node);
			state.closeBlock(node);
		},
		text(state, node) {
			state.text(
				node.text ?? "",
				!(state as MarkdownSerializerState).inAutolink,
			);
		},
	};

	if (schema.nodes.blockquote) {
		nodes.blockquote = (state, node) => {
			state.wrapBlock("> ", null, node, () => state.renderContent(node));
		};
	}

	if (schema.nodes.codeBlock) {
		nodes.codeBlock = (state, node) => {
			const language = node.attrs.language ? `${node.attrs.language}` : "";
			const backticks = node.textContent.match(/`{3,}/gm);
			const fence = backticks ? `${backticks.sort().at(-1)}\`` : "```";

			state.write(`${fence}${language}\n`);
			state.text(node.textContent, false);
			state.write("\n");
			state.write(fence);
			state.closeBlock(node);
		};
	}

	if (schema.nodes.heading) {
		nodes.heading = (state, node) => {
			state.write(`${state.repeat("#", node.attrs.level)} `);
			state.renderInline(node, false);
			state.closeBlock(node);
		};
	}

	if (schema.nodes.horizontalRule) {
		nodes.horizontalRule = (state, node) => {
			state.write(node.attrs.markup || "---");
			state.closeBlock(node);
		};
	}

	if (schema.nodes.bulletList) {
		nodes.bulletList = (state, node) => {
			state.renderList(node, "  ", () => "* ");
		};
	}

	if (schema.nodes.orderedList) {
		nodes.orderedList = (state, node) => {
			const start = node.attrs.start || 1;
			const maxWidth = String(start + node.childCount - 1).length;
			const spacing = state.repeat(" ", maxWidth + 2);

			state.renderList(node, spacing, (index) => {
				const nextNumber = String(start + index);
				return `${state.repeat(" ", maxWidth - nextNumber.length)}${nextNumber}. `;
			});
		};
	}

	if (schema.nodes.listItem) {
		nodes.listItem = (state, node) => {
			state.renderContent(node);
		};
	}

	if (schema.nodes.hardBreak) {
		nodes.hardBreak = (state, node, parent, index) => {
			for (
				let nextIndex = index + 1;
				nextIndex < parent.childCount;
				nextIndex += 1
			) {
				if (parent.child(nextIndex).type !== node.type) {
					state.write("\\\n");
					return;
				}
			}
		};
	}

	const marks: ConstructorParameters<typeof MarkdownSerializer>[1] = {};

	if (schema.marks.italic) {
		marks.italic = {
			open: "*",
			close: "*",
			mixable: true,
			expelEnclosingWhitespace: true,
		};
	}

	if (schema.marks.bold) {
		marks.bold = {
			open: "**",
			close: "**",
			mixable: true,
			expelEnclosingWhitespace: true,
		};
	}

	if (schema.marks.link) {
		marks.link = {
			open(state, mark, parent, index) {
				(state as MarkdownSerializerState).inAutolink = isPlainUrl(
					mark,
					parent,
					index,
				);

				return (state as MarkdownSerializerState).inAutolink ? "<" : "[";
			},
			close(state, mark, _parent, _index) {
				const inAutolink = (state as MarkdownSerializerState).inAutolink;
				(state as MarkdownSerializerState).inAutolink = undefined;

				if (inAutolink) {
					return ">";
				}

				const href = mark.attrs.href.replace(/[()"]/g, "\\$&");
				const title = mark.attrs.title
					? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"`
					: "";

				return `](${href}${title})`;
			},
			mixable: true,
		};
	}

	if (schema.marks.code) {
		marks.code = {
			open: (_state, _mark, parent, index) =>
				backticksFor(parent.child(index), -1),
			close: (_state, _mark, parent, index) =>
				backticksFor(parent.child(index - 1), 1),
			escape: false,
		};
	}

	if (schema.marks.strike) {
		marks.strike = {
			open: "~~",
			close: "~~",
			mixable: true,
			expelEnclosingWhitespace: true,
		};
	}

	return new MarkdownSerializer(nodes, marks, {
		strict: false,
	});
};

const getMarkdownParser = (schema: Schema) => {
	const existing = markdownParserBySchema.get(schema);

	if (existing) {
		return existing;
	}

	const nextParser = createMarkdownParser(schema);
	markdownParserBySchema.set(schema, nextParser);
	return nextParser;
};

const getMarkdownSerializer = (schema: Schema) => {
	const existing = markdownSerializerBySchema.get(schema);

	if (existing) {
		return existing;
	}

	const nextSerializer = createMarkdownSerializer(schema);
	markdownSerializerBySchema.set(schema, nextSerializer);
	return nextSerializer;
};

export const createNoteEditorExtensions = () => [
	StarterKit,
	Placeholder.configure({
		placeholder: PLACEHOLDER_TEXT,
		emptyEditorClass: "is-editor-empty",
	}),
];

export const parseMarkdownToDocument = (markdown: string, schema: Schema) =>
	getMarkdownParser(schema).parse(markdown);

export const parseStoredNoteContent = (content: string, schema: Schema) => {
	if (!content.trim()) {
		return EMPTY_DOCUMENT;
	}

	try {
		const parsed = JSON.parse(content) as JSONContent;

		if (parsed && typeof parsed === "object" && parsed.type === "doc") {
			return parsed;
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
) => getMarkdownSerializer(schema).serialize(document).trim();

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

	if (html.trim() || !text.trim() || !looksLikeMarkdown(text)) {
		return false;
	}

	try {
		const document = parseMarkdownToDocument(text, view.state.schema);
		const slice = new Slice(document.content, 0, 0);

		view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
		return true;
	} catch {
		return false;
	}
};
