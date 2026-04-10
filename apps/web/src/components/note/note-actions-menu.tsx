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
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
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
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@workspace/ui/components/popover";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	Check,
	Globe,
	Link2,
	Lock,
	Pencil,
	Share2,
	Star,
	StarOff,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { archiveNoteChats } from "@/lib/optimistic-note-chats";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { NoteTitleEditInput } from "./note-title-edit-input";
import { optimisticRenameNote } from "./optimistic-rename-note";
import {
	buildNoteShareUrl,
	type NoteVisibility,
	writeTextToClipboard,
} from "./share-note";

const ensureNoteHasRequiredFields = <T extends Doc<"notes">>(
	note: T,
	options?: { isStarred?: boolean },
) =>
	({
		...note,
		isStarred: options?.isStarred ?? note.isStarred ?? false,
		templateSlug: note.templateSlug ?? undefined,
		visibility: note.visibility ?? "private",
	}) as T & {
		isStarred: boolean;
		templateSlug: string | undefined;
		visibility: "private" | "public";
	};

const normalizeNoteList = <T extends Doc<"notes">>(notes: Array<T>) =>
	notes.map((note) => ensureNoteHasRequiredFields(note));

function useNoteStarControl(noteId: Id<"notes">) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const [isUpdatingStar, setIsUpdatingStar] = React.useState(false);
	const note = useQuery(
		api.notes.get,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId, id: noteId } : "skip",
	);
	const toggleStar = useMutation(api.notes.toggleStar).withOptimisticUpdate(
		(localStore, args) => {
			const updateNoteList = <T extends Doc<"notes">>(
				notes: Array<T> | undefined,
				query: typeof api.notes.list | typeof api.notes.listShared,
			) => {
				if (notes === undefined) {
					return;
				}

				localStore.setQuery(
					query,
					{ workspaceId: args.workspaceId },
					notes.map((item) =>
						item._id === args.id
							? ensureNoteHasRequiredFields(item, {
									isStarred: !(item.isStarred ?? false),
								})
							: ensureNoteHasRequiredFields(item),
					),
				);
			};

			updateNoteList(
				localStore.getQuery(api.notes.list, {
					workspaceId: args.workspaceId,
				}),
				api.notes.list,
			);
			updateNoteList(
				localStore.getQuery(api.notes.listShared, {
					workspaceId: args.workspaceId,
				}),
				api.notes.listShared,
			);

			const activeNote = localStore.getQuery(api.notes.get, {
				workspaceId: args.workspaceId,
				id: args.id,
			});
			if (activeNote) {
				localStore.setQuery(
					api.notes.get,
					{ workspaceId: args.workspaceId, id: args.id },
					{
						...activeNote,
						isStarred: !(activeNote.isStarred ?? false),
					},
				);
			}

			const latestNote = localStore.getQuery(api.notes.getLatest, {
				workspaceId: args.workspaceId,
			});
			if (latestNote?._id === args.id) {
				localStore.setQuery(
					api.notes.getLatest,
					{ workspaceId: args.workspaceId },
					{
						...latestNote,
						isStarred: !(latestNote.isStarred ?? false),
					},
				);
			}
		},
	);

	const handleToggleStar = React.useCallback(async () => {
		if (!note || !activeWorkspaceId || isUpdatingStar) {
			return;
		}

		setIsUpdatingStar(true);

		try {
			const result = await toggleStar({
				workspaceId: activeWorkspaceId,
				id: noteId,
			});
			toast.success(result.isStarred ? "Note starred" : "Note unstarred");
		} catch (error) {
			console.error("Failed to update note star", error);
			toast.error("Failed to update note star");
		} finally {
			setIsUpdatingStar(false);
		}
	}, [activeWorkspaceId, isUpdatingStar, note, noteId, toggleStar]);

	return {
		handleToggleStar,
		isUpdatingStar,
		note,
	};
}

export function NoteStarButton({
	noteId,
	className,
}: {
	noteId: Id<"notes">;
	className?: string;
}) {
	const { handleToggleStar, isUpdatingStar, note } = useNoteStarControl(noteId);
	const isStarred = note?.isStarred ?? false;
	const StarIcon = isStarred ? StarOff : Star;

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className={cn(
				"text-muted-foreground hover:text-foreground",
				isStarred && "text-foreground",
				className,
			)}
			aria-label={
				isStarred ? "Remove note from favorites" : "Add note to favorites"
			}
			aria-pressed={isStarred}
			disabled={!note || isUpdatingStar}
			onClick={() => {
				void handleToggleStar();
			}}
		>
			<StarIcon className="size-4" />
		</Button>
	);
}

type NoteActionsMenuProps = {
	noteId: Id<"notes">;
	onMoveToTrash?: (noteId: Id<"notes">) => void;
	children: React.ReactNode;
	renameAnchor?: React.ReactNode;
	renamePopoverAlign?: "start" | "center" | "end";
	renamePopoverSide?: "top" | "right" | "bottom" | "left";
	renamePopoverSideOffset?: number;
	renamePopoverClassName?: string;
	onRenamePreviewChange?: (title: string) => void;
	onRenamePreviewReset?: () => void;
	align?: "start" | "center" | "end";
	side?: "top" | "right" | "bottom" | "left";
	showRename?: boolean;
	itemsBeforeDefaults?: React.ReactNode;
	itemsAfterDefaults?: React.ReactNode;
};

function useNoteActionsMenu({
	noteId,
	onMoveToTrash,
	onRenamePreviewChange,
}: Pick<
	NoteActionsMenuProps,
	"noteId" | "onMoveToTrash" | "onRenamePreviewChange"
>) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const preventMenuCloseAutoFocusRef = React.useRef(false);
	const ignoreInitialRenameInteractOutsideRef = React.useRef(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [menuOpen, setMenuOpen] = React.useState(false);
	const [renameOpen, setRenameOpen] = React.useState(false);
	const [renameValue, setRenameValue] = React.useState("");
	const renameInputRef = React.useRef<HTMLInputElement>(null);
	const [isMovingToTrash, setIsMovingToTrash] = React.useState(false);
	const [isRenaming, setIsRenaming] = React.useState(false);
	const [isUpdatingShare, setIsUpdatingShare] = React.useState(false);
	const { handleToggleStar, isUpdatingStar, note } = useNoteStarControl(noteId);
	const ensureShareId = useMutation(api.notes.ensureShareId);
	const renameNote = useMutation(api.notes.rename).withOptimisticUpdate(
		(localStore, args) => {
			optimisticRenameNote(localStore, args.workspaceId, args.id, args.title);
		},
	);
	const moveToTrash = useMutation(api.notes.moveToTrash).withOptimisticUpdate(
		(localStore, args) => {
			const notes = localStore.getQuery(api.notes.list, {
				workspaceId: args.workspaceId,
			});
			const sharedNotes = localStore.getQuery(api.notes.listShared, {
				workspaceId: args.workspaceId,
			});

			if (notes !== undefined) {
				localStore.setQuery(
					api.notes.list,
					{ workspaceId: args.workspaceId },
					normalizeNoteList(notes.filter((item) => item._id !== args.id)),
				);
			}

			if (sharedNotes !== undefined) {
				localStore.setQuery(
					api.notes.listShared,
					{ workspaceId: args.workspaceId },
					normalizeNoteList(sharedNotes.filter((item) => item._id !== args.id)),
				);
			}

			const activeNote = localStore.getQuery(api.notes.get, {
				workspaceId: args.workspaceId,
				id: args.id,
			});
			if (activeNote !== undefined) {
				localStore.setQuery(
					api.notes.get,
					{ workspaceId: args.workspaceId, id: args.id },
					null,
				);
			}

			const latestNote = localStore.getQuery(api.notes.getLatest, {
				workspaceId: args.workspaceId,
			});
			if (latestNote?._id === args.id) {
				const nextLatest =
					notes?.find((item) => item._id !== args.id) ??
					(null as Doc<"notes"> | null);
				localStore.setQuery(
					api.notes.getLatest,
					{ workspaceId: args.workspaceId },
					nextLatest ? ensureNoteHasRequiredFields(nextLatest) : null,
				);
			}

			archiveNoteChats(localStore, args.workspaceId, args.id);
		},
	);
	const updateVisibility = useMutation(api.notes.updateVisibility);

	const handleCopyLink = React.useCallback(async () => {
		if (!activeWorkspaceId) {
			return;
		}

		try {
			const result = await ensureShareId({
				workspaceId: activeWorkspaceId,
				id: noteId,
			});
			const shareUrl = await buildNoteShareUrl(result.shareId);
			await writeTextToClipboard(shareUrl);
			toast.success("Link copied");
		} catch (error) {
			console.error("Failed to copy note link", error);
			toast.error("Failed to copy link");
		}
	}, [activeWorkspaceId, ensureShareId, noteId]);

	const handleRename = React.useCallback(async () => {
		if (!note || !activeWorkspaceId || isRenaming) {
			return;
		}

		const nextTitle = renameValue.trim();
		const currentTitle = note.title.trim();

		if (nextTitle === currentTitle) {
			setRenameOpen(false);
			setRenameValue(nextTitle);
			return;
		}

		setIsRenaming(true);

		try {
			await renameNote({
				workspaceId: activeWorkspaceId,
				id: noteId,
				title: nextTitle,
			});
			setRenameOpen(false);
			setRenameValue(nextTitle);
			toast.success("Note renamed");
		} catch (error) {
			console.error("Failed to rename note", error);
			toast.error("Failed to rename note");
		} finally {
			setIsRenaming(false);
		}
	}, [activeWorkspaceId, isRenaming, note, noteId, renameNote, renameValue]);

	React.useEffect(() => {
		if (renameOpen) {
			return;
		}

		setRenameValue(note?.title ?? "");
	}, [note?.title, renameOpen]);

	React.useEffect(() => {
		if (!renameOpen) {
			return;
		}

		onRenamePreviewChange?.(renameValue);
	}, [onRenamePreviewChange, renameOpen, renameValue]);

	const handleRenameOpenChange = React.useCallback(
		(open: boolean) => {
			if (open) {
				setRenameOpen(true);
				return;
			}

			void handleRename();
		},
		[handleRename],
	);

	const handleSetVisibility = React.useCallback(
		async (visibility: NoteVisibility) => {
			if (!note || !activeWorkspaceId || isUpdatingShare) {
				return;
			}

			setIsUpdatingShare(true);

			try {
				if (visibility === "private") {
					if (note.visibility === "private") {
						return;
					}

					await updateVisibility({
						workspaceId: activeWorkspaceId,
						id: noteId,
						visibility: "private",
					});
					toast.success("Note is now private");
					return;
				}

				let shareId = note.shareId;
				if (note.visibility !== "public" || !shareId) {
					const result = await updateVisibility({
						workspaceId: activeWorkspaceId,
						id: noteId,
						visibility: "public",
					});
					shareId = result.shareId;
				}

				if (!shareId) {
					throw new Error("Missing share identifier.");
				}

				const shareUrl = await buildNoteShareUrl(shareId);
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
		[activeWorkspaceId, isUpdatingShare, note, noteId, updateVisibility],
	);

	const handleMoveToTrash = React.useCallback(() => {
		if (!activeWorkspaceId || isMovingToTrash) {
			return;
		}

		setIsMovingToTrash(true);

		void moveToTrash({ workspaceId: activeWorkspaceId, id: noteId })
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
	}, [activeWorkspaceId, isMovingToTrash, moveToTrash, noteId, onMoveToTrash]);

	const handleConfirmTrashOpen = React.useCallback(() => {
		setMenuOpen(false);
		setConfirmOpen(true);
	}, []);

	const handleStartRename = React.useCallback(() => {
		setMenuOpen(false);
		preventMenuCloseAutoFocusRef.current = true;
		ignoreInitialRenameInteractOutsideRef.current = true;
		setRenameValue(note?.title ?? "");
		setRenameOpen(true);
	}, [note?.title]);

	const handleRenameCancel = React.useCallback(() => {
		setRenameOpen(false);
		setRenameValue(note?.title ?? "");
	}, [note?.title]);

	return {
		confirmOpen,
		setConfirmOpen,
		menuOpen,
		setMenuOpen,
		renameOpen,
		renameValue,
		setRenameValue,
		renameInputRef,
		isMovingToTrash,
		isRenaming,
		isUpdatingShare,
		isUpdatingStar,
		note,
		preventMenuCloseAutoFocusRef,
		ignoreInitialRenameInteractOutsideRef,
		handleToggleStar,
		handleRenameOpenChange,
		handleSetVisibility,
		handleCopyLink,
		handleMoveToTrash,
		handleConfirmTrashOpen,
		handleStartRename,
		handleRenameCancel,
		handleRename,
	};
}

export function NoteActionsMenu({
	noteId,
	onMoveToTrash,
	children,
	renameAnchor,
	renamePopoverAlign = "start",
	renamePopoverSide = "bottom",
	renamePopoverSideOffset = 8,
	renamePopoverClassName,
	onRenamePreviewReset,
	align = "start",
	side = "bottom",
	showRename = true,
	itemsBeforeDefaults,
	itemsAfterDefaults,
	onRenamePreviewChange,
}: NoteActionsMenuProps) {
	const {
		confirmOpen,
		setConfirmOpen,
		menuOpen,
		setMenuOpen,
		renameOpen,
		renameValue,
		setRenameValue,
		renameInputRef,
		isMovingToTrash,
		isRenaming,
		isUpdatingShare,
		isUpdatingStar,
		note,
		preventMenuCloseAutoFocusRef,
		ignoreInitialRenameInteractOutsideRef,
		handleToggleStar,
		handleRenameOpenChange,
		handleSetVisibility,
		handleCopyLink,
		handleMoveToTrash,
		handleConfirmTrashOpen,
		handleStartRename,
		handleRenameCancel,
		handleRename,
	} = useNoteActionsMenu({
		noteId,
		onMoveToTrash,
		onRenamePreviewChange,
	});

	return (
		<>
			{renameAnchor ? (
				<Popover open={renameOpen} onOpenChange={handleRenameOpenChange}>
					<PopoverAnchor asChild>{renameAnchor}</PopoverAnchor>
					<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
						<NoteActionsDropdownContent
							align={align}
							side={side}
							itemsBeforeDefaults={itemsBeforeDefaults}
							itemsAfterDefaults={itemsAfterDefaults}
							preventMenuCloseAutoFocusRef={preventMenuCloseAutoFocusRef}
							note={note}
							isUpdatingShare={isUpdatingShare}
							onSetVisibility={handleSetVisibility}
							showRename={showRename}
							onStartRename={handleStartRename}
							isUpdatingStar={isUpdatingStar}
							onToggleStar={handleToggleStar}
							onCopyLink={handleCopyLink}
							onConfirmTrash={handleConfirmTrashOpen}
						/>
					</DropdownMenu>
					{showRename ? (
						<NoteRenameEditor
							renameAnchor={renameAnchor}
							renameOpen={renameOpen}
							onRenameOpenChange={handleRenameOpenChange}
							renamePopoverAlign={renamePopoverAlign}
							renamePopoverSide={renamePopoverSide}
							renamePopoverSideOffset={renamePopoverSideOffset}
							renamePopoverClassName={renamePopoverClassName}
							renameInputRef={renameInputRef}
							renameValue={renameValue}
							onRenameValueChange={setRenameValue}
							onRename={() => {
								void handleRename();
							}}
							onRenameCancel={() => {
								handleRenameCancel();
								onRenamePreviewReset?.();
							}}
							ignoreInitialRenameInteractOutsideRef={
								ignoreInitialRenameInteractOutsideRef
							}
							isRenaming={isRenaming}
						/>
					) : null}
				</Popover>
			) : (
				<>
					<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
						<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
						<NoteActionsDropdownContent
							align={align}
							side={side}
							itemsBeforeDefaults={itemsBeforeDefaults}
							itemsAfterDefaults={itemsAfterDefaults}
							preventMenuCloseAutoFocusRef={preventMenuCloseAutoFocusRef}
							note={note}
							isUpdatingShare={isUpdatingShare}
							onSetVisibility={handleSetVisibility}
							showRename={showRename}
							onStartRename={handleStartRename}
							isUpdatingStar={isUpdatingStar}
							onToggleStar={handleToggleStar}
							onCopyLink={handleCopyLink}
							onConfirmTrash={handleConfirmTrashOpen}
						/>
					</DropdownMenu>
					{showRename ? (
						<NoteRenameEditor
							renameOpen={renameOpen}
							onRenameOpenChange={handleRenameOpenChange}
							renamePopoverAlign={renamePopoverAlign}
							renamePopoverSide={renamePopoverSide}
							renamePopoverSideOffset={renamePopoverSideOffset}
							renamePopoverClassName={renamePopoverClassName}
							renameInputRef={renameInputRef}
							renameValue={renameValue}
							onRenameValueChange={setRenameValue}
							onRename={() => {
								void handleRename();
							}}
							onRenameCancel={() => {
								handleRenameCancel();
								onRenamePreviewReset?.();
							}}
							ignoreInitialRenameInteractOutsideRef={
								ignoreInitialRenameInteractOutsideRef
							}
							isRenaming={isRenaming}
						/>
					) : null}
				</>
			)}
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

function NoteRenameEditor({
	renameAnchor,
	renameOpen,
	onRenameOpenChange,
	renamePopoverAlign,
	renamePopoverSide,
	renamePopoverSideOffset,
	renamePopoverClassName,
	renameInputRef,
	renameValue,
	onRenameValueChange,
	onRename,
	onRenameCancel,
	ignoreInitialRenameInteractOutsideRef,
	isRenaming,
}: {
	renameAnchor?: React.ReactNode;
	renameOpen: boolean;
	onRenameOpenChange: (open: boolean) => void;
	renamePopoverAlign: "start" | "center" | "end";
	renamePopoverSide: "top" | "right" | "bottom" | "left";
	renamePopoverSideOffset: number;
	renamePopoverClassName?: string;
	renameInputRef: React.RefObject<HTMLInputElement | null>;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	onRename: () => void;
	onRenameCancel: () => void;
	ignoreInitialRenameInteractOutsideRef: React.MutableRefObject<boolean>;
	isRenaming: boolean;
}) {
	if (renameAnchor) {
		return (
			<PopoverContent
				align={renamePopoverAlign}
				side={renamePopoverSide}
				sideOffset={renamePopoverSideOffset}
				className={cn("w-96 rounded-lg p-2", renamePopoverClassName)}
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					requestAnimationFrame(() => {
						const input = renameInputRef.current;
						if (!input) {
							return;
						}

						input.focus();
						input.setSelectionRange(0, input.value.length);
					});
				}}
				onInteractOutside={(event) => {
					if (ignoreInitialRenameInteractOutsideRef.current) {
						event.preventDefault();
						ignoreInitialRenameInteractOutsideRef.current = false;
					}
				}}
			>
				<div className="flex items-center gap-2">
					<NoteTitleEditInput
						focusOnMount
						commitOnBlur={false}
						inputRef={renameInputRef}
						value={renameValue}
						onValueChange={onRenameValueChange}
						onCommit={onRename}
						onCancel={onRenameCancel}
					/>
				</div>
			</PopoverContent>
		);
	}

	return (
		<Dialog open={renameOpen} onOpenChange={onRenameOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Rename note</DialogTitle>
					<DialogDescription>
						Enter a new title for this note.
					</DialogDescription>
				</DialogHeader>
				<div>
					<NoteTitleEditInput
						focusOnMount
						commitOnBlur={false}
						className="h-9 rounded-lg px-3 text-sm"
						inputRef={renameInputRef}
						value={renameValue}
						onValueChange={onRenameValueChange}
						onCommit={onRename}
						onCancel={onRenameCancel}
					/>
				</div>
				<div className="flex justify-end">
					<Button onClick={onRename} disabled={isRenaming}>
						{isRenaming ? "Renaming..." : "Rename"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function NoteActionsDropdownContent({
	align,
	side,
	itemsBeforeDefaults,
	itemsAfterDefaults,
	preventMenuCloseAutoFocusRef,
	note,
	isUpdatingShare,
	onSetVisibility,
	showRename,
	onStartRename,
	isUpdatingStar,
	onToggleStar,
	onCopyLink,
	onConfirmTrash,
}: {
	align: "start" | "center" | "end";
	side: "top" | "right" | "bottom" | "left";
	itemsBeforeDefaults?: React.ReactNode;
	itemsAfterDefaults?: React.ReactNode;
	preventMenuCloseAutoFocusRef: React.MutableRefObject<boolean>;
	note: Doc<"notes"> | null | undefined;
	isUpdatingShare: boolean;
	onSetVisibility: (visibility: NoteVisibility) => Promise<void>;
	showRename: boolean;
	onStartRename: () => void;
	isUpdatingStar: boolean;
	onToggleStar: () => Promise<void>;
	onCopyLink: () => Promise<void>;
	onConfirmTrash: () => void;
}) {
	return (
		<DropdownMenuContent
			align={align}
			side={side}
			className="w-56 overflow-hidden rounded-lg p-1"
			onCloseAutoFocus={(event) => {
				if (preventMenuCloseAutoFocusRef.current) {
					event.preventDefault();
					preventMenuCloseAutoFocusRef.current = false;
				}
			}}
		>
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
							onClick={() => {
								void onSetVisibility("private");
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
							onClick={() => {
								void onSetVisibility("public");
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
			{showRename ? (
				<DropdownMenuItem
					className="cursor-pointer"
					disabled={!note}
					onClick={onStartRename}
				>
					<Pencil />
					Rename
				</DropdownMenuItem>
			) : null}
			<DropdownMenuItem
				className="cursor-pointer"
				disabled={!note || isUpdatingStar}
				onClick={() => {
					void onToggleStar();
				}}
			>
				{note?.isStarred ? <StarOff /> : <Star />}
				{note?.isStarred ? "Unstar" : "Star"}
			</DropdownMenuItem>
			<DropdownMenuItem
				className="cursor-pointer"
				onClick={() => {
					void onCopyLink();
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
				onSelect={onConfirmTrash}
			>
				<Trash2 />
				Move to trash
			</DropdownMenuItem>
		</DropdownMenuContent>
	);
}
