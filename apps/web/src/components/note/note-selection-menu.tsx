import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { Bold, Code2, Italic, MessageSquareText } from "lucide-react";

const hasTextSelection = (editor: Editor) => {
	const { empty, from, to } = editor.state.selection;

	if (empty || from === to) {
		return false;
	}

	return editor.state.doc.textBetween(from, to, "\n").trim().length > 0;
};

export function NoteSelectionMenu({
	editor,
	onComment,
}: {
	editor: Editor | null;
	onComment: () => void;
}) {
	if (!editor) {
		return null;
	}

	return (
		<BubbleMenu
			editor={editor}
			updateDelay={150}
			options={{ offset: 8 }}
			shouldShow={({ editor: currentEditor }) =>
				hasTextSelection(currentEditor)
			}
		>
			<div className="note-selection-menu">
				<Button
					type="button"
					variant={editor.isActive("bold") ? "secondary" : "ghost"}
					size="icon-sm"
					onClick={() => editor.chain().focus().toggleBold().run()}
				>
					<Bold />
					<span className="sr-only">Bold</span>
				</Button>
				<Button
					type="button"
					variant={editor.isActive("italic") ? "secondary" : "ghost"}
					size="icon-sm"
					onClick={() => editor.chain().focus().toggleItalic().run()}
				>
					<Italic />
					<span className="sr-only">Italic</span>
				</Button>
				<Button
					type="button"
					variant={editor.isActive("code") ? "secondary" : "ghost"}
					size="icon-sm"
					onClick={() => editor.chain().focus().toggleCode().run()}
				>
					<Code2 />
					<span className="sr-only">Code</span>
				</Button>
				<Separator orientation="vertical" className="h-5" />
				<Button type="button" variant="ghost" size="sm" onClick={onComment}>
					<MessageSquareText data-icon="inline-start" />
					Comment
				</Button>
			</div>
		</BubbleMenu>
	);
}
