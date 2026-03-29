import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export function optimisticRenameNote(
	localStore: OptimisticLocalStore,
	noteId: Id<"notes">,
	title: string,
) {
	const nextTitle = title.trim() || "New note";

	for (const query of [api.notes.list, api.notes.listShared] as const) {
		const notes = localStore.getQuery(query, {});
		if (notes === undefined) {
			continue;
		}

		localStore.setQuery(
			query,
			{},
			notes.map((note) =>
				note._id === noteId
					? {
							...note,
							title: nextTitle,
						}
					: note,
			),
		);
	}

	const activeNote = localStore.getQuery(api.notes.get, { id: noteId });
	if (activeNote) {
		localStore.setQuery(
			api.notes.get,
			{ id: noteId },
			{
				...activeNote,
				title: nextTitle,
			},
		);
	}

	const latestNote = localStore.getQuery(api.notes.getLatest, {});
	if (latestNote?._id === noteId) {
		localStore.setQuery(
			api.notes.getLatest,
			{},
			{
				...latestNote,
				title: nextTitle,
			},
		);
	}
}
