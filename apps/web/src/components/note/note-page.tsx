import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { NoteComposer } from "./note-composer";
import { writeTextToClipboard } from "./share-note";

const EMPTY_DOCUMENT: JSONContent = {
	type: "doc",
	content: [{ type: "paragraph" }],
};

const EMPTY_DOCUMENT_STRING = JSON.stringify(EMPTY_DOCUMENT);

type StructuredNoteSection = {
	title: string;
	items: string[];
};

type StructuredNote = {
	title: string;
	overview: string[];
	sections: StructuredNoteSection[];
};

const getPlainTextContent = ({
	editor,
	title,
	searchableText,
}: {
	editor: NonNullable<ReturnType<typeof useEditor>>;
	title: string;
	searchableText: string;
}) => {
	const editorText = editor.getText({ blockSeparator: "\n\n" }).trim();
	return [title.trim(), editorText || searchableText.trim()]
		.filter(Boolean)
		.join("\n\n");
};

const getExportFileName = (title: string) =>
	`${
		title
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "note"
	}.txt`;

const createTextNode = (text: string, bold = false): JSONContent => ({
	type: "text",
	text,
	...(bold ? { marks: [{ type: "bold" }] } : {}),
});

const createParagraphNode = (text: string, bold = false): JSONContent => ({
	type: "paragraph",
	content: [createTextNode(text, bold)],
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

const structuredNoteToDocument = ({
	overview,
	sections,
}: StructuredNote): JSONContent => ({
	type: "doc",
	content: [
		...overview
			.map((item) => item.trim())
			.filter(Boolean)
			.map((item) => createParagraphNode(item)),
		...sections.flatMap((section) => {
			const title = section.title.trim();
			const items = section.items.map((item) => item.trim()).filter(Boolean);

			if (!title && items.length === 0) {
				return [];
			}

			return [
				...(title ? [createParagraphNode(title, true)] : []),
				...(items.length > 0 ? [createBulletListNode(items)] : []),
			];
		}),
	],
});

const structuredNoteToSearchableText = ({
	overview,
	sections,
}: StructuredNote) =>
	[
		...overview.map((item) => item.trim()).filter(Boolean),
		...sections.flatMap((section) => [
			section.title.trim(),
			...section.items.map((item) => item.trim()),
		]),
	]
		.filter(Boolean)
		.join("\n");

const exportTextFile = async ({
	fileName,
	content,
}: {
	fileName: string;
	content: string;
}) => {
	if (window.openGranDesktop) {
		return await window.openGranDesktop.saveTextFile(fileName, content);
	}

	const blob = new Blob([content], {
		type: "text/plain;charset=utf-8",
	});
	const downloadUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = downloadUrl;
	anchor.download = fileName;
	anchor.click();
	URL.revokeObjectURL(downloadUrl);

	return {
		ok: true,
		canceled: false,
		filePath: fileName,
	};
};

const showActionError = (message: string, error: unknown) => {
	console.error(message, error);
	toast.error(message);
};

export type NoteEditorActions = {
	canCopyText: boolean;
	canUndo: boolean;
	canRedo: boolean;
	copyText: () => Promise<void>;
	undo: () => void;
	redo: () => void;
	exportNote: () => Promise<void>;
};

export function NotePage({
	noteId,
	onTitleChange,
	onEditorActionsChange,
}: {
	noteId: Id<"notes"> | null;
	onTitleChange?: (title: string) => void;
	onEditorActionsChange?: (actions: NoteEditorActions | null) => void;
}) {
	const [title, setTitle] = React.useState("");
	const [content, setContent] = React.useState(EMPTY_DOCUMENT_STRING);
	const [searchableText, setSearchableText] = React.useState("");
	const hasHydratedRef = React.useRef(false);
	const hydratedNoteIdRef = React.useRef<Id<"notes"> | null>(null);
	const saveInFlightRef = React.useRef(false);
	const lastSavedSnapshotRef = React.useRef<string | null>(null);
	const queuedSaveRef = React.useRef<{
		snapshot: string;
		payload: {
			title: string;
			content: string;
			searchableText: string;
		};
	} | null>(null);
	const note = useQuery(
		api.notes.get,
		noteId
			? {
					id: noteId,
				}
			: "skip",
	);
	const saveNote = useMutation(api.notes.save);

	const flushSave = React.useCallback(
		async (
			nextNoteId: Id<"notes">,
			snapshot: string,
			payload: {
				title: string;
				content: string;
				searchableText: string;
			},
		) => {
			if (saveInFlightRef.current) {
				queuedSaveRef.current = { snapshot, payload };
				return;
			}

			saveInFlightRef.current = true;

			try {
				await saveNote({
					id: nextNoteId,
					...payload,
				});
				lastSavedSnapshotRef.current = snapshot;
			} catch (error) {
				console.error("Failed to save note", error);
			} finally {
				saveInFlightRef.current = false;

				const queuedSave = queuedSaveRef.current;
				const shouldFlushQueuedSave =
					queuedSave && queuedSave.snapshot !== lastSavedSnapshotRef.current;
				if (!shouldFlushQueuedSave) {
					queuedSaveRef.current = null;
				} else {
					queuedSaveRef.current = null;
					void flushSave(nextNoteId, queuedSave.snapshot, queuedSave.payload);
				}
			}
		},
		[saveNote],
	);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: false,
				codeBlock: false,
				horizontalRule: false,
			}),
			Placeholder.configure({
				placeholder: "Write notes...",
				emptyEditorClass: "is-editor-empty",
			}),
		],
		immediatelyRender: false,
		autofocus: "end",
		editorProps: {
			attributes: {
				class:
					"note-tiptap min-h-[240px] border border-transparent bg-transparent px-0 py-0 text-base outline-none",
			},
		},
		onUpdate: ({ editor }) => {
			setContent(JSON.stringify(editor.getJSON()));
			setSearchableText(editor.getText());
		},
	});

	React.useEffect(() => {
		if (hydratedNoteIdRef.current !== noteId) {
			hydratedNoteIdRef.current = noteId;
			hasHydratedRef.current = false;
			lastSavedSnapshotRef.current = null;
			queuedSaveRef.current = null;
		}

		if (!editor || !noteId || note === undefined || hasHydratedRef.current) {
			return;
		}

		if (note) {
			let nextContent = EMPTY_DOCUMENT;
			try {
				nextContent = JSON.parse(note.content) as JSONContent;
			} catch {
				nextContent = EMPTY_DOCUMENT;
			}

			setTitle(note.title);
			onTitleChange?.(note.title);
			setContent(note.content);
			setSearchableText(note.searchableText);
			lastSavedSnapshotRef.current = JSON.stringify({
				title: note.title,
				content: note.content,
				searchableText: note.searchableText,
			});
			editor.commands.setContent(nextContent, false);
		} else {
			lastSavedSnapshotRef.current = JSON.stringify({
				title: "",
				content: EMPTY_DOCUMENT_STRING,
				searchableText: "",
			});
			editor.commands.setContent(EMPTY_DOCUMENT, false);
		}

		hasHydratedRef.current = true;
	}, [editor, note, noteId, onTitleChange]);

	React.useEffect(() => {
		if (!noteId || !hasHydratedRef.current) {
			return;
		}

		if (!title.trim() && !searchableText.trim()) {
			return;
		}

		const snapshot = JSON.stringify({
			title,
			content,
			searchableText,
		});

		if (snapshot === lastSavedSnapshotRef.current) {
			return;
		}

		const timeout = window.setTimeout(() => {
			void flushSave(noteId, snapshot, {
				title,
				content,
				searchableText,
			});
		}, 500);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [content, flushSave, noteId, searchableText, title]);

	React.useEffect(() => {
		onTitleChange?.(title || "New quick note");
	}, [onTitleChange, title]);

	React.useEffect(() => {
		if (!noteId || !editor) {
			onEditorActionsChange?.(null);
			return;
		}

		const publishEditorActions = () => {
			const serializedText = getPlainTextContent({
				editor,
				title,
				searchableText,
			});
			const hasText = Boolean(serializedText);

			onEditorActionsChange?.({
				canCopyText: hasText,
				canUndo: editor.can().undo(),
				canRedo: editor.can().redo(),
				copyText: async () => {
					if (!hasText) {
						toast("Nothing to copy yet");
						return;
					}

					try {
						await writeTextToClipboard(serializedText);
						toast.success("Text copied");
					} catch (error) {
						showActionError("Failed to copy text", error);
					}
				},
				undo: () => {
					if (!editor.can().undo()) {
						toast("Nothing to undo");
						return;
					}

					editor.chain().focus().undo().run();
					toast.success("Undid last change");
				},
				redo: () => {
					if (!editor.can().redo()) {
						toast("Nothing to redo");
						return;
					}

					editor.chain().focus().redo().run();
					toast.success("Redid last change");
				},
				exportNote: async () => {
					if (!hasText) {
						toast("Nothing to export yet");
						return;
					}

					try {
						const result = await exportTextFile({
							fileName: getExportFileName(title),
							content: serializedText,
						});

						if (result.canceled) {
							toast("Export canceled");
							return;
						}

						toast.success("Quick note exported");
					} catch (error) {
						showActionError("Failed to export note", error);
					}
				},
			});
		};

		publishEditorActions();
		editor.on("transaction", publishEditorActions);

		return () => {
			editor.off("transaction", publishEditorActions);
		};
	}, [editor, noteId, onEditorActionsChange, searchableText, title]);

	const handleEnhanceTranscript = React.useCallback(
		async (transcript: string) => {
			if (!editor || !transcript.trim()) {
				return;
			}

			try {
				const response = await fetch("/api/enhance-note", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						title,
						rawNotes: searchableText,
						transcript,
					}),
				});

				const payload = (await response.json().catch(() => ({}))) as {
					error?: string;
					note?: StructuredNote;
				};

				if (!response.ok || !payload.note) {
					throw new Error(payload.error || "Failed to enhance note.");
				}

				const nextDocument = structuredNoteToDocument(payload.note);
				const nextContent = JSON.stringify(nextDocument);
				const nextSearchableText = structuredNoteToSearchableText(payload.note);
				const nextTitle = payload.note.title.trim() || title;

				editor.commands.setContent(nextDocument, false);
				setTitle(nextTitle);
				setContent(nextContent);
				setSearchableText(nextSearchableText);
				toast.success("Structured notes ready");
			} catch (error) {
				showActionError("Failed to enhance transcript", error);
			}
		},
		[editor, searchableText, title],
	);

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
				<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-6">
					<div className="flex-1 pt-4 md:pt-8">
						<div className="flex flex-col gap-5">
							<Input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="New quick note"
								aria-label="Quick note title"
								className="h-auto border-0 !bg-transparent px-0 py-0 text-3xl font-normal shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:text-4xl"
							/>

							<EditorContent
								editor={editor}
								className={cn(
									"min-h-[320px] text-foreground",
									"[&_.ProseMirror]:min-h-[320px]",
									"[&_.ProseMirror_p]:mb-3 [&_.ProseMirror_p]:mt-0",
									"[&_.ProseMirror_ul]:mb-3 [&_.ProseMirror_ul]:pl-6",
									"[&_.ProseMirror_ol]:mb-3 [&_.ProseMirror_ol]:pl-6",
									"[&_.ProseMirror_li]:mb-1",
									"[&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:border-l [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground",
								)}
							/>
						</div>
					</div>

					<NoteComposer onEnhanceTranscript={handleEnhanceTranscript} />
				</div>
			</div>
		</div>
	);
}
