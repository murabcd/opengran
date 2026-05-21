import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions/undo-redo";

export const createPlainTextEditorExtensions = () => [
	Document,
	Paragraph,
	Text,
	UndoRedo,
];
