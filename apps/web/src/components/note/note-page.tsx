import type { JSONContent } from "@tiptap/core";
import type {
	TableOfContentData,
	TableOfContentDataItem,
} from "@tiptap/extension-table-of-contents";
import { Tiptap, useEditor } from "@tiptap/react";
import { Textarea } from "@workspace/ui/components/textarea";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation } from "convex/react";
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
	normalizePastedPlainText,
	normalizePastedSlice,
	parseMarkdownToDocument,
	parseStoredNoteContent,
} from "@/lib/note-editor";
import {
	canFlushQueuedNoteSave,
	createNoteSnapshot,
	isLatestNoteSaveRequest,
} from "@/lib/note-snapshot";
import {
	isEnhancedNoteTemplate,
	type NoteTemplate,
} from "@/lib/note-templates";
import {
	type StructuredNote,
	type StructuredNoteBody,
	structuredNoteToDocument,
	structuredNoteToSearchableText,
} from "@/lib/structured-note";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { readDesktopCommentsPanelPinnedState } from "./note-comments-panel-state";
import {
	NoteCommentsSheet,
	type PendingNoteCommentSelection,
} from "./note-comments-sheet";
import { NoteComposer } from "./note-composer";
import { NoteSelectionMenu } from "./note-selection-menu";
import { NoteTableOfContents } from "./note-table-of-contents";
import { optimisticPatchNote } from "./optimistic-patch-note";
import { writeRichTextToClipboard } from "./share-note";

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
	const editorMarkdown = editor.getMarkdown().trim();
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

const escapeHtml = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const getRichTextContent = ({
	editor,
	title,
	searchableText,
}: {
	editor: NonNullable<ReturnType<typeof useEditor>>;
	title: string;
	searchableText: string;
}) => {
	const plainText = getPlainTextContent({
		editor,
		title,
		searchableText,
	});
	const titleText = title.trim();
	const editorHtml = editor.getHTML().trim();
	const titleHtml = titleText ? `<h1>${escapeHtml(titleText)}</h1>` : "";
	const bodyHtml =
		editorHtml && editorHtml !== "<p></p>"
			? editorHtml
			: searchableText
					.trim()
					.split(/\n{2,}/)
					.filter(Boolean)
					.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
					.join("");

	return {
		text: plainText,
		html: `<article>${titleHtml}${bodyHtml}</article>`,
	};
};

const plainTextToDocumentNodes = (text: string): JSONContent[] =>
	text
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean)
		.map((chunk) => ({
			type: "paragraph",
			content: [{ type: "text", text: chunk }],
		}));

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

export const OPEN_NOTE_COMMENTS_EVENT = "opengran:open-note-comments";

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
	openComments: () => void;
};

type NotePageCurrentUser = {
	name: string;
	email: string;
	avatar: string;
};

const useNotePageController = ({
	noteId,
	note,
	externalTitle,
	onTitleChange,
	onEditorActionsChange,
	scrollParentRef,
	onCommentThreadClick,
	onOpenComments,
}: {
	noteId: Id<"notes"> | null;
	note?: Doc<"notes"> | null;
	externalTitle?: string;
	onTitleChange?: (title: string) => void;
	onEditorActionsChange?: (actions: NoteEditorActions | null) => void;
	scrollParentRef?: React.RefObject<HTMLDivElement | null>;
	onCommentThreadClick?: (threadId: string) => void;
	onOpenComments?: () => void;
}) => {
	const activeWorkspaceId = useActiveWorkspaceId();
	const [title, setTitle] = React.useState("");
	const [content, setContent] = React.useState(EMPTY_DOCUMENT_STRING);
	const [searchableText, setSearchableText] = React.useState("");
	const [tableOfContents, setTableOfContents] =
		React.useState<TableOfContentData>([]);
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
	const applyDraftState = React.useCallback(
		(nextDraft: { title: string; content: string; searchableText: string }) => {
			setTitle(nextDraft.title);
			onTitleChange?.(nextDraft.title);
			setContent(nextDraft.content);
			setSearchableText(nextDraft.searchableText);
		},
		[onTitleChange],
	);
	const hasHydratedRef = React.useRef(false);
	const hydratedNoteIdRef = React.useRef<Id<"notes"> | null>(null);
	const suppressNextTitleChangeRef = React.useRef(false);
	const saveInFlightRef = React.useRef(false);
	const lastSavedSnapshotRef = React.useRef<string | null>(null);
	const latestSaveRequestIdRef = React.useRef(0);
	const publishedEditorActionsRef = React.useRef<{
		noteId: Id<"notes">;
		canCopyMarkdown: boolean;
		canUndo: boolean;
		canRedo: boolean;
		canShowTemplateSelect: boolean;
	} | null>(null);
	const publishEditorActionsRef = React.useRef<(() => void) | null>(null);
	const queuedSaveRef = React.useRef<{
		requestId: number;
		snapshot: string;
		payload: {
			title: string;
			content: string;
			searchableText: string;
		};
	} | null>(null);
	const shouldPreserveStructuredNoteTitle = Boolean(note?.calendarEventKey);
	const saveNote = useMutation(api.notes.save);
	const setNoteTemplate = useMutation(
		api.notes.setTemplate,
	).withOptimisticUpdate((localStore, args) => {
		const nextTemplateSlug = args.templateSlug ?? undefined;
		const patchNote = <T extends Doc<"notes">>(currentNote: T): T => ({
			...currentNote,
			templateSlug: nextTemplateSlug,
		});
		optimisticPatchNote(localStore, args.workspaceId, args.id, patchNote);
	});

	const flushSave = React.useCallback(
		async (
			nextNoteId: Id<"notes">,
			requestId: number,
			snapshot: string,
			payload: {
				title: string;
				content: string;
				searchableText: string;
			},
		) => {
			if (
				!isLatestNoteSaveRequest({
					requestId,
					latestRequestId: latestSaveRequestIdRef.current,
				})
			) {
				return;
			}

			if (saveInFlightRef.current) {
				queuedSaveRef.current = { requestId, snapshot, payload };
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
				const shouldFlushQueuedSave = queuedSave
					? canFlushQueuedNoteSave({
							lastSavedSnapshot: lastSavedSnapshotRef.current,
							latestRequestId: latestSaveRequestIdRef.current,
							queuedRequestId: queuedSave.requestId,
							queuedSnapshot: queuedSave.snapshot,
						})
					: false;
				if (!shouldFlushQueuedSave) {
					queuedSaveRef.current = null;
				} else if (queuedSave) {
					queuedSaveRef.current = null;
					void flushSave(
						nextNoteId,
						queuedSave.requestId,
						queuedSave.snapshot,
						queuedSave.payload,
					);
				}
			}
		},
		[activeWorkspaceId, saveNote],
	);

	const getTableOfContentsScrollParent = React.useCallback(
		() => scrollParentRef?.current ?? window,
		[scrollParentRef],
	);

	const editor = useEditor({
		extensions: createNoteEditorExtensions({
			onTableOfContentsUpdate: setTableOfContents,
			getTableOfContentsScrollParent,
			onCommentThreadClick,
		}),
		immediatelyRender: false,
		editorProps: {
			attributes: {
				class:
					"note-tiptap min-h-[240px] border border-transparent bg-transparent px-0 py-0 text-base outline-none",
			},
			handlePaste: (view, event) => handleMarkdownPaste(view, event),
			transformPasted: (slice, view) =>
				normalizePastedSlice(slice, view.state.schema),
		},
		onUpdate: ({ editor }) => {
			setContent(JSON.stringify(editor.getJSON()));
			setSearchableText(editor.getText());
		},
	});

	const syncTableOfContents = React.useCallback(() => {
		if (!editor) {
			return;
		}

		window.requestAnimationFrame(() => {
			const updateTableOfContents = (
				editor.commands as typeof editor.commands & {
					updateTableOfContents?: () => void;
				}
			).updateTableOfContents;

			if (!editor.isDestroyed && typeof updateTableOfContents === "function") {
				updateTableOfContents();
			}
		});
	}, [editor]);

	const setEditorDocument = React.useCallback(
		(nextDocument: JSONContent) => {
			if (!editor) {
				return;
			}

			editor.commands.setContent(nextDocument, { emitUpdate: false });
			syncTableOfContents();
		},
		[editor, syncTableOfContents],
	);
	const syncHydratedNoteState = React.useCallback(() => {
		if (hydratedNoteIdRef.current !== noteId) {
			hydratedNoteIdRef.current = noteId;
			hasHydratedRef.current = false;
			lastSavedSnapshotRef.current = null;
			latestSaveRequestIdRef.current = 0;
			queuedSaveRef.current = null;
			setTableOfContents([]);

			if (editor) {
				applyDraftState({
					title: "",
					content: EMPTY_DOCUMENT_STRING,
					searchableText: "",
				});
				setEditorDocument(EMPTY_DOCUMENT);
			}
		}

		if (!editor || !noteId || note === undefined || hasHydratedRef.current) {
			return;
		}

		if (note) {
			const nextContent = parseStoredNoteContent(
				note.content,
				editor.state.schema,
			);

			applyDraftState({
				title: note.title,
				content: note.content,
				searchableText: note.searchableText,
			});
			lastSavedSnapshotRef.current = createNoteSnapshot({
				title: note.title,
				content: note.content,
				searchableText: note.searchableText,
			});
			setEditorDocument(nextContent);
		} else {
			lastSavedSnapshotRef.current = createNoteSnapshot({
				title: "",
				content: EMPTY_DOCUMENT_STRING,
				searchableText: "",
			});
			setEditorDocument(EMPTY_DOCUMENT);
		}

		hasHydratedRef.current = true;
	}, [applyDraftState, editor, note, noteId, setEditorDocument]);

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
		syncHydratedNoteState();
	}, [syncHydratedNoteState]);

	React.useEffect(() => {
		if (!noteId || !hasHydratedRef.current) {
			return;
		}

		if (templateApplyState.isRunning) {
			return;
		}

		const snapshot = createNoteSnapshot({
			title,
			content,
			searchableText,
		});

		if (snapshot === lastSavedSnapshotRef.current) {
			return;
		}

		const requestId = latestSaveRequestIdRef.current + 1;
		latestSaveRequestIdRef.current = requestId;

		const timeout = window.setTimeout(() => {
			void flushSave(noteId, requestId, snapshot, {
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

		const timeout = window.setTimeout(() => {
			onTitleChange?.(title);
		}, 150);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [onTitleChange, title]);

	React.useEffect(() => {
		if (!noteId || !hasHydratedRef.current || externalTitle === undefined) {
			return;
		}

		const nextTitle = externalTitle;
		setTitle((currentTitle) => {
			if (nextTitle === currentTitle) {
				return currentTitle;
			}

			suppressNextTitleChangeRef.current = true;
			return nextTitle;
		});
	}, [externalTitle, noteId]);

	React.useEffect(() => {
		void title;
		const element = titleTextareaRef.current;
		if (!element) {
			return;
		}

		element.style.height = "auto";
		element.style.height = `${element.scrollHeight}px`;
	}, [title]);

	const copyText = React.useCallback(async () => {
		if (!editor) {
			return;
		}

		const { title, searchableText } = latestEditorStateRef.current;
		const richText = getRichTextContent({
			editor,
			title,
			searchableText,
		});

		if (!richText.text) {
			toast("Nothing to copy yet");
			return;
		}

		try {
			await writeRichTextToClipboard(richText);
			toast.success("Note content copied");
		} catch (error) {
			showActionError("Failed to copy note content", error);
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

			const normalizedText = normalizePastedPlainText(nextText);
			const nextContent = looksLikeMarkdown(normalizedText)
				? ((parseMarkdownToDocument(
						normalizedText,
						editor.state.schema,
					).toJSON().content as JSONContent[] | undefined) ??
					plainTextToDocumentNodes(nextText))
				: plainTextToDocumentNodes(nextText);

			editor.chain().focus().insertContent(nextContent).run();
			toast.success("Added to note");
		},
		[editor],
	);

	const focusEditor = React.useCallback(() => {
		if (!editor) {
			return;
		}

		editor.chain().focus("start").run();
	}, [editor]);

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
					const nextTitle = shouldPreserveStructuredNoteTitle
						? title
						: enhancedNote.title.trim() || title;

					setEditorDocument(nextDocument);
					setTitle(nextTitle);
					setContent(nextContent);
					setSearchableText(nextSearchableText);
					toast.success(`Rewrote note with ${template.name}`);

					return true;
				}

				setEditorDocument(EMPTY_DOCUMENT);
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

				setEditorDocument(nextDocument);
				setContent(nextContent);
				setSearchableText(nextSearchableText);
				toast.success(`Rewrote note with ${template.name}`);

				return true;
			} catch (error) {
				try {
					const workspaceId = activeWorkspaceId;
					if (workspaceId) {
						await setNoteTemplate({
							workspaceId,
							id: nextNoteIdRef.current ?? noteId,
							templateSlug: previousTemplateSlug,
						});
					}
				} catch (revertError) {
					console.error("Failed to revert note template", revertError);
				}
				setEditorDocument(previousDocument);
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
			setEditorDocument,
			setNoteTemplate,
			shouldPreserveStructuredNoteTitle,
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
				openComments: onOpenComments ?? (() => {}),
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
		onOpenComments,
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
				const nextTitle = shouldPreserveStructuredNoteTitle
					? title
					: enhancedNote.title.trim() || title;
				const nextNoteId = nextNoteIdRef.current ?? noteId;
				if (!nextNoteId) {
					return;
				}
				const saveSnapshot = createNoteSnapshot({
					title: nextTitle,
					content: nextContent,
					searchableText: nextSearchableText,
				});
				const requestId = latestSaveRequestIdRef.current + 1;
				latestSaveRequestIdRef.current = requestId;

				setEditorDocument(nextDocument);
				setTitle(nextTitle);
				setContent(nextContent);
				setSearchableText(nextSearchableText);
				await flushSave(nextNoteId, requestId, saveSnapshot, {
					title: nextTitle,
					content: nextContent,
					searchableText: nextSearchableText,
				});
				await setNoteTemplate({
					workspaceId: activeWorkspaceId,
					id: nextNoteId,
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
			flushSave,
			requestStructuredNote,
			searchableText,
			setEditorDocument,
			setNoteTemplate,
			shouldPreserveStructuredNoteTitle,
			title,
		],
	);

	return {
		appendChatResponseToNote,
		editor,
		focusEditor,
		handleEnhanceTranscript,
		getNoteContext: React.useCallback(
			() => ({
				noteId: nextNoteIdRef.current ?? noteId,
				templateSlug: latestEditorStateRef.current.templateSlug,
				title: latestEditorStateRef.current.title,
				text: latestEditorStateRef.current.searchableText,
			}),
			[noteId],
		),
		noteId,
		searchableText,
		setTitle,
		templateSlug: note?.templateSlug ?? null,
		templateApplyState,
		title,
		titleTextareaRef,
		tableOfContents,
	};
};

function NotePageContent({
	controller,
	autoStartTranscription,
	composerNoteContext,
	onAutoStartTranscriptionHandled,
	stopTranscriptionWhenMeetingEnds,
	scrollParentRef,
	shouldHideEmptyBodyPlaceholder,
	onOpenCommentComposer,
	commentsOpen,
	activeCommentThreadId,
	currentUser,
	isDesktopMac,
	handleCommentsOpenChange,
	setCommentPanelState,
	pendingCommentSelection,
	handleTableOfContentsSelect,
}: {
	controller: ReturnType<typeof useNotePageController>;
	autoStartTranscription: boolean;
	composerNoteContext: {
		noteId: Id<"notes"> | null;
		templateSlug: string | null;
	};
	onAutoStartTranscriptionHandled?: () => void;
	stopTranscriptionWhenMeetingEnds: boolean;
	scrollParentRef?: React.RefObject<HTMLDivElement | null>;
	shouldHideEmptyBodyPlaceholder: boolean;
	onOpenCommentComposer: () => void;
	commentsOpen: boolean;
	activeCommentThreadId: Id<"noteCommentThreads"> | null;
	currentUser: NotePageCurrentUser;
	isDesktopMac: boolean;
	handleCommentsOpenChange: (nextOpen: boolean) => void;
	setCommentPanelState: React.Dispatch<
		React.SetStateAction<{
			commentsOpen: boolean;
			activeCommentThreadId: Id<"noteCommentThreads"> | null;
			pendingCommentSelection: PendingNoteCommentSelection | null;
		}>
	>;
	pendingCommentSelection: PendingNoteCommentSelection | null;
	handleTableOfContentsSelect: (anchor: TableOfContentDataItem) => void;
}) {
	void scrollParentRef;

	return (
		<div className="flex min-h-0 flex-1 justify-center px-4 md:px-6">
			<div className="relative flex min-h-0 w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
				<div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl flex-1 md:min-h-[calc(100svh-5rem)]">
					<div className="min-w-0 flex-1">
						<div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl flex-1 flex-col md:min-h-[calc(100svh-5rem)]">
							<div className="flex-1 pt-4 pb-28 md:pt-8 md:pb-32">
								<div className="flex flex-col gap-6">
									<div>
										<Textarea
											ref={controller.titleTextareaRef}
											value={controller.title}
											onChange={(event) =>
												controller.setTitle(event.target.value)
											}
											onKeyDown={(event) => {
												if (event.key !== "Enter" || event.shiftKey) {
													return;
												}

												event.preventDefault();
												controller.focusEditor();
											}}
											placeholder="New note"
											aria-label="Note title"
											rows={1}
											className="note-title min-h-0 flex-1 resize-none overflow-hidden rounded-none border-0 !bg-transparent px-0 py-0 text-2xl font-medium leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:text-3xl"
										/>
									</div>

									{controller.editor ? (
										<Tiptap editor={controller.editor}>
											<Tiptap.Content
												className={cn(
													"min-h-[320px] text-base text-foreground",
													"[&_.ProseMirror]:min-h-[320px]",
													shouldHideEmptyBodyPlaceholder &&
														"note-editor--hide-placeholder",
													controller.templateApplyState.isRunning && "hidden",
												)}
											/>

											<NoteSelectionMenu onComment={onOpenCommentComposer} />
										</Tiptap>
									) : null}
									{controller.templateApplyState.isRunning ? (
										controller.templateApplyState.streamedMarkdown.trim()
											.length > 0 ? (
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
											desktopSafeTop={isDesktopMac}
											getNoteContext={controller.getNoteContext}
											noteContext={composerNoteContext}
											onAutoStartTranscriptionHandled={
												onAutoStartTranscriptionHandled
											}
											onAddMessageToNote={controller.appendChatResponseToNote}
											onEnhanceTranscript={controller.handleEnhanceTranscript}
											stopTranscriptionWhenMeetingEnds={
												stopTranscriptionWhenMeetingEnds
											}
										/>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="pointer-events-none absolute top-0 right-0 hidden h-full lg:block">
					<div className="pointer-events-auto sticky top-1/2 -translate-y-1/2">
						<NoteTableOfContents
							anchors={controller.tableOfContents}
							onSelect={handleTableOfContentsSelect}
						/>
					</div>
				</div>
			</div>

			<NoteCommentsSheet
				noteId={controller.noteId}
				editor={controller.editor}
				currentUser={currentUser}
				open={commentsOpen}
				desktopSafeTop={isDesktopMac}
				onOpenChange={handleCommentsOpenChange}
				activeThreadId={activeCommentThreadId}
				onActiveThreadIdChange={(threadId) =>
					setCommentPanelState((current) => ({
						...current,
						activeCommentThreadId: threadId,
					}))
				}
				pendingSelection={pendingCommentSelection}
				onPendingSelectionChange={(selection) =>
					setCommentPanelState((current) => ({
						...current,
						pendingCommentSelection: selection,
					}))
				}
			/>
		</div>
	);
}

export function NotePage({
	autoStartTranscription = false,
	currentUser = {
		name: "Unknown user",
		email: "",
		avatar: "",
	},
	noteId,
	note,
	externalTitle,
	onAutoStartTranscriptionHandled,
	onCommentsOpenChange,
	isDesktopMac = false,
	onTitleChange,
	onEditorActionsChange,
	scrollParentRef,
	stopTranscriptionWhenMeetingEnds = false,
}: {
	autoStartTranscription?: boolean;
	currentUser?: NotePageCurrentUser;
	noteId: Id<"notes"> | null;
	note?: Doc<"notes"> | null;
	externalTitle?: string;
	onAutoStartTranscriptionHandled?: () => void;
	onCommentsOpenChange?: (opener: (() => void) | null) => void;
	isDesktopMac?: boolean;
	onTitleChange?: (title: string) => void;
	onEditorActionsChange?: (actions: NoteEditorActions | null) => void;
	scrollParentRef?: React.RefObject<HTMLDivElement | null>;
	stopTranscriptionWhenMeetingEnds?: boolean;
}) {
	const isMobile = useIsMobile();
	const [commentPanelState, setCommentPanelState] = React.useState<{
		commentsOpen: boolean;
		activeCommentThreadId: Id<"noteCommentThreads"> | null;
		pendingCommentSelection: PendingNoteCommentSelection | null;
	}>({
		commentsOpen: false,
		activeCommentThreadId: null,
		pendingCommentSelection: null,
	});
	const { commentsOpen, activeCommentThreadId, pendingCommentSelection } =
		commentPanelState;
	const handleOpenComments = React.useCallback(() => {
		setCommentPanelState((current) => {
			const shouldTogglePinnedDesktopComments =
				!isMobile && readDesktopCommentsPanelPinnedState();

			if (shouldTogglePinnedDesktopComments) {
				return current.commentsOpen
					? {
							commentsOpen: false,
							activeCommentThreadId: null,
							pendingCommentSelection: null,
						}
					: {
							...current,
							commentsOpen: true,
						};
			}

			return {
				...current,
				commentsOpen: true,
			};
		});
	}, [isMobile]);
	const handleCommentsOpenChange = React.useCallback((nextOpen: boolean) => {
		setCommentPanelState((current) =>
			nextOpen
				? {
						...current,
						commentsOpen: true,
					}
				: {
						commentsOpen: false,
						activeCommentThreadId: null,
						pendingCommentSelection: null,
					},
		);
	}, []);
	const handleCommentThreadClick = React.useCallback((threadId: string) => {
		setCommentPanelState({
			commentsOpen: true,
			activeCommentThreadId: threadId as Id<"noteCommentThreads">,
			pendingCommentSelection: null,
		});
	}, []);
	React.useEffect(() => {
		if (!noteId) {
			return;
		}

		const handleOpenCommentsRequest = () => {
			handleOpenComments();
		};

		window.addEventListener(
			OPEN_NOTE_COMMENTS_EVENT,
			handleOpenCommentsRequest,
		);

		return () => {
			window.removeEventListener(
				OPEN_NOTE_COMMENTS_EVENT,
				handleOpenCommentsRequest,
			);
		};
	}, [handleOpenComments, noteId]);
	React.useEffect(() => {
		if (!noteId) {
			onCommentsOpenChange?.(null);
			return;
		}

		onCommentsOpenChange?.(handleOpenComments);

		return () => {
			onCommentsOpenChange?.(null);
		};
	}, [handleOpenComments, noteId, onCommentsOpenChange]);
	const controller = useNotePageController({
		noteId,
		note,
		externalTitle,
		onTitleChange,
		onEditorActionsChange,
		scrollParentRef,
		onCommentThreadClick: handleCommentThreadClick,
		onOpenComments: handleOpenComments,
	});
	const composerNoteContext = React.useMemo(
		() => ({
			noteId: controller.noteId,
			templateSlug: controller.templateSlug,
		}),
		[controller.noteId, controller.templateSlug],
	);
	const shouldHideEmptyBodyPlaceholder =
		!controller.title.trim() && !controller.searchableText.trim();
	const handleTableOfContentsSelect = React.useCallback(
		(anchor: TableOfContentDataItem) => {
			const topOffset = 72;
			const scrollParent = scrollParentRef?.current ?? window;

			if (scrollParent instanceof HTMLElement) {
				const nextTop =
					anchor.dom.getBoundingClientRect().top -
					scrollParent.getBoundingClientRect().top +
					scrollParent.scrollTop -
					topOffset;

				scrollParent.scrollTo({
					top: Math.max(0, nextTop),
					behavior: "smooth",
				});
				return;
			}

			window.scrollTo({
				top: Math.max(
					0,
					anchor.dom.getBoundingClientRect().top + window.scrollY - topOffset,
				),
				behavior: "smooth",
			});
		},
		[scrollParentRef],
	);
	const handleOpenCommentComposer = React.useCallback(() => {
		if (!controller.editor) {
			return;
		}

		const { from, to, empty } = controller.editor.state.selection;

		if (empty || from === to) {
			return;
		}

		const text = controller.editor.state.doc.textBetween(from, to, "\n").trim();

		if (!text) {
			return;
		}

		setCommentPanelState({
			commentsOpen: true,
			activeCommentThreadId: null,
			pendingCommentSelection: {
				from,
				to,
				text,
			},
		});
	}, [controller.editor]);

	React.useEffect(() => {
		void noteId;
		setCommentPanelState({
			commentsOpen: false,
			activeCommentThreadId: null,
			pendingCommentSelection: null,
		});
	}, [noteId]);

	const syncCommentThreadSelectionFromLocation = React.useCallback(() => {
		if (!noteId) {
			return;
		}

		const url = new URL(window.location.href);
		const threadId = url.searchParams.get("commentThreadId")?.trim();
		const targetNoteId = url.searchParams.get("noteId")?.trim();

		if (!threadId || targetNoteId !== String(noteId)) {
			return;
		}

		setCommentPanelState({
			commentsOpen: true,
			activeCommentThreadId: threadId as Id<"noteCommentThreads">,
			pendingCommentSelection: null,
		});
	}, [noteId]);

	React.useEffect(() => {
		syncCommentThreadSelectionFromLocation();
	}, [syncCommentThreadSelectionFromLocation]);

	React.useEffect(() => {
		window.addEventListener("popstate", syncCommentThreadSelectionFromLocation);

		return () => {
			window.removeEventListener(
				"popstate",
				syncCommentThreadSelectionFromLocation,
			);
		};
	}, [syncCommentThreadSelectionFromLocation]);

	React.useEffect(() => {
		const editor = controller.editor;

		if (!editor) {
			return;
		}

		const syncActiveThreadMarkers = () => {
			if (!editor.view?.dom) {
				return;
			}

			const threadId = activeCommentThreadId;
			const container = editor.view.dom;
			const anchors = container.querySelectorAll<HTMLElement>(
				"[data-note-comment-thread-id]",
			);

			for (const anchor of anchors) {
				const isActive =
					!!threadId && anchor.dataset.noteCommentThreadId === String(threadId);
				anchor.dataset.activeThread = isActive ? "true" : "false";
			}
		};

		syncActiveThreadMarkers();
		editor.on("transaction", syncActiveThreadMarkers);

		return () => {
			editor.off("transaction", syncActiveThreadMarkers);
		};
	}, [activeCommentThreadId, controller.editor]);

	return (
		<NotePageContent
			controller={controller}
			autoStartTranscription={autoStartTranscription}
			composerNoteContext={composerNoteContext}
			onAutoStartTranscriptionHandled={onAutoStartTranscriptionHandled}
			stopTranscriptionWhenMeetingEnds={stopTranscriptionWhenMeetingEnds}
			scrollParentRef={scrollParentRef}
			shouldHideEmptyBodyPlaceholder={shouldHideEmptyBodyPlaceholder}
			onOpenCommentComposer={handleOpenCommentComposer}
			commentsOpen={commentsOpen}
			activeCommentThreadId={activeCommentThreadId}
			currentUser={currentUser}
			isDesktopMac={isDesktopMac}
			handleCommentsOpenChange={handleCommentsOpenChange}
			setCommentPanelState={setCommentPanelState}
			pendingCommentSelection={pendingCommentSelection}
			handleTableOfContentsSelect={handleTableOfContentsSelect}
		/>
	);
}
