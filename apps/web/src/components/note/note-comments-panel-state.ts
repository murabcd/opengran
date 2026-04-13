"use client";

export const COMMENTS_PANEL_PINNED_STORAGE_KEY =
	"opengran.note-comments-panel-pinned.desktop";

export const readDesktopCommentsPanelPinnedState = () => {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		return (
			window.localStorage.getItem(COMMENTS_PANEL_PINNED_STORAGE_KEY) === "true"
		);
	} catch {
		return false;
	}
};
