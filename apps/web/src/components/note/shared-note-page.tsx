import { EditorContent, useEditor } from "@tiptap/react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Input } from "@workspace/ui/components/input";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { FileText } from "lucide-react";
import * as React from "react";
import {
	createNoteEditorExtensions,
	parseStoredNoteContent,
} from "@/lib/note-editor";
import type { Doc } from "../../../../../convex/_generated/dataModel";

export function SharedNotePage({
	note,
}: {
	note: Doc<"notes"> | null | undefined;
	onOpenNote?: (noteId: Doc<"notes">["_id"]) => void;
}) {
	const editor = useEditor({
		extensions: createNoteEditorExtensions(),
		immediatelyRender: false,
		editable: false,
		editorProps: {
			attributes: {
				class:
					"note-tiptap min-h-[240px] border border-transparent bg-transparent px-0 py-0 text-base outline-none",
			},
		},
	});

	React.useEffect(() => {
		if (!editor) {
			return;
		}

		editor.commands.setContent(
			parseStoredNoteContent(note?.content ?? "", editor.state.schema),
			{
				emitUpdate: false,
			},
		);
	}, [editor, note?.content]);

	if (note === undefined) {
		return (
			<div className="flex min-h-svh justify-center px-4 pb-6 md:px-6">
				<div className="flex w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
					<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-6">
						<div className="flex-1 pt-4 md:pt-8">
							<div className="space-y-5">
								<Skeleton className="h-12 w-56" />
								<div className="space-y-3">
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-[92%]" />
									<Skeleton className="h-4 w-[76%]" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (note === null) {
		return (
			<div className="flex min-h-svh items-center justify-center px-4 pb-6 md:px-6">
				<Empty className="max-w-xl">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<FileText className="size-4" />
						</EmptyMedia>
						<EmptyTitle>This shared note is unavailable</EmptyTitle>
						<EmptyDescription>
							It may have been removed, archived, or switched back to private
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
				<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-between gap-6">
					<div className="flex-1 pt-4 md:pt-8">
						<div className="flex flex-col gap-5">
							<Input
								value={note.title}
								readOnly
								placeholder="New note"
								aria-label="Note title"
								className="h-auto border-0 !bg-transparent px-0 py-0 text-3xl font-normal shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:text-4xl"
							/>

							<EditorContent
								editor={editor}
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
								)}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
