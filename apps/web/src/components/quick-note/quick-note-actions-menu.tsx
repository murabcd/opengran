import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { useMutation } from "convex/react";
import { Link2, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

export function QuickNoteActionsMenu({
	noteId,
	onMoveToTrash,
	children,
	align = "start",
	side = "bottom",
	itemsBeforeDefaults,
	itemsAfterDefaults,
}: {
	noteId: Id<"quickNotes">;
	onMoveToTrash?: (noteId: Id<"quickNotes">) => void;
	children: React.ReactNode;
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	itemsBeforeDefaults?: React.ReactNode;
	itemsAfterDefaults?: React.ReactNode;
}) {
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [isMovingToTrash, setIsMovingToTrash] = React.useState(false);
	const moveToTrash = useMutation(
		api.quickNotes.moveToTrash,
	).withOptimisticUpdate((localStore, args) => {
		const notes = localStore.getQuery(api.quickNotes.list, {});

		if (notes !== undefined) {
			localStore.setQuery(
				api.quickNotes.list,
				{},
				notes.filter((note) => note._id !== args.id),
			);
		}

		const activeNote = localStore.getQuery(api.quickNotes.get, { id: args.id });
		if (activeNote !== undefined) {
			localStore.setQuery(api.quickNotes.get, { id: args.id }, null);
		}

		const latestNote = localStore.getQuery(api.quickNotes.getLatest, {});
		if (latestNote?._id === args.id) {
			const nextLatest =
				notes?.find((note) => note._id !== args.id) ??
				(null as Doc<"quickNotes"> | null);
			localStore.setQuery(api.quickNotes.getLatest, {}, nextLatest);
		}
	});

	const handleMoveToTrash = React.useCallback(() => {
		if (isMovingToTrash) {
			return;
		}

		setIsMovingToTrash(true);

		void moveToTrash({ id: noteId })
			.then(() => {
				onMoveToTrash?.(noteId);
				setConfirmOpen(false);
				toast.success("Note moved to trash");
			})
			.catch((error) => {
				console.error("Failed to move quick note to trash", error);
				toast.error("Failed to move note to trash");
			})
			.finally(() => {
				setIsMovingToTrash(false);
			});
	}, [isMovingToTrash, moveToTrash, noteId, onMoveToTrash]);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
				<DropdownMenuContent align={align} side={side}>
					{itemsBeforeDefaults}
					<DropdownMenuItem
						className="cursor-pointer"
						onClick={() => {
							const url = new URL(window.location.href);
							url.pathname = "/quick-note";
							url.searchParams.set("noteId", noteId);
							if (window.openGranDesktop) {
								void window.openGranDesktop
									.writeClipboardText(url.toString())
									.then(() => {
										toast.success("Link copied");
									})
									.catch((error) => {
										console.error("Failed to copy note link", error);
										toast.error("Failed to copy link");
									});
								return;
							}

							void navigator.clipboard
								.writeText(url.toString())
								.then(() => {
									toast.success("Link copied");
								})
								.catch((error) => {
									console.error("Failed to copy note link", error);
									toast.error("Failed to copy link");
								});
						}}
					>
						<Link2 />
						Copy link
					</DropdownMenuItem>
					{itemsAfterDefaults}
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						className="cursor-pointer"
						onSelect={(event) => {
							event.preventDefault();
							setConfirmOpen(true);
						}}
					>
						<Trash2 />
						Move to trash
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Move note to trash?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes the note from Home and the sidebar. You can restore
							it later from Trash.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isMovingToTrash}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
							onClick={handleMoveToTrash}
							disabled={isMovingToTrash}
						>
							{isMovingToTrash ? "Moving..." : "Move to trash"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
