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
				<div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-between gap-6">
					<div className="flex-1 pt-4 md:pt-8">
						<div className="flex flex-col gap-5">
							<Input
								value={note.title}
								readOnly
								placeholder="New note"
								aria-label="Note title"
								className="note-title h-auto border-0 !bg-transparent px-0 py-0 text-3xl font-medium leading-tight tracking-tight shadow-none placeholder:text-muted-foreground/70 focus-visible:border-transparent focus-visible:ring-0 dark:!bg-transparent md:text-4xl"
							/>

							<EditorContent
								editor={editor}
								className={cn(
									"min-h-[320px] text-base text-foreground",
									"[&_.ProseMirror]:min-h-[320px]",
								)}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
