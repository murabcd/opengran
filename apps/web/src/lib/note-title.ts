export const getNoteDisplayTitle = (title: string | null | undefined) =>
	title?.trim() ? title : "New note";
