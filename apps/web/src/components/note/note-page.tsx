import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { ShimmerText } from "@/components/ai-elements/shimmer";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import {
	createNoteEditorExtensions,
	EMPTY_DOCUMENT,
	EMPTY_DOCUMENT_STRING,
	handleMarkdownPaste,
	looksLikeMarkdown,
	parseMarkdownToDocument,
	parseStoredNoteContent,
	serializeDocumentToMarkdown,
} from "@/lib/note-editor";
import {
	isEnhancedNoteTemplate,
	type NoteTemplate,
} from "@/lib/note-templates";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { NoteComposer } from "./note-composer";
import { writeTextToClipboard } from "./share-note";

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

const getMarkdownContent = ({
	editor,
	title,
	searchableText,
}: {
	editor: NonNullable<ReturnType<typeof useEditor>>;
	title: string;
	searchableText: string;
}) => {
	const editorMarkdown = serializeDocumentToMarkdown(
		editor.state.doc,
		editor.state.schema,
	);
	const titleText = title.trim();

	return [
		titleText ? `# ${titleText}` : "",
		editorMarkdown || searchableText.trim(),
	]
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
	}.md`;

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
	canCopyMarkdown: boolean;
	canUndo: boolean;
	canRedo: boolean;
	canShowTemplateSelect: boolean;
	copyMarkdown: () => Promise<void>;
	undo: () => void;
	redo: () => void;
	exportMarkdown: () => Promise<void>;
	applyTemplate: (template: NoteTemplate) => Promise<boolean>;
};

const useNotePageController = ({
	noteId,
	externalTitle,
	onTitleChange,
	onEditorActionsChange,
}: {
	noteId: Id<"notes"> | null;
	externalTitle?: string;
	onTitleChange?: (title: string) => void;
	onEditorActionsChange?: (actions: NoteEditorActions | null) => void;
}) => {
	const activeWorkspaceId = useActiveWorkspaceId();
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
		canShowTemplateSelect: boolean;
	}>({
		title: "",
		searchableText: "",
		templateSlug: null,
		isApplyingTemplate: false,
		canShowTemplateSelect: false,
	});
	const hasHydratedRef = React.useRef(false);
	const hydratedNoteIdRef = React.useRef<Id<"notes"> | null>(null);
	const suppressNextTitleChangeRef = React.useRef(false);
	const saveInFlightRef = React.useRef(false);
	const lastSavedSnapshotRef = React.useRef<string | null>(null);
	const publishedEditorActionsRef = React.useRef<{
		noteId: Id<"notes">;
		canCopyMarkdown: boolean;
		canUndo: boolean;
		canRedo: boolean;
		canShowTemplateSelect: boolean;
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
		noteId && activeWorkspaceId
			? {
					workspaceId: activeWorkspaceId,
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
		const currentNote = localStore.getQuery(api.notes.get, {
			workspaceId: args.workspaceId,
			id: args.id,
		});
		if (currentNote !== undefined) {
			localStore.setQuery(
				api.notes.get,
				{ workspaceId: args.workspaceId, id: args.id },
				currentNote ? patchNote(currentNote) : currentNote,
			);
		}

		const latestNote = localStore.getQuery(api.notes.getLatest, {
			workspaceId: args.workspaceId,
		});
		if (latestNote?._id === args.id) {
			localStore.setQuery(
				api.notes.getLatest,
				{ workspaceId: args.workspaceId },
				patchNote(latestNote),
			);
		}

		const noteLists = [
			api.notes.list,
			api.notes.listShared,
			api.notes.listArchived,
		] as const;

		for (const noteQuery of noteLists) {
			const notes = localStore.getQuery(noteQuery, {
				workspaceId: args.workspaceId,
			});
			if (notes !== undefined) {
				localStore.setQuery(
					noteQuery,
					{ workspaceId: args.workspaceId },
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
				if (!activeWorkspaceId) {
					return;
				}

				await saveNote({
					workspaceId: activeWorkspaceId,
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
		[activeWorkspaceId, saveNote],
	);

	const editor = useEditor({
		extensions: createNoteEditorExtensions(),
		immediatelyRender: false,
		autofocus: "end",
		editorProps: {
			attributes: {
				class:
					"note-tiptap min-h-[240px] border border-transparent bg-transparent px-0 py-0 text-base outline-none",
			},
			handlePaste: (view, event) => handleMarkdownPaste(view, event),
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
			canShowTemplateSelect: searchableText.trim().length > 0,
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
			const nextContent = parseStoredNoteContent(
				note.content,
				editor.state.schema,
			);

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
		if (suppressNextTitleChangeRef.current) {
			suppressNextTitleChangeRef.current = false;
			return;
		}

		onTitleChange?.(title || "New note");
	}, [onTitleChange, title]);

	React.useEffect(() => {
		if (!noteId || !hasHydratedRef.current || externalTitle === undefined) {
			return;
		}

		const nextTitle = externalTitle || "New note";
		if (nextTitle === title) {
			return;
		}

		suppressNextTitleChangeRef.current = true;
		setTitle(nextTitle);
	}, [externalTitle, noteId, title]);

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
		const serializedMarkdown = getMarkdownContent({
			editor,
			title,
			searchableText,
		});

		if (!serializedMarkdown) {
			toast("Nothing to copy yet");
			return;
		}

		try {
			await writeTextToClipboard(serializedMarkdown);
			toast.success("Markdown copied");
		} catch (error) {
			showActionError("Failed to copy markdown", error);
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
		const serializedMarkdown = getMarkdownContent({
			editor,
			title,
			searchableText,
		});

		if (!serializedMarkdown) {
			toast("Nothing to export yet");
			return;
		}

		try {
			const result = await exportTextFile({
				fileName: getExportFileName(title),
				content: serializedMarkdown,
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

			const nextContent = looksLikeMarkdown(nextText)
				? ((parseMarkdownToDocument(nextText, editor.state.schema).toJSON()
						.content as JSONContent[] | undefined) ??
					plainTextToDocumentNodes(nextText))
				: plainTextToDocumentNodes(nextText);

			editor.chain().focus().insertContent(nextContent).run();
			toast.success("Added to note");
		},
		[editor],
	);

	const requestStructuredNote = React.useCallback(
		async (body: {
			title: string;
			rawNotes?: string;
			transcript?: string;
			noteText?: string;
		}) => {
			const response = await fetch("/api/enhance-note", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			});

			const payload = (await response.json().catch(() => ({}))) as {
				error?: string;
				note?: StructuredNote;
			};

			if (!response.ok || !payload.note) {
				throw new Error(payload.error || "Failed to enhance note.");
			}

			return payload.note;
		},
		[],
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
			const previousTitle = title;
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
				if (!activeWorkspaceId) {
					return false;
				}

				await setNoteTemplate({
					workspaceId: activeWorkspaceId,
					id: nextNoteIdRef.current ?? noteId,
					templateSlug: template.slug,
				});

				if (isEnhancedNoteTemplate(template)) {
					const enhancedNote = await requestStructuredNote({
						title,
						noteText: serializedText,
					});
					const nextDocument = structuredNoteToDocument(enhancedNote);
					const nextContent = JSON.stringify(nextDocument);
					const nextSearchableText =
						structuredNoteToSearchableText(enhancedNote);
					const nextTitle = enhancedNote.title.trim() || title;

					editor.commands.setContent(nextDocument, { emitUpdate: false });
					setTitle(nextTitle);
					setContent(nextContent);
					setSearchableText(nextSearchableText);
					toast.success(`Rewrote note with ${template.name}`);

					return true;
				}

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
						workspaceId: activeWorkspaceId,
						id: nextNoteIdRef.current ?? noteId,
						templateSlug: previousTemplateSlug,
					});
				} catch (revertError) {
					console.error("Failed to revert note template", revertError);
				}
				editor.commands.setContent(previousDocument, { emitUpdate: false });
				setTitle(previousTitle);
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
		[
			activeWorkspaceId,
			content,
			editor,
			noteId,
			requestStructuredNote,
			setNoteTemplate,
		],
	);

	React.useEffect(() => {
		if (!noteId || !editor) {
			publishedEditorActionsRef.current = null;
			publishEditorActionsRef.current = null;
			onEditorActionsChange?.(null);
			return;
		}

		const publishEditorActions = () => {
			const { title, searchableText, canShowTemplateSelect } =
				latestEditorStateRef.current;
			const serializedText = getPlainTextContent({
				editor,
				title,
				searchableText,
			});
			const nextActions = {
				noteId,
				canCopyMarkdown: Boolean(serializedText),
				canUndo: editor.can().undo(),
				canRedo: editor.can().redo(),
				canShowTemplateSelect,
			};
			const previousActions = publishedEditorActionsRef.current;

			if (
				previousActions &&
				previousActions.noteId === nextActions.noteId &&
				previousActions.canCopyMarkdown === nextActions.canCopyMarkdown &&
				previousActions.canUndo === nextActions.canUndo &&
				previousActions.canRedo === nextActions.canRedo &&
				previousActions.canShowTemplateSelect ===
					nextActions.canShowTemplateSelect
			) {
				return;
			}

			publishedEditorActionsRef.current = nextActions;
			onEditorActionsChange?.({
				...nextActions,
				copyMarkdown: copyText,
				undo,
				redo,
				exportMarkdown: exportNote,
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
				if (!activeWorkspaceId) {
					return;
				}

				const enhancedNote = await requestStructuredNote({
					title,
					rawNotes: searchableText,
					transcript,
				});
				const nextDocument = structuredNoteToDocument(enhancedNote);
				const nextContent = JSON.stringify(nextDocument);
				const nextSearchableText = structuredNoteToSearchableText(enhancedNote);
				const nextTitle = enhancedNote.title.trim() || title;

				editor.commands.setContent(nextDocument, { emitUpdate: false });
				setTitle(nextTitle);
				setContent(nextContent);
				setSearchableText(nextSearchableText);
				await setNoteTemplate({
					workspaceId: activeWorkspaceId,
					id: nextNoteIdRef.current ?? noteId,
					templateSlug: "enhanced",
				});
				toast.success("Structured notes ready");
			} catch (error) {
				showActionError("Failed to enhance transcript", error);
				throw error;
			}
		},
		[
			activeWorkspaceId,
			noteId,
			editor,
			requestStructuredNote,
			searchableText,
			setNoteTemplate,
			title,
		],
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
	externalTitle,
	onAutoStartTranscriptionHandled,
	onTitleChange,
	onEditorActionsChange,
}: {
	autoStartTranscription?: boolean;
	noteId: Id<"notes"> | null;
	externalTitle?: string;
	onAutoStartTranscriptionHandled?: () => void;
	onTitleChange?: (title: string) => void;
	onEditorActionsChange?: (actions: NoteEditorActions | null) => void;
}) {
	const controller = useNotePageController({
		noteId,
		externalTitle,
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
								className="min-h-0 resize-none overflow-hidden rounded-none border-0 !bg-transparent px-0 py-0 text-3xl font-semibold leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:text-4xl"
							/>

							<EditorContent
								editor={controller.editor}
								className={cn(
									"min-h-[320px] text-foreground",
									"[&_.ProseMirror]:min-h-[320px]",
									"[&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h1]:text-3xl [&_.ProseMirror_h1]:font-semibold",
									"[&_.ProseMirror_h2]:mb-4 [&_.ProseMirror_h2]:text-2xl [&_.ProseMirror_h2]:font-semibold",
									"[&_.ProseMirror_h3]:mb-3 [&_.ProseMirror_h3]:text-xl [&_.ProseMirror_h3]:font-semibold",
									"[&_.ProseMirror_p]:mb-3 [&_.ProseMirror_p]:mt-0",
									"[&_.ProseMirror_ul]:mb-3 [&_.ProseMirror_ul]:pl-6",
									"[&_.ProseMirror_ol]:mb-3 [&_.ProseMirror_ol]:pl-6",
									"[&_.ProseMirror_li]:mb-1",
									"[&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:border-l [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground",
									"[&_.ProseMirror_pre]:my-4 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-lg [&_.ProseMirror_pre]:border [&_.ProseMirror_pre]:border-border/70 [&_.ProseMirror_pre]:bg-muted/50 [&_.ProseMirror_pre]:p-4",
									"[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted/60 [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-[0.9em]",
									"[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0",
									"[&_.ProseMirror_hr]:my-6 [&_.ProseMirror_hr]:border-border",
									"[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:underline-offset-2",
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
