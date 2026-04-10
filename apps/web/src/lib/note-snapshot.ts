export const createNoteSnapshot = ({
	title,
	content,
	searchableText,
}: {
	title: string;
	content: string;
	searchableText: string;
}) =>
	JSON.stringify({
		title,
		content,
		searchableText,
	});

export const isLatestNoteSnapshot = (
	snapshot: string,
	latestSnapshot: string | null,
) => snapshot === latestSnapshot;

export const canFlushQueuedNoteSnapshot = ({
	queuedSnapshot,
	latestSnapshot,
	lastSavedSnapshot,
}: {
	queuedSnapshot: string;
	latestSnapshot: string | null;
	lastSavedSnapshot: string | null;
}) =>
	isLatestNoteSnapshot(queuedSnapshot, latestSnapshot) &&
	queuedSnapshot !== lastSavedSnapshot;
