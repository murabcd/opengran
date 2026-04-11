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
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation } from "convex/react";
import { Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { NoteTitleEditInput } from "@/components/note/note-title-edit-input";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { getChatId } from "@/lib/chat";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { optimisticRenameChat } from "./optimistic-rename-chat";

type ChatActionsMenuProps = {
	chat: Doc<"chats">;
	onMoveToTrash: (chatId: string) => void;
	children: React.ReactNode;
};

export function ChatActionsMenu({
	chat,
	onMoveToTrash,
	children,
}: ChatActionsMenuProps) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const renameInputRef = React.useRef<HTMLInputElement>(null);
	const [menuOpen, setMenuOpen] = React.useState(false);
	const [renameOpen, setRenameOpen] = React.useState(false);
	const [renameValue, setRenameValue] = React.useState(chat.title);
	const [isRenaming, setIsRenaming] = React.useState(false);
	const storedChatId = getChatId(chat);
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
						variant="destructive"
						className="cursor-pointer"
						onSelect={() => {
							setMenuOpen(false);
							onMoveToTrash(storedChatId);
						}}
					>
						<Trash2 />
						Move to trash
					</DropdownMenuItem>
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
		</>
	);
}
