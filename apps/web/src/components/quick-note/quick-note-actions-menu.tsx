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
	DropdownMenuPortal,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { useMutation, useQuery } from "convex/react";
import { Check, Globe, Link2, Lock, Share2, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import {
	buildQuickNoteShareUrl,
	type QuickNoteVisibility,
	writeTextToClipboard,
} from "./share-note";

export function QuickNoteActionsMenu({
	noteId,
	onMoveToTrash,
	children,
	align = "start",
	side = "bottom",
	itemsBeforeDefaults,
	itemsAfterDefaults,
}: {
	noteId: Id<"notes">;
	onMoveToTrash?: (noteId: Id<"notes">) => void;
	children: React.ReactNode;
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	itemsBeforeDefaults?: React.ReactNode;
	itemsAfterDefaults?: React.ReactNode;
}) {
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [isMovingToTrash, setIsMovingToTrash] = React.useState(false);
	const [isUpdatingShare, setIsUpdatingShare] = React.useState(false);
	const note = useQuery(api.notes.get, { id: noteId });
	const ensureShareId = useMutation(api.notes.ensureShareId);
	const moveToTrash = useMutation(api.notes.moveToTrash).withOptimisticUpdate(
		(localStore, args) => {
			const notes = localStore.getQuery(api.notes.list, {});
			const sharedNotes = localStore.getQuery(api.notes.listShared, {});

			if (notes !== undefined) {
				localStore.setQuery(
					api.notes.list,
					{},
					notes.filter((item) => item._id !== args.id),
				);
			}

			if (sharedNotes !== undefined) {
				localStore.setQuery(
					api.notes.listShared,
					{},
					sharedNotes.filter((item) => item._id !== args.id),
				);
			}

			const activeNote = localStore.getQuery(api.notes.get, { id: args.id });
			if (activeNote !== undefined) {
				localStore.setQuery(api.notes.get, { id: args.id }, null);
			}

			const latestNote = localStore.getQuery(api.notes.getLatest, {});
			if (latestNote?._id === args.id) {
				const nextLatest =
					notes?.find((item) => item._id !== args.id) ??
					(null as Doc<"notes"> | null);
				localStore.setQuery(api.notes.getLatest, {}, nextLatest);
			}
		},
	);
	const updateVisibility = useMutation(api.notes.updateVisibility);

	const handleCopyLink = React.useCallback(async () => {
		try {
			const result = await ensureShareId({ id: noteId });
			const shareUrl = await buildQuickNoteShareUrl(result.shareId);
			await writeTextToClipboard(shareUrl);
			toast.success("Link copied");
		} catch (error) {
			console.error("Failed to copy note link", error);
			toast.error("Failed to copy link");
		}
	}, [ensureShareId, noteId]);

	const handleSetVisibility = React.useCallback(
		async (visibility: QuickNoteVisibility) => {
			if (!note || isUpdatingShare) {
				return;
			}

			setIsUpdatingShare(true);

			try {
				if (visibility === "private") {
					if (note.visibility === "private") {
						return;
					}

					await updateVisibility({
						id: noteId,
						visibility: "private",
					});
					toast.success("Note is now private");
					return;
				}

				let shareId = note.shareId;
				if (note.visibility !== "public" || !shareId) {
					const result = await updateVisibility({
						id: noteId,
						visibility: "public",
					});
					shareId = result.shareId;
				}

				if (!shareId) {
					throw new Error("Missing share identifier.");
				}

				const shareUrl = await buildQuickNoteShareUrl(shareId);
				await writeTextToClipboard(shareUrl);
				toast.success(
					note.visibility === "public"
						? "Share link copied"
						: "Note shared and link copied",
				);
			} catch (error) {
				console.error("Failed to update note visibility", error);
				toast.error("Failed to update sharing");
			} finally {
				setIsUpdatingShare(false);
			}
		},
		[isUpdatingShare, note, noteId, updateVisibility],
	);

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
				console.error("Failed to move note to trash", error);
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
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>
							<Share2 />
							Share
						</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent className="min-w-40">
								<DropdownMenuItem
									className="cursor-pointer justify-between"
									disabled={note === undefined || isUpdatingShare}
									onSelect={(event) => {
										event.preventDefault();
										void handleSetVisibility("private");
									}}
								>
									<div className="flex items-center gap-2">
										<Lock />
										<span>Private</span>
									</div>
									{note?.visibility === "private" ? <Check /> : null}
								</DropdownMenuItem>
								<DropdownMenuItem
									className="cursor-pointer justify-between"
									disabled={note === undefined || isUpdatingShare}
									onSelect={(event) => {
										event.preventDefault();
										void handleSetVisibility("public");
									}}
								>
									<div className="flex items-center gap-2">
										<Globe />
										<span>Public</span>
									</div>
									{note?.visibility === "public" ? <Check /> : null}
								</DropdownMenuItem>
							</DropdownMenuSubContent>
						</DropdownMenuPortal>
					</DropdownMenuSub>
					<DropdownMenuItem
						className="cursor-pointer"
						onSelect={(event) => {
							event.preventDefault();
							void handleCopyLink();
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
