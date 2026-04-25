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
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation } from "convex/react";
import { Pencil, Star, StarOff, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { NoteTitleEditInput } from "@/components/note/note-title-edit-input";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { getChatId } from "@/lib/chat";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { optimisticPatchChat } from "./optimistic-patch-chat";
import { optimisticRemoveChat } from "./optimistic-remove-chat";
import { optimisticRenameChat } from "./optimistic-rename-chat";

type ChatActionsMenuProps = {
	chat: Doc<"chats">;
	children: React.ReactNode;
	onMoveToTrash?: (chatId: string) => void;
	showMoveToTrash?: boolean;
};

export function ChatActionsMenu({
	chat,
	children,
	onMoveToTrash,
	showMoveToTrash = true,
}: ChatActionsMenuProps) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const renameInputRef = React.useRef<HTMLInputElement>(null);
	const [confirmTrashOpen, setConfirmTrashOpen] = React.useState(false);
	const [menuOpen, setMenuOpen] = React.useState(false);
	const [renameOpen, setRenameOpen] = React.useState(false);
	const [renameValue, setRenameValue] = React.useState(chat.title);
	const [isRenaming, setIsRenaming] = React.useState(false);
	const [isUpdatingStar, setIsUpdatingStar] = React.useState(false);
	const [isMovingToTrash, setIsMovingToTrash] = React.useState(false);
	const storedChatId = getChatId(chat);
	const isStarred = chat.isStarred ?? false;
	const renameChat = useMutation(api.chats.updateTitle).withOptimisticUpdate(
		(localStore, args) => {
			optimisticRenameChat(
				localStore,
				args.workspaceId,
				args.chatId,
				args.title,
				chat.noteId,
			);
		},
	);
	const toggleStar = useMutation(api.chats.toggleStar).withOptimisticUpdate(
		(localStore, args) => {
			optimisticPatchChat(
				localStore,
				args.workspaceId,
				args.chatId,
				(currentChat) => ({
					...currentChat,
					isStarred: !(currentChat.isStarred ?? false),
				}),
				chat.noteId,
			);
		},
	);
	const moveToTrash = useMutation(api.chats.moveToTrash).withOptimisticUpdate(
		(localStore, args) => {
			optimisticRemoveChat(localStore, args.workspaceId, args.chatId);
		},
	);

	React.useEffect(() => {
		if (renameOpen) {
			return;
		}

		setRenameValue(chat.title);
	}, [chat.title, renameOpen]);

	const handleRename = React.useCallback(async () => {
		if (!activeWorkspaceId || isRenaming) {
			return;
		}

		const nextTitle = renameValue.trim();
		const currentTitle = chat.title.trim();

		if (nextTitle === currentTitle) {
			setRenameOpen(false);
			setRenameValue(nextTitle);
			return;
		}

		setIsRenaming(true);

		try {
			await renameChat({
				workspaceId: activeWorkspaceId,
				chatId: storedChatId,
				title: nextTitle,
			});
			setRenameOpen(false);
			setRenameValue(nextTitle);
			toast.success("Chat renamed");
		} catch (error) {
			console.error("Failed to rename chat", error);
			toast.error("Failed to rename chat");
		} finally {
			setIsRenaming(false);
		}
	}, [
		activeWorkspaceId,
		chat.title,
		isRenaming,
		renameChat,
		renameValue,
		storedChatId,
	]);

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

	const handleStartRename = React.useCallback(() => {
		setMenuOpen(false);
		setRenameValue(chat.title);
		setRenameOpen(true);
	}, [chat.title]);

	const handleRenameCancel = React.useCallback(() => {
		setRenameOpen(false);
		setRenameValue(chat.title);
	}, [chat.title]);

	const handleToggleStar = React.useCallback(async () => {
		if (!activeWorkspaceId || isUpdatingStar) {
			return;
		}

		setIsUpdatingStar(true);

		try {
			const result = await toggleStar({
				workspaceId: activeWorkspaceId,
				chatId: storedChatId,
			});
			toast.success(result.isStarred ? "Chat starred" : "Chat unstarred");
		} catch (error) {
			console.error("Failed to update chat star", error);
			toast.error("Failed to update chat star");
		} finally {
			setIsUpdatingStar(false);
		}
	}, [activeWorkspaceId, isUpdatingStar, storedChatId, toggleStar]);

	const handleMoveToTrash = React.useCallback(async () => {
		if (!activeWorkspaceId || isMovingToTrash) {
			return;
		}

		setIsMovingToTrash(true);

		try {
			await moveToTrash({
				workspaceId: activeWorkspaceId,
				chatId: storedChatId,
			});
			onMoveToTrash?.(storedChatId);
			setConfirmTrashOpen(false);
			toast.success("Chat moved to trash");
		} catch (error) {
			console.error("Failed to move chat to trash", error);
			toast.error("Failed to move chat to trash");
		} finally {
			setIsMovingToTrash(false);
		}
	}, [
		activeWorkspaceId,
		isMovingToTrash,
		moveToTrash,
		onMoveToTrash,
		storedChatId,
	]);

	return (
		<>
			<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
				<DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						className="cursor-pointer"
						disabled={!activeWorkspaceId}
						onSelect={handleStartRename}
					>
						<Pencil />
						Rename
					</DropdownMenuItem>
					<DropdownMenuItem
						className="cursor-pointer"
						disabled={!activeWorkspaceId || isUpdatingStar}
						onSelect={() => {
							setMenuOpen(false);
							void handleToggleStar();
						}}
					>
						{isStarred ? <StarOff /> : <Star />}
						{isStarred ? "Unstar" : "Star"}
					</DropdownMenuItem>
					{showMoveToTrash ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								className="cursor-pointer"
								disabled={isMovingToTrash || !activeWorkspaceId}
								onSelect={() => {
									setMenuOpen(false);
									setConfirmTrashOpen(true);
								}}
							>
								<Trash2 />
								Move to trash
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog open={renameOpen} onOpenChange={handleRenameOpenChange}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename chat</DialogTitle>
						<DialogDescription>
							Enter a new title for this chat.
						</DialogDescription>
					</DialogHeader>
					<div>
						<NoteTitleEditInput
							focusOnMount
							commitOnBlur={false}
							className={cn(
								"h-9 rounded-lg px-3 text-sm",
								isRenaming && "opacity-70",
							)}
							inputRef={renameInputRef}
							value={renameValue}
							placeholder="New chat"
							onValueChange={setRenameValue}
							onCommit={() => {
								void handleRename();
							}}
							onCancel={handleRenameCancel}
						/>
					</div>
					<div className="flex justify-end gap-2">
						<Button
							variant="ghost"
							onClick={handleRenameCancel}
							disabled={isRenaming}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								void handleRename();
							}}
							disabled={isRenaming}
						>
							{isRenaming ? "Renaming..." : "Rename"}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
			<AlertDialog open={confirmTrashOpen} onOpenChange={setConfirmTrashOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Move chat to trash?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes the chat from the list. You can restore it later from
							Trash.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isMovingToTrash}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
							onClick={() => {
								void handleMoveToTrash();
							}}
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
