"use client";

export const INBOX_PANEL_STORAGE_KEY_DESKTOP =
	"opengran.inbox-panel-width.desktop";
export const INBOX_PANEL_STORAGE_KEY_MOBILE =
	"opengran.inbox-panel-width.mobile";
export const INBOX_PANEL_PINNED_STORAGE_KEY =
	"opengran.inbox-panel-pinned.desktop";

export const readDesktopInboxPanelPinnedState = () => {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		return (
			window.localStorage.getItem(INBOX_PANEL_PINNED_STORAGE_KEY) === "true"
		);
	} catch {
		return false;
	}
};
