import type { OptimisticLocalStore } from "convex/browser";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { optimisticPatchChat } from "./optimistic-patch-chat";

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
