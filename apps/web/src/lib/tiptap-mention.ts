import type { Editor, Range } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";

export const TypedMention = Mention.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			type: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-mention-type"),
				renderHTML: (attributes) =>
					attributes.type
						? { "data-mention-type": String(attributes.type) }
						: {},
			},
		};
	},
});

export type MentionPickerPosition = {
	top: number;
	left: number;
};

export const INLINE_MENTION_CLASS =
	"inline cursor-pointer align-baseline whitespace-nowrap text-inherit";

export const INLINE_MENTION_LABEL_CLASS =
	"cursor-pointer font-medium text-blue-400 decoration-blue-300/80 decoration-dotted underline-offset-4 hover:underline";

const MENTION_PICKER_MAX_HEIGHT = 288;
const MENTION_PICKER_VIEWPORT_MARGIN = 12;
const MENTION_PICKER_HEADER_HEIGHT = 32;
const MENTION_PICKER_ROW_HEIGHT = 38;
const MENTION_PICKER_VERTICAL_PADDING = 8;
const MENTION_PICKER_MIN_SECTIONED_HEIGHT = 168;
const MENTION_PICKER_WIDTH = 288;

const getMentionPickerEstimatedHeight = ({
	itemCount,
	minSectionedHeight = false,
}: {
	itemCount: number;
	minSectionedHeight?: boolean;
}) =>
	Math.min(
		MENTION_PICKER_MAX_HEIGHT,
		Math.max(
			minSectionedHeight && itemCount > 1
				? MENTION_PICKER_MIN_SECTIONED_HEIGHT
				: 0,
			MENTION_PICKER_VERTICAL_PADDING +
				MENTION_PICKER_HEADER_HEIGHT +
				Math.max(1, itemCount) * MENTION_PICKER_ROW_HEIGHT,
		),
	);

export const getMentionAnchorRect = (editor: Editor, range: Range) => {
	const triggerRect = editor.view.coordsAtPos(Math.max(0, range.from));
	const selection = editor.view.dom.ownerDocument.getSelection();
	const selectionRange =
		selection &&
		selection.rangeCount > 0 &&
		selection.anchorNode &&
		editor.view.dom.contains(selection.anchorNode)
			? selection.getRangeAt(0)
			: null;
	const selectionRect = selectionRange?.getBoundingClientRect();
	const caretRect =
		selectionRect && (selectionRect.width > 0 || selectionRect.height > 0)
			? selectionRect
			: editor.view.coordsAtPos(Math.max(0, range.to));

	return {
		bottom: caretRect.bottom,
		left: triggerRect.left,
		top: caretRect.top,
	};
};

export const getMentionPickerPosition = ({
	rect,
	itemCount,
	minSectionedHeight = false,
}: {
	rect: Pick<DOMRect, "bottom" | "left" | "top">;
	itemCount: number;
	minSectionedHeight?: boolean;
}): MentionPickerPosition => {
	const preferredTop = rect.bottom + 8;
	const estimatedHeight = getMentionPickerEstimatedHeight({
		itemCount,
		minSectionedHeight,
	});
	const hasRoomBelow =
		preferredTop + estimatedHeight <=
		window.innerHeight - MENTION_PICKER_VIEWPORT_MARGIN;
	const top = hasRoomBelow
		? preferredTop
		: Math.max(MENTION_PICKER_VIEWPORT_MARGIN, rect.top - estimatedHeight - 8);

	return {
		top,
		left: Math.min(
			Math.max(MENTION_PICKER_VIEWPORT_MARGIN, rect.left),
			window.innerWidth - MENTION_PICKER_WIDTH - MENTION_PICKER_VIEWPORT_MARGIN,
		),
	};
};
