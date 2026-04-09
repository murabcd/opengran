import { Icons } from "@workspace/ui/components/icons";
import {
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { FileText, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { SidebarCollapsibleGroup } from "@/components/nav/sidebar-collapsible-group";
import { NoteActionsMenu } from "@/components/note/note-actions-menu";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

const MAX_VISIBLE_NOTES = 5;
const SIDEBAR_NOTE_SKELETON_IDS = [
	"sidebar-note-skeleton-1",
	"sidebar-note-skeleton-2",
	"sidebar-note-skeleton-3",
	"sidebar-note-skeleton-4",
] as const;

export function NavNotes({
	notes,
	title = "Notes",
	emptyMessage = "No notes yet",
	showStarred = true,
	currentNoteId,
	currentNoteTitle,
	recordingNoteId = null,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
}: {
	notes: Array<Doc<"notes">> | undefined;
	title?: string;
	emptyMessage?: string;
	showStarred?: boolean;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	recordingNoteId?: Id<"notes"> | null;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	const starredNotes = React.useMemo(
		() => (notes ?? []).filter((note) => note.isStarred),
		[notes],
	);
	const [showAllNotes, setShowAllNotes] = React.useState(false);
	const isNotesPending = notes === undefined;
	const hasMoreNotes = (notes?.length ?? 0) > MAX_VISIBLE_NOTES;
	const visibleNotes = showAllNotes
		? (notes ?? [])
		: (notes ?? []).slice(0, MAX_VISIBLE_NOTES);

	return (
		<>
			{showStarred && starredNotes.length > 0 ? (
				<SidebarCollapsibleGroup
					title="Starred"
					className="group-data-[collapsible=icon]:hidden"
				>
					<SidebarNotesList
						notes={starredNotes}
						currentNoteId={currentNoteId}
						currentNoteTitle={currentNoteTitle}
						recordingNoteId={recordingNoteId}
						onNoteSelect={onNoteSelect}
						onNoteTitleChange={onNoteTitleChange}
						onNoteTrashed={onNoteTrashed}
					/>
				</SidebarCollapsibleGroup>
			) : null}
			<SidebarCollapsibleGroup
				title={title}
				className="group-data-[collapsible=icon]:hidden"
			>
				{isNotesPending ? <NavNotesSkeleton /> : null}
				{notes && notes.length === 0 ? (
					<div className="px-2 text-xs text-muted-foreground/50">
						{emptyMessage}
					</div>
				) : null}
				{isNotesPending ? null : (
					<>
						<SidebarNotesList
							notes={visibleNotes}
							currentNoteId={currentNoteId}
							currentNoteTitle={currentNoteTitle}
							recordingNoteId={recordingNoteId}
							onNoteSelect={onNoteSelect}
							onNoteTitleChange={onNoteTitleChange}
							onNoteTrashed={onNoteTrashed}
						/>
						{hasMoreNotes ? (
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton
										className="text-sidebar-foreground/70 hover:bg-transparent hover:text-inherit"
										onClick={() => setShowAllNotes((prev) => !prev)}
									>
										<MoreHorizontal />
										<span className="text-xs">
											{showAllNotes ? "Show less" : "Show more"}
										</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						) : null}
					</>
				)}
			</SidebarCollapsibleGroup>
		</>
	);
}

function SidebarNotesList({
	notes,
	currentNoteId,
	currentNoteTitle,
	recordingNoteId,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
}: {
	notes: Array<Doc<"notes">>;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	recordingNoteId: Id<"notes"> | null;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	return (
		<SidebarMenu>
			{notes.map((note) => {
				const isActive = note._id === currentNoteId;
				const isRecording = note._id === recordingNoteId;
				const title =
					isActive && currentNoteTitle?.trim()
						? currentNoteTitle
						: note.title || "New note";

				return (
					<SidebarMenuItem key={note._id}>
						<NoteActionsMenu
							noteId={note._id}
							onMoveToTrash={onNoteTrashed}
							align="start"
							side="right"
							renameAnchor={
								<SidebarMenuButton
									isActive={isActive}
									onClick={() => onNoteSelect(note._id)}
								>
									{isRecording ? (
										<Icons.sidebarRecordingSpinner />
									) : (
										<FileText />
									)}
									<span>{title}</span>
								</SidebarMenuButton>
							}
							renamePopoverAlign="start"
							renamePopoverSide="bottom"
							renamePopoverSideOffset={6}
							renamePopoverClassName="w-[340px] rounded-lg border-sidebar-border/70 bg-sidebar p-1.5 shadow-2xl ring-1 ring-border/60"
							onRenamePreviewChange={isActive ? onNoteTitleChange : undefined}
							onRenamePreviewReset={
								isActive
									? () => onNoteTitleChange?.(note.title || "New note")
									: undefined
							}
						>
							<SidebarMenuAction
								showOnHover
								className="cursor-pointer"
								aria-label={`Open actions for ${title}`}
							>
								<MoreHorizontal />
							</SidebarMenuAction>
						</NoteActionsMenu>
					</SidebarMenuItem>
				);
			})}
		</SidebarMenu>
	);
}

function NavNotesSkeleton() {
	return (
		<div className="px-2">
			<div className="space-y-2">
				{SIDEBAR_NOTE_SKELETON_IDS.map((id) => (
					<div key={id} className="flex items-center gap-2 rounded-md py-1">
						<Skeleton className="size-4 rounded-sm" />
						<Skeleton className="h-4 flex-1" />
					</div>
				))}
			</div>
		</div>
	);
}
