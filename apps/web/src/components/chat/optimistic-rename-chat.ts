import type { OptimisticLocalStore } from "convex/browser";
import { getChatId } from "@/lib/chat";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

type ChatPatcher = <T extends Doc<"chats">>(chat: T) => T;

function optimisticPatchChat(
	localStore: OptimisticLocalStore,
	workspaceId: Id<"workspaces">,
	chatId: string,
	patchChat: ChatPatcher,
	noteId?: Id<"notes">,
) {
	const chatQueries = [api.chats.list, api.chats.listArchived] as const;

	for (const chatQuery of chatQueries) {
		const chats = localStore.getQuery(chatQuery, { workspaceId });
		if (chats === undefined) {
			continue;
		}

		localStore.setQuery(
			chatQuery,
			{ workspaceId },
			chats.map((chat) =>
				getChatId(chat) === chatId ? patchChat(chat) : chat,
			),
		);
	}

	if (noteId) {
		const noteChats = localStore.getQuery(api.chats.listForNote, {
			workspaceId,
			noteId,
		});
		if (noteChats !== undefined) {
			localStore.setQuery(
				api.chats.listForNote,
				{ workspaceId, noteId },
				noteChats.map((chat) =>
					getChatId(chat) === chatId ? patchChat(chat) : chat,
				),
			);
		}
	}

	const activeChat = localStore.getQuery(api.chats.getSession, {
		workspaceId,
		chatId,
	});
	if (activeChat) {
		localStore.setQuery(
			api.chats.getSession,
			{ workspaceId, chatId },
			patchChat(activeChat),
		);
	}
}

export function optimisticRenameChat(
	localStore: OptimisticLocalStore,
	workspaceId: Id<"workspaces">,
	chatId: string,
	title: string,
	noteId?: Id<"notes">,
) {
	const nextTitle = title.trim();

	optimisticPatchChat(
		localStore,
		workspaceId,
		chatId,
		(chat) => ({
			...chat,
			title: nextTitle || "New chat",
		}),
		noteId,
	);
}
