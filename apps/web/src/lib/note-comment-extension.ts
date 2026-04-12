import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		noteComment: {
			setNoteComment: (attributes: { threadId: string }) => ReturnType;
			unsetNoteComment: () => ReturnType;
		};
	}
}

type NoteCommentOptions = {
	onThreadClick?: (threadId: string) => void;
};

export const NoteComment = Mark.create<NoteCommentOptions>({
	name: "noteComment",

	priority: 900,

	inclusive: false,

	keepOnSplit: false,

	addOptions() {
		return {
			onThreadClick: undefined,
		};
	},

	addAttributes() {
		return {
			threadId: {
				default: null,
				parseHTML: (element) =>
					element.getAttribute("data-note-comment-thread-id"),
				renderHTML: (attributes) =>
					attributes.threadId
						? {
								"data-note-comment-thread-id": attributes.threadId,
							}
						: {},
			},
		};
	},

	parseHTML() {
		return [
			{ tag: "span[data-note-comment-thread-id]" },
			{ tag: "mark[data-note-comment-thread-id]" },
		];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				class: "note-comment-anchor",
			}),
			0,
		];
	},

	renderMarkdown(node, helpers) {
		return helpers.renderChildren(node.content || []);
	},

	addCommands() {
		return {
			setNoteComment:
				(attributes) =>
				({ commands }) =>
					commands.setMark(this.name, attributes),
			unsetNoteComment:
				() =>
				({ commands }) =>
					commands.unsetMark(this.name),
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				props: {
					handleClick: (_view, _pos, event) => {
						const target =
							event.target instanceof HTMLElement
								? event.target.closest<HTMLElement>(
										"[data-note-comment-thread-id]",
									)
								: null;
						const threadId = target?.dataset.noteCommentThreadId?.trim();

						if (!threadId) {
							return false;
						}

						if (!this.options.onThreadClick) {
							return false;
						}

						this.options.onThreadClick(threadId);
						return true;
					},
				},
			}),
		];
	},
});
