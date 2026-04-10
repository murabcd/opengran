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

export const isLatestNoteSaveRequest = ({
	requestId,
	latestRequestId,
}: {
	requestId: number;
	latestRequestId: number;
}) => requestId === latestRequestId;

export const canFlushQueuedNoteSave = ({
	queuedRequestId,
	latestRequestId,
	queuedSnapshot,
	lastSavedSnapshot,
}: {
	queuedRequestId: number;
	latestRequestId: number;
	queuedSnapshot: string;
	lastSavedSnapshot: string | null;
}) =>
	isLatestNoteSaveRequest({
		requestId: queuedRequestId,
		latestRequestId,
	}) && queuedSnapshot !== lastSavedSnapshot;
