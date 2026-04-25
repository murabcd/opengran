import { Icons } from "@workspace/ui/components/icons";
import {
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import { FileText, MessageCircle, MoreHorizontal } from "lucide-react";
import * as React from "react";
import { ChatActionsMenu } from "@/components/chat/chat-actions-menu";
import { SidebarCollapsibleGroup } from "@/components/nav/sidebar-collapsible-group";
import { NoteActionsMenu } from "@/components/note/note-actions-menu";
import { getChatId } from "@/lib/chat";
import { getNoteDisplayTitle } from "@/lib/note-title";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

type StarredItem =
	| {
			kind: "note";
			id: string;
			updatedAt: number;
			note: Doc<"notes">;
	  }
	| {
			kind: "chat";
			id: string;
			updatedAt: number;
			chat: Doc<"chats">;
	  };

const getChatDisplayTitle = (title?: string) => {
	const trimmed = title?.trim();
	return trimmed?.length ? trimmed : "New chat";
};

export function NavStarred({
	chats,
	notes,
	currentChatId,
	currentChatTitle,
	currentNoteId,
	currentNoteTitle,
	recordingNoteId,
	onChatSelect,
	onNotePrefetch,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
}: {
	chats: Array<Doc<"chats">> | undefined;
	notes: Array<Doc<"notes">> | undefined;
	currentChatId: string | null;
	currentChatTitle?: string;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	recordingNoteId: Id<"notes"> | null;
	onChatSelect: (chatId: string) => void;
	onNotePrefetch: (noteId: Id<"notes">) => void;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	const starredItems = React.useMemo<StarredItem[]>(
		() =>
			[
				...(notes ?? [])
					.filter((note) => note.isStarred)
					.map((note) => ({
						kind: "note" as const,
						id: note._id,
						updatedAt: note.updatedAt,
						note,
					})),
				...(chats ?? [])
					.filter((chat) => chat.isStarred ?? false)
					.map((chat) => ({
						kind: "chat" as const,
						id: getChatId(chat),
						updatedAt: chat.updatedAt,
						chat,
					})),
			].sort((left, right) => right.updatedAt - left.updatedAt),
		[chats, notes],
	);

	if (starredItems.length === 0) {
		return null;
	}

	return (
		<SidebarCollapsibleGroup
			title="Starred"
			className="group-data-[collapsible=icon]:hidden"
		>
			<SidebarMenu>
				{starredItems.map((item) => {
					if (item.kind === "note") {
						const note = item.note;
						const isActive = note._id === currentNoteId;
						const isRecording = note._id === recordingNoteId;
						const title =
							isActive && currentNoteTitle?.trim()
								? currentNoteTitle
								: note.title;
						const displayTitle = getNoteDisplayTitle(title);

						return (
							<SidebarMenuItem key={`note:${note._id}`}>
								<NoteActionsMenu
									noteId={note._id}
									onMoveToTrash={onNoteTrashed}
									align="start"
									side="right"
									renameAnchor={
										<SidebarMenuButton
											isActive={isActive}
											onFocus={() => onNotePrefetch(note._id)}
											onMouseEnter={() => onNotePrefetch(note._id)}
											onPointerDown={() => onNotePrefetch(note._id)}
											onClick={() => onNoteSelect(note._id)}
										>
											{isRecording ? (
												<Icons.sidebarRecordingSpinner />
											) : (
												<FileText />
											)}
											<span>{displayTitle}</span>
										</SidebarMenuButton>
									}
									renamePopoverAlign="start"
									renamePopoverSide="bottom"
									renamePopoverSideOffset={6}
									renamePopoverClassName="w-[340px] rounded-lg border-sidebar-border/70 bg-sidebar p-1.5 shadow-2xl ring-1 ring-border/60"
									onRenamePreviewChange={
										isActive ? onNoteTitleChange : undefined
									}
									onRenamePreviewReset={
										isActive ? () => onNoteTitleChange?.(note.title) : undefined
									}
								>
									<SidebarMenuAction
										className="cursor-pointer opacity-0 pointer-events-none transition-opacity group-hover/menu-item:opacity-100 group-hover/menu-item:pointer-events-auto"
										aria-label={`Open actions for ${displayTitle}`}
									>
										<MoreHorizontal />
									</SidebarMenuAction>
								</NoteActionsMenu>
							</SidebarMenuItem>
						);
					}

					const chat = item.chat;
					const chatId = getChatId(chat);
					const isActive = chatId === currentChatId;
					const title =
						isActive && currentChatTitle?.trim()
							? currentChatTitle
							: chat.title;
					const displayTitle = getChatDisplayTitle(title);

					return (
						<SidebarMenuItem key={`chat:${chat._id}`}>
							<ChatActionsMenu chat={chat}>
								<SidebarMenuAction
									className="cursor-pointer opacity-0 pointer-events-none transition-opacity group-hover/menu-item:opacity-100 group-hover/menu-item:pointer-events-auto"
									aria-label={`Open actions for ${displayTitle}`}
								>
									<MoreHorizontal />
								</SidebarMenuAction>
							</ChatActionsMenu>
							<SidebarMenuButton
								isActive={isActive}
								onClick={() => onChatSelect(chatId)}
							>
								<MessageCircle />
								<span>{displayTitle}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					);
				})}
			</SidebarMenu>
		</SidebarCollapsibleGroup>
	);
}
