import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { ShimmerText } from "@/components/ai-elements/shimmer";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import type { NoteTemplate } from "../templates/note-template-select";
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

type StructuredNoteBody = {
	overview: string[];
	sections: StructuredNoteSection[];
};

type StructuredNote = StructuredNoteBody & {
	title: string;
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
}: StructuredNoteBody): JSONContent => {
	const nextContent = [
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
	];

	return {
		type: "doc",
		content: nextContent.length > 0 ? nextContent : [{ type: "paragraph" }],
	};
};

const plainTextToDocumentNodes = (text: string): JSONContent[] =>
	text
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => ({
			type: "paragraph",
			content: [createTextNode(chunk)],
		}));

const structuredNoteToSearchableText = ({
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
	applyTemplate: (template: NoteTemplate) => Promise<boolean>;
};

const useNotePageController = ({
	noteId,
	onTitleChange,
	onEditorActionsChange,
}: {
	noteId: Id<"notes"> | null;
	onTitleChange?: (title: string) => void;
	onEditorActionsChange?: (actions: NoteEditorActions | null) => void;
}) => {
	const [title, setTitle] = React.useState("");
	const [content, setContent] = React.useState(EMPTY_DOCUMENT_STRING);
	const [searchableText, setSearchableText] = React.useState("");
	const [templateApplyState, setTemplateApplyState] = React.useState<{
		isRunning: boolean;
		templateName: string | null;
		streamedMarkdown: string;
	}>(() => ({
		isRunning: false,
		templateName: null,
		streamedMarkdown: "",
	}));
	const nextNoteIdRef = React.useRef<Id<"notes"> | null>(null);
	const titleTextareaRef = React.useRef<HTMLTextAreaElement>(null);
	const latestEditorStateRef = React.useRef<{
		title: string;
		searchableText: string;
		templateSlug: string | null;
		isApplyingTemplate: boolean;
	}>({
		title: "",
		searchableText: "",
		templateSlug: null,
		isApplyingTemplate: false,
	});
	const hasHydratedRef = React.useRef(false);
	const hydratedNoteIdRef = React.useRef<Id<"notes"> | null>(null);
	const saveInFlightRef = React.useRef(false);
	const lastSavedSnapshotRef = React.useRef<string | null>(null);
	const publishedEditorActionsRef = React.useRef<{
		noteId: Id<"notes">;
		canCopyText: boolean;
		canUndo: boolean;
		canRedo: boolean;
	} | null>(null);
	const publishEditorActionsRef = React.useRef<(() => void) | null>(null);
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
	const setNoteTemplate = useMutation(
		api.notes.setTemplate,
	).withOptimisticUpdate((localStore, args) => {
		const nextTemplateSlug = args.templateSlug ?? undefined;
		const patchNote = <T extends Doc<"notes">>(currentNote: T): T => ({
			...currentNote,
			templateSlug: nextTemplateSlug,
		});
		const currentNote = localStore.getQuery(api.notes.get, { id: args.id });
		if (currentNote !== undefined) {
			localStore.setQuery(
				api.notes.get,
				{ id: args.id },
				currentNote ? patchNote(currentNote) : currentNote,
			);
		}

		const latestNote = localStore.getQuery(api.notes.getLatest, {});
		if (latestNote?._id === args.id) {
			localStore.setQuery(api.notes.getLatest, {}, patchNote(latestNote));
		}

		const noteLists = [
			api.notes.list,
			api.notes.listShared,
			api.notes.listArchived,
		] as const;

		for (const noteQuery of noteLists) {
			const notes = localStore.getQuery(noteQuery, {});
			if (notes !== undefined) {
				localStore.setQuery(
					noteQuery,
					{},
					notes.map((item) => (item._id === args.id ? patchNote(item) : item)),
				);
			}
		}
	});

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
		nextNoteIdRef.current = noteId;
	}, [noteId]);

	React.useEffect(() => {
		if (!editor) {
			return;
		}

		editor.setEditable(!templateApplyState.isRunning);
	}, [editor, templateApplyState.isRunning]);

	React.useEffect(() => {
		latestEditorStateRef.current = {
			title,
			searchableText,
			templateSlug: note?.templateSlug ?? null,
			isApplyingTemplate: templateApplyState.isRunning,
		};
		publishEditorActionsRef.current?.();
	}, [note?.templateSlug, searchableText, templateApplyState.isRunning, title]);

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
			editor.commands.setContent(nextContent, { emitUpdate: false });
		} else {
			lastSavedSnapshotRef.current = JSON.stringify({
				title: "",
				content: EMPTY_DOCUMENT_STRING,
				searchableText: "",
			});
			editor.commands.setContent(EMPTY_DOCUMENT, { emitUpdate: false });
		}

		hasHydratedRef.current = true;
	}, [editor, note, noteId, onTitleChange]);

	React.useEffect(() => {
		if (!noteId || !hasHydratedRef.current) {
			return;
		}

		if (templateApplyState.isRunning) {
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
	}, [
		content,
		flushSave,
		noteId,
		searchableText,
		templateApplyState.isRunning,
		title,
	]);

	React.useEffect(() => {
		onTitleChange?.(title || "New note");
	}, [onTitleChange, title]);

	React.useEffect(() => {
		const element = titleTextareaRef.current;
		if (!element) {
			return;
		}

		element.style.height = "auto";
		element.style.height = `${element.scrollHeight}px`;
	}, []);

	const copyText = React.useCallback(async () => {
		if (!editor) {
			return;
		}

		const { title, searchableText } = latestEditorStateRef.current;
		const serializedText = getPlainTextContent({
			editor,
			title,
			searchableText,
		});

		if (!serializedText) {
			toast("Nothing to copy yet");
			return;
		}

		try {
			await writeTextToClipboard(serializedText);
			toast.success("Text copied");
		} catch (error) {
			showActionError("Failed to copy text", error);
		}
	}, [editor]);

	const undo = React.useCallback(() => {
		if (!editor) {
			return;
		}

		if (!editor.can().undo()) {
			toast("Nothing to undo");
			return;
		}

		editor.chain().focus().undo().run();
		toast.success("Undid last change");
	}, [editor]);

	const redo = React.useCallback(() => {
		if (!editor) {
			return;
		}

		if (!editor.can().redo()) {
			toast("Nothing to redo");
			return;
		}

		editor.chain().focus().redo().run();
		toast.success("Redid last change");
	}, [editor]);

	const exportNote = React.useCallback(async () => {
		if (!editor) {
			return;
		}

		const { title, searchableText } = latestEditorStateRef.current;
		const serializedText = getPlainTextContent({
			editor,
			title,
			searchableText,
		});

		if (!serializedText) {
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

			toast.success("Note exported");
		} catch (error) {
			showActionError("Failed to export note", error);
		}
	}, [editor]);

	const appendChatResponseToNote = React.useCallback(
		async (text: string) => {
			if (!editor) {
				return;
			}

			const nextText = text.trim();

			if (!nextText) {
				return;
			}

			editor
				.chain()
				.focus()
				.insertContent(plainTextToDocumentNodes(nextText))
				.run();
			toast.success("Added to note");
		},
		[editor],
	);

	const applyTemplate = React.useCallback(
		async (template: NoteTemplate) => {
			if (!editor || !noteId) {
				return false;
			}

			const {
				title,
				searchableText,
				templateSlug: previousTemplateSlug,
				isApplyingTemplate,
			} = latestEditorStateRef.current;
			const serializedText = getPlainTextContent({
				editor,
				title,
				searchableText,
			});
			const previousContent = content;
			const previousSearchableText = searchableText;
			const previousDocument = editor.getJSON();

			if (isApplyingTemplate) {
				return false;
			}

			if (!serializedText.trim()) {
				toast("Nothing to rewrite yet");
				return false;
			}

			setTemplateApplyState({
				isRunning: true,
				templateName: template.name,
				streamedMarkdown: "",
			});

			try {
				await setNoteTemplate({
					id: nextNoteIdRef.current ?? noteId,
					templateSlug: template.slug,
				});

				editor.commands.setContent(EMPTY_DOCUMENT, { emitUpdate: false });
				setContent(EMPTY_DOCUMENT_STRING);
				setSearchableText("");

				const response = await fetch("/api/apply-template", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/x-ndjson",
					},
					body: JSON.stringify({
						title,
						noteText: serializedText,
						template,
					}),
				});

				if (!response.ok) {
					const errorText = await response.text().catch(() => "");
					throw new Error(errorText || "Failed to apply template.");
				}

				const stream = response.body;
				if (!stream) {
					throw new Error("Template rewrite stream is not available.");
				}

				const reader = stream.getReader();
				const decoder = new TextDecoder();
				let finalNote: StructuredNoteBody | null = null;
				let responseError: string | null = null;
				let bufferedResponse = "";
				let streamedText = "";

				const handleEvent = (rawLine: string) => {
					const line = rawLine.trim();
					if (!line) {
						return;
					}

					const payload = JSON.parse(line) as
						| {
								type: "text-delta";
								delta?: string;
						  }
						| {
								type: "final-note";
								note?: StructuredNoteBody;
						  }
						| {
								type: "error";
								error?: string;
						  };

					if (payload.type === "text-delta") {
						const delta = payload.delta ?? "";
						streamedText += delta;
						setTemplateApplyState({
							isRunning: true,
							templateName: template.name,
							streamedMarkdown: streamedText,
						});
						return;
					}

					if (payload.type === "final-note") {
						finalNote = payload.note ?? null;
						return;
					}

					responseError = payload.error ?? "Failed to apply template.";
				};

				while (true) {
					const { done, value } = await reader.read();
					bufferedResponse += decoder.decode(value ?? new Uint8Array(), {
						stream: !done,
					});

					let lineBreakIndex = bufferedResponse.indexOf("\n");
					while (lineBreakIndex >= 0) {
						const nextLine = bufferedResponse.slice(0, lineBreakIndex);
						bufferedResponse = bufferedResponse.slice(lineBreakIndex + 1);
						handleEvent(nextLine);
						lineBreakIndex = bufferedResponse.indexOf("\n");
					}

					if (done) {
						break;
					}
				}

				if (bufferedResponse.trim()) {
					handleEvent(bufferedResponse);
				}

				if (responseError) {
					throw new Error(responseError);
				}

				if (!finalNote) {
					throw new Error(
						"Template rewrite finished without a validated structured note.",
					);
				}

				const nextDocument = structuredNoteToDocument(finalNote);
				const nextContent = JSON.stringify(nextDocument);
				const nextSearchableText = structuredNoteToSearchableText(finalNote);

				editor.commands.setContent(nextDocument, { emitUpdate: false });
				setContent(nextContent);
				setSearchableText(nextSearchableText);
				toast.success(`Rewrote note with ${template.name}`);

				return true;
			} catch (error) {
				try {
					await setNoteTemplate({
						id: nextNoteIdRef.current ?? noteId,
						templateSlug: previousTemplateSlug,
					});
				} catch (revertError) {
					console.error("Failed to revert note template", revertError);
				}
				editor.commands.setContent(previousDocument, { emitUpdate: false });
				setContent(previousContent);
				setSearchableText(previousSearchableText);
				showActionError("Failed to rewrite note with template", error);
				return false;
			} finally {
				setTemplateApplyState({
					isRunning: false,
					templateName: null,
					streamedMarkdown: "",
				});
			}
		},
		[content, editor, noteId, setNoteTemplate],
	);

	React.useEffect(() => {
		if (!noteId || !editor) {
			publishedEditorActionsRef.current = null;
			publishEditorActionsRef.current = null;
			onEditorActionsChange?.(null);
			return;
		}

		const publishEditorActions = () => {
			const { title, searchableText } = latestEditorStateRef.current;
			const serializedText = getPlainTextContent({
				editor,
				title,
				searchableText,
			});
			const nextActions = {
				noteId,
				canCopyText: Boolean(serializedText),
				canUndo: editor.can().undo(),
				canRedo: editor.can().redo(),
			};
			const previousActions = publishedEditorActionsRef.current;

			if (
				previousActions &&
				previousActions.noteId === nextActions.noteId &&
				previousActions.canCopyText === nextActions.canCopyText &&
				previousActions.canUndo === nextActions.canUndo &&
				previousActions.canRedo === nextActions.canRedo
			) {
				return;
			}

			publishedEditorActionsRef.current = nextActions;
			onEditorActionsChange?.({
				...nextActions,
				copyText,
				undo,
				redo,
				exportNote,
				applyTemplate,
			});
		};

		publishEditorActionsRef.current = publishEditorActions;
		publishEditorActions();
		editor.on("transaction", publishEditorActions);

		return () => {
			publishEditorActionsRef.current = null;
			editor.off("transaction", publishEditorActions);
		};
	}, [
		applyTemplate,
		copyText,
		editor,
		exportNote,
		noteId,
		onEditorActionsChange,
		redo,
		undo,
	]);

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

				editor.commands.setContent(nextDocument, { emitUpdate: false });
				setTitle(nextTitle);
				setContent(nextContent);
				setSearchableText(nextSearchableText);
				toast.success("Structured notes ready");
			} catch (error) {
				showActionError("Failed to enhance transcript", error);
				throw error;
			}
		},
		[editor, searchableText, title],
	);

	return {
		appendChatResponseToNote,
		editor,
		handleEnhanceTranscript,
		noteId,
		searchableText,
		setTitle,
		templateApplyState,
		title,
		titleTextareaRef,
	};
};

export function NotePage({
	autoStartTranscription = false,
	noteId,
	onAutoStartTranscriptionHandled,
	onTitleChange,
	onEditorActionsChange,
}: {
	autoStartTranscription?: boolean;
	noteId: Id<"notes"> | null;
	onAutoStartTranscriptionHandled?: () => void;
	onTitleChange?: (title: string) => void;
	onEditorActionsChange?: (actions: NoteEditorActions | null) => void;
}) {
	const controller = useNotePageController({
		noteId,
		onTitleChange,
		onEditorActionsChange,
	});

	return (
		<div className="flex min-h-0 flex-1 justify-center px-4 md:px-6">
			<div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
				<div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl flex-1 flex-col md:min-h-[calc(100svh-5rem)]">
					<div className="flex-1 pt-4 pb-28 md:pt-8 md:pb-32">
						<div className="flex flex-col gap-5">
							<Textarea
								ref={controller.titleTextareaRef}
								value={controller.title}
								onChange={(event) => controller.setTitle(event.target.value)}
								placeholder="New note"
								aria-label="Note title"
								rows={1}
								className="min-h-0 resize-none overflow-hidden border-0 !bg-transparent px-0 py-0 text-3xl font-semibold leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:text-4xl"
							/>

							<EditorContent
								editor={controller.editor}
								className={cn(
									"min-h-[320px] text-foreground",
									"[&_.ProseMirror]:min-h-[320px]",
									"[&_.ProseMirror_p]:mb-3 [&_.ProseMirror_p]:mt-0",
									"[&_.ProseMirror_ul]:mb-3 [&_.ProseMirror_ul]:pl-6",
									"[&_.ProseMirror_ol]:mb-3 [&_.ProseMirror_ol]:pl-6",
									"[&_.ProseMirror_li]:mb-1",
									"[&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:border-l [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground",
									controller.templateApplyState.isRunning && "hidden",
								)}
							/>

							{controller.templateApplyState.isRunning ? (
								controller.templateApplyState.streamedMarkdown.trim().length >
								0 ? (
									<Streamdown
										className="note-streamdown min-h-[320px] text-base text-foreground"
										controls={false}
										caret="block"
										isAnimating
									>
										{controller.templateApplyState.streamedMarkdown}
									</Streamdown>
								) : (
									<div className="min-h-[320px] text-base text-muted-foreground">
										<ShimmerText>Thinking</ShimmerText>
									</div>
								)
							) : null}
						</div>
					</div>

					<div className="sticky bottom-0 z-10 mt-auto h-0">
						<div className="pointer-events-none absolute inset-x-0 bottom-0 -mx-4 bg-background pb-6 md:-mx-6">
							<div className="pointer-events-auto relative mx-auto w-full max-w-xl">
								<NoteComposer
									autoStartTranscription={autoStartTranscription}
									noteContext={{
										noteId: controller.noteId,
										title: controller.title,
										text: controller.searchableText,
									}}
									onAutoStartTranscriptionHandled={
										onAutoStartTranscriptionHandled
									}
									onAddMessageToNote={controller.appendChatResponseToNote}
									onEnhanceTranscript={controller.handleEnhanceTranscript}
								/>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
