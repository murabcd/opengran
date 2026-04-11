import type { OptimisticLocalStore } from "convex/browser";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { optimisticPatchNote } from "./optimistic-patch-note";

export function optimisticRenameNote(
	localStore: OptimisticLocalStore,
	workspaceId: Id<"workspaces">,
	noteId: Id<"notes">,
	title: string,
) {
	const nextTitle = title.trim();

	optimisticPatchNote(localStore, workspaceId, noteId, (note) => ({
		...note,
		title: nextTitle,
	}));
}
