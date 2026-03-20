import type { JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowUp,
	AudioLines,
	Paperclip,
	Plus,
	Search,
	Sparkles,
} from "lucide-react";
import * as React from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const EMPTY_DOCUMENT: JSONContent = {
	type: "doc",
	content: [{ type: "paragraph" }],
};

const EMPTY_DOCUMENT_STRING = JSON.stringify(EMPTY_DOCUMENT);

export function QuickNotePage({
	noteId,
	onTitleChange,
}: {
	noteId: Id<"quickNotes"> | null;
	onTitleChange?: (title: string) => void;
}) {
	const [message, setMessage] = React.useState("");
	const [title, setTitle] = React.useState("");
	const [content, setContent] = React.useState(EMPTY_DOCUMENT_STRING);
	const [searchableText, setSearchableText] = React.useState("");
	const [isExpanded, setIsExpanded] = React.useState(false);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);
	const hasHydratedRef = React.useRef(false);
	const hydratedNoteIdRef = React.useRef<Id<"quickNotes"> | null>(null);
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
		api.quickNotes.get,
		noteId
			? {
					id: noteId,
				}
			: "skip",
	);
	const saveQuickNote = useMutation(api.quickNotes.save);

	const flushSave = React.useCallback(
		async (
			nextNoteId: Id<"quickNotes">,
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
				await saveQuickNote({
					id: nextNoteId,
					...payload,
				});
				lastSavedSnapshotRef.current = snapshot;
			} catch (error) {
				console.error("Failed to save quick note", error);
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
		[saveQuickNote],
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
					"quick-note-tiptap min-h-[240px] border border-transparent bg-transparent px-0 py-0 text-base outline-none",
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
		onTitleChange?.(title || "New note");
	}, [onTitleChange, title]);

	const resetTextareaHeight = React.useCallback(() => {
		if (!textareaRef.current) {
			return;
		}

		textareaRef.current.style.height = "auto";
	}, []);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();

		if (!message.trim()) {
			return;
		}

		setMessage("");
		setIsExpanded(false);
		resetTextareaHeight();
	};

	const handleTextareaChange = (
		event: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		const nextValue = event.target.value;
		setMessage(nextValue);

		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}

		setIsExpanded(nextValue.length > 100 || nextValue.includes("\n"));
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSubmit(event);
		}
	};

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
				<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-6">
					<div className="flex-1 pt-4 md:pt-8">
						<div className="flex flex-col gap-5">
							<Input
								value={title}
								onChange={(event) => setTitle(event.target.value)}
								placeholder="New note"
								aria-label="Note title"
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

					<form onSubmit={handleSubmit} className="group/composer w-full">
						<input
							ref={fileInputRef}
							type="file"
							multiple
							className="sr-only"
							onChange={() => {}}
						/>

						<div
							className={cn(
								"w-full overflow-clip rounded-3xl border border-border bg-card bg-clip-padding p-2.5 shadow-sm transition-[border-radius] duration-200 ease-out",
								isExpanded
									? "grid [grid-template-areas:'header'_'primary'_'footer'] [grid-template-columns:1fr] [grid-template-rows:auto_1fr_auto]"
									: "grid [grid-template-areas:'header_header_header'_'leading_primary_trailing'_'._footer_.'] [grid-template-columns:auto_1fr_auto] [grid-template-rows:auto_1fr_auto]",
							)}
						>
							<div
								className={cn("flex min-h-14 items-center overflow-x-hidden", {
									"-my-2.5 px-1.5": !isExpanded,
									"mb-0 px-2 py-1": isExpanded,
								})}
								style={{ gridArea: "primary" }}
							>
								<div className="max-h-52 flex-1 overflow-auto">
									<Textarea
										ref={textareaRef}
										value={message}
										onChange={handleTextareaChange}
										onKeyDown={handleKeyDown}
										placeholder="Ask anything"
										className="min-h-0 resize-none rounded-none border-0 !bg-transparent p-0 text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 dark:!bg-transparent"
										rows={1}
									/>
								</div>
							</div>

							<div
								className={cn("flex items-center", { hidden: isExpanded })}
								style={{ gridArea: "leading" }}
							>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="rounded-full text-muted-foreground outline-none ring-0"
											aria-label="Add attachments"
										>
											<Plus className="size-4" />
										</Button>
									</DropdownMenuTrigger>

									<DropdownMenuContent
										align="start"
										className="max-w-xs rounded-2xl p-1.5"
									>
										<DropdownMenuGroup className="space-y-1">
											<DropdownMenuItem
												className="rounded-md"
												onClick={() => fileInputRef.current?.click()}
											>
												<Paperclip size={20} className="opacity-60" />
												Add photos & files
											</DropdownMenuItem>
											<DropdownMenuItem className="rounded-md">
												<Sparkles size={20} className="opacity-60" />
												Agent mode
											</DropdownMenuItem>
											<DropdownMenuItem className="rounded-md">
												<Search size={20} className="opacity-60" />
												Deep research
											</DropdownMenuItem>
										</DropdownMenuGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							<div
								className="flex items-center gap-2"
								style={{ gridArea: isExpanded ? "footer" : "trailing" }}
							>
								<div className="ms-auto flex items-center gap-1.5">
									{message.trim() ? (
										<Button
											type="submit"
											variant="default"
											size="icon-sm"
											className="rounded-full"
											aria-label="Send message"
										>
											<ArrowUp className="size-4" />
										</Button>
									) : (
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="rounded-full text-muted-foreground"
											aria-label="Audio visualization"
										>
											<AudioLines className="size-4" />
										</Button>
									)}
								</div>
							</div>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
