import * as React from "react";

const loadAuthenticatedAppShellSurface = () =>
	import("@/app/authenticated-app-shell").then((module) => ({
		default: module.AuthenticatedAppShell,
	}));

let authenticatedAppShellSurfacePromise: ReturnType<
	typeof loadAuthenticatedAppShellSurface
> | null = null;

export const preloadAuthenticatedAppShellSurface = () => {
	authenticatedAppShellSurfacePromise ??= loadAuthenticatedAppShellSurface();
	return authenticatedAppShellSurfacePromise;
};

export const AuthenticatedAppShellSurface = React.lazy(
	preloadAuthenticatedAppShellSurface,
);

const loadChatPageSurface = () =>
	import("@/components/chat/chat-page").then((module) => ({
		default: module.ChatPage,
	}));

let chatPageSurfacePromise: ReturnType<typeof loadChatPageSurface> | null =
	null;

export const preloadChatPageSurface = () => {
	chatPageSurfacePromise ??= loadChatPageSurface();
	return chatPageSurfacePromise;
};

export const ChatPageSurface = React.lazy(preloadChatPageSurface);

const loadNotePageSurface = () =>
	import("@/components/note/note-page").then((module) => ({
		default: module.NotePage,
	}));

let notePageSurfacePromise: ReturnType<typeof loadNotePageSurface> | null =
	null;

export const preloadNotePageSurface = () => {
	notePageSurfacePromise ??= loadNotePageSurface();
	return notePageSurfacePromise;
};

export const NotePageSurface = React.lazy(preloadNotePageSurface);

const loadSharedNotePageSurface = () =>
	import("@/components/note/shared-note-page").then((module) => ({
		default: module.SharedNotePage,
	}));

let sharedNotePageSurfacePromise: ReturnType<
	typeof loadSharedNotePageSurface
> | null = null;

export const preloadSharedNotePageSurface = () => {
	sharedNotePageSurfacePromise ??= loadSharedNotePageSurface();
	return sharedNotePageSurfacePromise;
};

export const SharedNotePageSurface = React.lazy(preloadSharedNotePageSurface);
