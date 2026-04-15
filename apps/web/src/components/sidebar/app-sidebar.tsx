"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	useSidebarShell,
} from "@workspace/ui/components/sidebar";
import { useQuery } from "convex/react";
import { FileText } from "lucide-react";
import * as React from "react";
import { InboxSheet } from "@/components/inbox/inbox-sheet";
import { NavMain } from "@/components/nav/nav-main";
import { NavNotes } from "@/components/nav/nav-notes";
import { NavProjects } from "@/components/nav/nav-projects";
import { NavTrash } from "@/components/nav/nav-trash";
import type {
	SearchCommandItem,
	SearchCommandProject,
} from "@/components/search/search-command";
import type { SettingsPage } from "@/components/settings/settings-dialog";
import { NavUser } from "@/components/sidebar/nav-user";
import {
	preloadSidebarDialogSurface,
	SIDEBAR_DIALOG_SURFACES,
	type SidebarDialogSurface,
	SidebarRecipesDialogSurface,
	SidebarSearchCommandSurface,
	SidebarSettingsDialogSurface,
	SidebarTemplatesDialogSurface,
} from "@/components/sidebar/sidebar-dialog-surfaces";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { useTranscriptionSession } from "@/hooks/use-transcription-session";
import { SIDEBAR_NAVIGATION } from "@/lib/navigation";
import { getNoteDisplayTitle } from "@/lib/note-title";
import type { WorkspaceRecord } from "@/lib/workspaces";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

type AppSidebarView =
	| "home"
	| "chat"
	| "inbox"
	| "shared"
	| "note"
	| "notFound";

type SidebarUiState = {
	searchOpen: boolean;
	trashOpen: boolean;
	recipesOpen: boolean;
	templatesOpen: boolean;
	optimisticReadInboxItemIds: Set<string>;
};

type SidebarUiAction =
	| {
			type: "setOpen";
			key: "searchOpen" | "trashOpen" | "recipesOpen" | "templatesOpen";
			value: boolean;
	  }
	| { type: "resetReadInboxItems" }
	| { type: "markInboxItemsRead"; itemIds: string[] };

const createInitialSidebarUiState = (): SidebarUiState => ({
	searchOpen: false,
	trashOpen: false,
	recipesOpen: false,
	templatesOpen: false,
	optimisticReadInboxItemIds: new Set(),
});

function sidebarUiReducer(
	state: SidebarUiState,
	action: SidebarUiAction,
): SidebarUiState {
	switch (action.type) {
		case "setOpen":
			return {
				...state,
				[action.key]: action.value,
			};
		case "resetReadInboxItems":
			return {
				...state,
				optimisticReadInboxItemIds: new Set(),
			};
		case "markInboxItemsRead": {
			const nextReadItemIds = new Set(state.optimisticReadInboxItemIds);
			for (const itemId of action.itemIds) {
				nextReadItemIds.add(itemId);
			}

			return {
				...state,
				optimisticReadInboxItemIds: nextReadItemIds,
			};
		}
	}
}

function useMobileSidebarNavigation({
	dispatchUi,
	isMobile,
	onChatSelect,
	onCreateNote,
	onInboxOpenChange,
	onNoteSelect,
	onSearchIntent,
	onViewChange,
	onWorkspaceSelect,
	setOpenMobile,
}: {
	dispatchUi: React.ActionDispatch<[action: SidebarUiAction]>;
	isMobile: boolean;
	onChatSelect: (chatId: string) => void;
	onCreateNote: () => void;
	onInboxOpenChange: (open: boolean) => void;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onSearchIntent: () => void;
	onViewChange: (view: "home" | "chat" | "inbox" | "shared" | "note") => void;
	onWorkspaceSelect: (workspaceId: Id<"workspaces">) => void;
	setOpenMobile: (open: boolean) => void;
}) {
	const closeMobileSidebar = React.useCallback(() => {
		if (!isMobile) {
			return;
		}

		setOpenMobile(false);
	}, [isMobile, setOpenMobile]);

	const handleSearchOpen = React.useCallback(() => {
		onSearchIntent();
		closeMobileSidebar();
		dispatchUi({
			type: "setOpen",
			key: "searchOpen",
			value: true,
		});
	}, [closeMobileSidebar, dispatchUi, onSearchIntent]);

	const handleInboxOpenChange = React.useCallback(
		(open: boolean) => {
			if (open) {
				closeMobileSidebar();
			}

			onInboxOpenChange(open);
		},
		[closeMobileSidebar, onInboxOpenChange],
	);

	const handleViewChange = React.useCallback(
		(view: "home" | "chat" | "inbox" | "shared" | "note") => {
			closeMobileSidebar();
			onViewChange(view);
		},
		[closeMobileSidebar, onViewChange],
	);

	const handleWorkspaceSelect = React.useCallback(
		(workspaceId: Id<"workspaces">) => {
			closeMobileSidebar();
			onWorkspaceSelect(workspaceId);
		},
		[closeMobileSidebar, onWorkspaceSelect],
	);

	const handleChatSelect = React.useCallback(
		(chatId: string) => {
			closeMobileSidebar();
			onChatSelect(chatId);
		},
		[closeMobileSidebar, onChatSelect],
	);

	const handleNoteSelect = React.useCallback(
		(noteId: Id<"notes">) => {
			closeMobileSidebar();
			onNoteSelect(noteId);
		},
		[closeMobileSidebar, onNoteSelect],
	);

	const handleCreateNote = React.useCallback(() => {
		closeMobileSidebar();
		onCreateNote();
	}, [closeMobileSidebar, onCreateNote]);

	return {
		handleChatSelect,
		handleCreateNote,
		handleInboxOpenChange,
		handleNoteSelect,
		handleSearchOpen,
		handleViewChange,
		handleWorkspaceSelect,
	};
}

function useSidebarDialogPreloader() {
	const [readySurfaces, setReadySurfaces] = React.useState<
		Set<SidebarDialogSurface>
	>(() => new Set());
	const isMountedRef = React.useRef(true);

	React.useEffect(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const markReady = React.useCallback((surface: SidebarDialogSurface) => {
		setReadySurfaces((currentReadySurfaces) => {
			if (currentReadySurfaces.has(surface)) {
				return currentReadySurfaces;
			}

			const nextReadySurfaces = new Set(currentReadySurfaces);
			nextReadySurfaces.add(surface);
			return nextReadySurfaces;
		});
	}, []);

	const ensureReady = React.useCallback(
		(surface: SidebarDialogSurface) => {
			const preloadPromise = preloadSidebarDialogSurface(surface);
			void preloadPromise.then(() => {
				if (!isMountedRef.current) {
					return;
				}

				markReady(surface);
			});
			return preloadPromise;
		},
		[markReady],
	);

	const ensureManyReady = React.useCallback(
		(surfaces: SidebarDialogSurface[]) =>
			Promise.all(surfaces.map((surface) => ensureReady(surface))),
		[ensureReady],
	);

	const isReady = React.useCallback(
		(surface: SidebarDialogSurface) => readySurfaces.has(surface),
		[readySurfaces],
	);

	return {
		ensureManyReady,
		ensureReady,
		isReady,
	};
}

export function AppSidebar({
	workspaces,
	activeWorkspaceId,
	currentView,
	inboxOpen,
	user,
	chats,
	notes,
	sharedNotes,
	onWorkspaceSelect,
	onWorkspaceCreate,
	onViewChange,
	onInboxOpenChange,
	settingsOpen,
	settingsPage = "Profile",
	onSettingsOpenChange,
	onSignOut,
	signingOut = false,
	desktopSafeTop = false,
	currentNoteId,
	currentNoteTitle,
	onChatSelect,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
	onCreateNote,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	workspaces: Array<WorkspaceRecord>;
	activeWorkspaceId: Id<"workspaces"> | null;
	currentView: AppSidebarView;
	inboxOpen: boolean;
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	chats: Array<Doc<"chats">> | undefined;
	notes: Array<Doc<"notes">> | undefined;
	sharedNotes: Array<Doc<"notes">> | undefined;
	onWorkspaceSelect: (workspaceId: Id<"workspaces">) => void;
	onWorkspaceCreate: (input: { name: string }) => Promise<WorkspaceRecord>;
	onViewChange: (view: "home" | "chat" | "inbox" | "shared" | "note") => void;
	onInboxOpenChange: (open: boolean) => void;
	settingsOpen: boolean;
	settingsPage?: SettingsPage;
	onSettingsOpenChange: (open: boolean, page?: SettingsPage) => void;
	onSignOut: () => void;
	signingOut?: boolean;
	desktopSafeTop?: boolean;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	onChatSelect: (chatId: string) => void;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
	onCreateNote: () => void;
}) {
	const { isMobile, setOpenMobile, state } = useSidebarShell();
	const [uiState, dispatchUi] = React.useReducer(
		sidebarUiReducer,
		undefined,
		createInitialSidebarUiState,
	);
	const {
		ensureManyReady: ensureSidebarDialogsReady,
		ensureReady: ensureSidebarDialogReady,
		isReady: isSidebarDialogReady,
	} = useSidebarDialogPreloader();
	const handleSearchIntent = React.useCallback(() => {
		void ensureSidebarDialogReady("search");
	}, [ensureSidebarDialogReady]);
	const handleTemplatesIntent = React.useCallback(() => {
		void ensureSidebarDialogReady("templates");
	}, [ensureSidebarDialogReady]);
	const handleRecipesIntent = React.useCallback(() => {
		void ensureSidebarDialogReady("recipes");
	}, [ensureSidebarDialogReady]);
	const handleSettingsIntent = React.useCallback(() => {
		void ensureSidebarDialogReady("settings");
	}, [ensureSidebarDialogReady]);
	const {
		handleChatSelect,
		handleCreateNote,
		handleInboxOpenChange,
		handleNoteSelect,
		handleSearchOpen,
		handleViewChange,
		handleWorkspaceSelect,
	} = useMobileSidebarNavigation({
		dispatchUi,
		isMobile,
		onChatSelect,
		onCreateNote,
		onInboxOpenChange,
		onNoteSelect,
		onSearchIntent: handleSearchIntent,
		onViewChange,
		onWorkspaceSelect,
		setOpenMobile,
	});
	const transcriptionSession = useTranscriptionSession();
	const inboxItems = useQuery(
		api.inboxItems.list,
		activeWorkspaceId
			? { workspaceId: activeWorkspaceId, view: "unread" }
			: "skip",
	);
	const unreadInboxCount =
		inboxItems?.filter(
			(item) => !uiState.optimisticReadInboxItemIds.has(String(item._id)),
		).length ?? 0;
	const projects = useQuery(
		api.projects.list,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const recordingNoteId = React.useMemo(() => {
		if (!transcriptionSession.isListening) {
			return null;
		}

		const scopeKey = transcriptionSession.scopeKey;
		if (!scopeKey?.startsWith("note:")) {
			return null;
		}

		const scopedNoteId = scopeKey.slice("note:".length);
		if (!scopedNoteId || scopedNoteId === "draft") {
			return null;
		}

		return scopedNoteId as Id<"notes">;
	}, [transcriptionSession.isListening, transcriptionSession.scopeKey]);

	React.useEffect(() => {
		const workspaceScope = activeWorkspaceId ?? "no-workspace";

		if (!workspaceScope) {
			return;
		}

		dispatchUi({ type: "resetReadInboxItems" });
	}, [activeWorkspaceId]);

	React.useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const preloadSidebarDialogs = () => {
			void ensureSidebarDialogsReady(SIDEBAR_DIALOG_SURFACES);
		};
		const requestIdleCallback =
			typeof window.requestIdleCallback === "function"
				? window.requestIdleCallback.bind(window)
				: null;

		if (requestIdleCallback) {
			const idleCallbackId = requestIdleCallback(preloadSidebarDialogs, {
				timeout: 1500,
			});
			return () => window.cancelIdleCallback?.(idleCallbackId);
		}

		const timeoutId = globalThis.setTimeout(preloadSidebarDialogs, 250);
		return () => globalThis.clearTimeout(timeoutId);
	}, [ensureSidebarDialogsReady]);

	React.useEffect(() => {
		if (!settingsOpen) {
			return;
		}

		void ensureSidebarDialogReady("settings");
	}, [ensureSidebarDialogReady, settingsOpen]);

	const navItems = React.useMemo(
		() =>
			SIDEBAR_NAVIGATION.map((item) => ({
				...item,
				isActive:
					item.action === "inbox"
						? inboxOpen
						: item.action === "view" && item.view === currentView,
				badge:
					item.action === "inbox" && unreadInboxCount > 0
						? unreadInboxCount
						: undefined,
			})),
		[currentView, inboxOpen, unreadInboxCount],
	);
	const searchProjects = React.useMemo<SearchCommandProject[]>(
		() =>
			(projects ?? []).map((project) => ({
				id: project._id,
				name: project.name,
			})),
		[projects],
	);
	const projectNameById = React.useMemo(
		() => new Map(searchProjects.map((project) => [project.id, project.name])),
		[searchProjects],
	);
	const searchItems = React.useMemo<SearchCommandItem[]>(
		() =>
			(notes ?? []).map((note) => ({
				id: note._id,
				title: getNoteDisplayTitle(
					note._id === currentNoteId && currentNoteTitle?.trim()
						? currentNoteTitle
						: note.title,
				),
				kind: "note" as const,
				icon: FileText,
				preview: note.searchableText.trim() || undefined,
				projectId: note.projectId ?? undefined,
				projectName: note.projectId
					? projectNameById.get(note.projectId)
					: undefined,
				updatedAt: note.updatedAt,
			})),
		[currentNoteId, currentNoteTitle, notes, projectNameById],
	);
	const handleDialogOpenChange = React.useCallback(
		(key: "searchOpen" | "recipesOpen" | "templatesOpen", value: boolean) => {
			dispatchUi({
				type: "setOpen",
				key,
				value,
			});
		},
		[],
	);
	const handleMarkInboxItemsRead = React.useCallback((itemIds: string[]) => {
		dispatchUi({ type: "markInboxItemsRead", itemIds });
	}, []);

	return (
		<>
			<Sidebar {...props}>
				<AppSidebarHeaderSection
					activeWorkspaceId={activeWorkspaceId}
					currentView={currentView}
					desktopSafeTop={desktopSafeTop}
					inboxOpen={inboxOpen}
					navItems={navItems}
					onInboxOpenChange={handleInboxOpenChange}
					onSearchIntent={handleSearchIntent}
					onSearchOpen={handleSearchOpen}
					onViewChange={handleViewChange}
					onWorkspaceCreate={onWorkspaceCreate}
					onWorkspaceSelect={handleWorkspaceSelect}
					workspaces={workspaces}
				/>
				<AppSidebarContentSection
					activeWorkspaceId={activeWorkspaceId}
					currentNoteId={currentNoteId}
					currentNoteTitle={currentNoteTitle}
					currentView={currentView}
					notes={notes}
					onCreateNote={handleCreateNote}
					onNoteSelect={handleNoteSelect}
					onNoteTitleChange={onNoteTitleChange}
					onNoteTrashed={onNoteTrashed}
					projects={projects}
					recordingNoteId={recordingNoteId}
					sharedNotes={sharedNotes}
				/>
				<SidebarFooter>
					<NavTrash
						open={uiState.trashOpen}
						onOpenChange={(open) =>
							dispatchUi({
								type: "setOpen",
								key: "trashOpen",
								value: open,
							})
						}
					/>
					<NavUser
						user={user}
						onRecipesOpen={() => {
							handleRecipesIntent();
							dispatchUi({
								type: "setOpen",
								key: "recipesOpen",
								value: true,
							});
						}}
						onRecipesIntent={handleRecipesIntent}
						onTemplatesOpen={() => {
							handleTemplatesIntent();
							dispatchUi({
								type: "setOpen",
								key: "templatesOpen",
								value: true,
							});
						}}
						onTemplatesIntent={handleTemplatesIntent}
						onSettingsOpen={() => {
							handleSettingsIntent();
							onSettingsOpenChange(true, "Profile");
						}}
						onSettingsIntent={handleSettingsIntent}
						onSignOut={onSignOut}
						signingOut={signingOut}
					/>
				</SidebarFooter>
			</Sidebar>
			<AppSidebarDialogs
				activeWorkspaceId={activeWorkspaceId}
				onChatSelect={handleChatSelect}
				onNoteSelect={handleNoteSelect}
				onOpenChange={handleDialogOpenChange}
				onSettingsOpenChange={onSettingsOpenChange}
				searchItems={searchItems}
				searchProjects={searchProjects}
				settingsOpen={settingsOpen}
				settingsPage={settingsPage}
				isDialogReady={isSidebarDialogReady}
				templatesOpen={uiState.templatesOpen}
				recipesOpen={uiState.recipesOpen}
				searchOpen={uiState.searchOpen}
				user={user}
				workspaces={workspaces}
			/>
			<AppSidebarInboxSheet
				desktopSafeTop={desktopSafeTop}
				inboxItems={inboxItems}
				inboxOpen={inboxOpen}
				isMobile={isMobile}
				onInboxOpenChange={handleInboxOpenChange}
				onMarkInboxItemsRead={handleMarkInboxItemsRead}
				sidebarState={state}
				user={user}
			/>
		</>
	);
}

const AppSidebarHeaderSection = React.memo(function AppSidebarHeaderSection({
	activeWorkspaceId,
	currentView,
	desktopSafeTop,
	inboxOpen,
	navItems,
	onInboxOpenChange,
	onSearchIntent,
	onSearchOpen,
	onViewChange,
	onWorkspaceCreate,
	onWorkspaceSelect,
	workspaces,
}: {
	activeWorkspaceId: Id<"workspaces"> | null;
	currentView: AppSidebarView;
	desktopSafeTop: boolean;
	inboxOpen: boolean;
	navItems: Array<
		(typeof SIDEBAR_NAVIGATION)[number] & {
			isActive: boolean;
			badge?: number;
		}
	>;
	onInboxOpenChange: (open: boolean) => void;
	onSearchIntent: () => void;
	onSearchOpen: () => void;
	onViewChange: (view: "home" | "chat" | "inbox" | "shared" | "note") => void;
	onWorkspaceCreate: (input: { name: string }) => Promise<WorkspaceRecord>;
	onWorkspaceSelect: (workspaceId: Id<"workspaces">) => void;
	workspaces: Array<WorkspaceRecord>;
}) {
	return (
		<SidebarHeader
			data-app-region={desktopSafeTop ? "drag" : undefined}
			className={desktopSafeTop ? "pt-8" : undefined}
		>
			<div
				data-app-region={desktopSafeTop ? "no-drag" : undefined}
				className={
					desktopSafeTop && currentView !== "notFound" ? "mt-4" : undefined
				}
			>
				<WorkspaceSwitcher
					workspaces={workspaces}
					activeWorkspaceId={activeWorkspaceId}
					onSelect={onWorkspaceSelect}
					onCreateWorkspace={onWorkspaceCreate}
				/>
			</div>
			{desktopSafeTop ? <div aria-hidden="true" className="h-3" /> : null}
			<div data-app-region={desktopSafeTop ? "no-drag" : undefined}>
				<NavMain
					className="px-0"
					items={navItems}
					onSearchIntent={onSearchIntent}
					onViewChange={onViewChange}
					onSearchOpen={onSearchOpen}
					onInboxToggle={() => onInboxOpenChange(!inboxOpen)}
				/>
			</div>
		</SidebarHeader>
	);
});

const AppSidebarContentSection = React.memo(function AppSidebarContentSection({
	activeWorkspaceId,
	currentNoteId,
	currentNoteTitle,
	currentView,
	notes,
	onCreateNote,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
	projects,
	recordingNoteId,
	sharedNotes,
}: {
	activeWorkspaceId: Id<"workspaces"> | null;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	currentView: AppSidebarView;
	notes: Array<Doc<"notes">> | undefined;
	onCreateNote: () => void;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
	projects: Array<Doc<"projects">> | undefined;
	recordingNoteId: Id<"notes"> | null;
	sharedNotes: Array<Doc<"notes">> | undefined;
}) {
	return (
		<SidebarContent>
			{(sharedNotes?.length ?? 0) > 0 ? (
				<NavNotes
					notes={sharedNotes}
					title="Shared"
					emptyMessage="No shared notes yet"
					showStarred={false}
					filterProjectNotes={false}
					currentNoteId={currentView === "note" ? currentNoteId : null}
					currentNoteTitle={currentNoteTitle}
					recordingNoteId={recordingNoteId}
					onNoteSelect={onNoteSelect}
					onNoteTitleChange={onNoteTitleChange}
					onNoteTrashed={onNoteTrashed}
				/>
			) : null}
			<NavNotes
				notes={notes}
				currentNoteId={currentView === "note" ? currentNoteId : null}
				currentNoteTitle={currentNoteTitle}
				recordingNoteId={recordingNoteId}
				onNoteSelect={onNoteSelect}
				onNoteTitleChange={onNoteTitleChange}
				onNoteTrashed={onNoteTrashed}
				onCreateNote={onCreateNote}
			/>
			<NavProjects
				projects={projects}
				notes={notes}
				workspaceId={activeWorkspaceId}
				currentNoteId={currentView === "note" ? currentNoteId : null}
				currentNoteTitle={currentNoteTitle}
				recordingNoteId={recordingNoteId}
				onNoteSelect={onNoteSelect}
				onNoteTitleChange={onNoteTitleChange}
				onNoteTrashed={onNoteTrashed}
			/>
		</SidebarContent>
	);
});

const AppSidebarDialogs = React.memo(function AppSidebarDialogs({
	activeWorkspaceId,
	onChatSelect,
	onNoteSelect,
	onOpenChange,
	onSettingsOpenChange,
	searchItems,
	searchProjects,
	settingsOpen,
	settingsPage,
	isDialogReady,
	templatesOpen,
	recipesOpen,
	searchOpen,
	user,
	workspaces,
}: {
	activeWorkspaceId: Id<"workspaces"> | null;
	onChatSelect: (chatId: string) => void;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onOpenChange: (
		key: "searchOpen" | "recipesOpen" | "templatesOpen",
		value: boolean,
	) => void;
	onSettingsOpenChange: (open: boolean, page?: SettingsPage) => void;
	searchItems: SearchCommandItem[];
	searchProjects: SearchCommandProject[];
	settingsOpen: boolean;
	settingsPage: SettingsPage;
	isDialogReady: (surface: SidebarDialogSurface) => boolean;
	templatesOpen: boolean;
	recipesOpen: boolean;
	searchOpen: boolean;
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	workspaces: Array<WorkspaceRecord>;
}) {
	const handleSearchOpenChange = React.useCallback(
		(open: boolean) => onOpenChange("searchOpen", open),
		[onOpenChange],
	);
	const handleSearchSelectItem = React.useCallback(
		(itemId: string) => {
			const selectedItem = searchItems.find((item) => item.id === itemId);
			if (!selectedItem) {
				return;
			}

			if (selectedItem.kind === "chat") {
				onChatSelect(itemId);
				return;
			}

			onNoteSelect(itemId as Id<"notes">);
		},
		[onChatSelect, onNoteSelect, searchItems],
	);
	const selectedWorkspace = React.useMemo(
		() =>
			workspaces.find((workspace) => workspace._id === activeWorkspaceId) ??
			null,
		[activeWorkspaceId, workspaces],
	);
	const handleSettingsPageChange = React.useCallback(
		(page: SettingsPage) => onSettingsOpenChange(true, page),
		[onSettingsOpenChange],
	);
	const handleRecipesOpenChange = React.useCallback(
		(open: boolean) => onOpenChange("recipesOpen", open),
		[onOpenChange],
	);
	const handleTemplatesOpenChange = React.useCallback(
		(open: boolean) => onOpenChange("templatesOpen", open),
		[onOpenChange],
	);

	return (
		<>
			{searchOpen || isDialogReady("search") ? (
				<React.Suspense fallback={null}>
					<SidebarSearchCommandSurface
						open={searchOpen}
						onOpenChange={handleSearchOpenChange}
						items={searchItems}
						projects={searchProjects}
						onSelectItem={handleSearchSelectItem}
					/>
				</React.Suspense>
			) : null}
			{settingsOpen || isDialogReady("settings") ? (
				<React.Suspense fallback={null}>
					<SidebarSettingsDialogSurface
						open={settingsOpen}
						onOpenChange={onSettingsOpenChange}
						user={user}
						workspace={selectedWorkspace}
						initialPage={settingsPage}
						onPageChange={handleSettingsPageChange}
					/>
				</React.Suspense>
			) : null}
			{recipesOpen || isDialogReady("recipes") ? (
				<React.Suspense fallback={null}>
					<SidebarRecipesDialogSurface
						open={recipesOpen}
						onOpenChange={handleRecipesOpenChange}
					/>
				</React.Suspense>
			) : null}
			{templatesOpen || isDialogReady("templates") ? (
				<React.Suspense fallback={null}>
					<SidebarTemplatesDialogSurface
						open={templatesOpen}
						onOpenChange={handleTemplatesOpenChange}
					/>
				</React.Suspense>
			) : null}
		</>
	);
});

const AppSidebarInboxSheet = React.memo(function AppSidebarInboxSheet({
	desktopSafeTop,
	inboxItems,
	inboxOpen,
	isMobile,
	onInboxOpenChange,
	onMarkInboxItemsRead,
	sidebarState,
	user,
}: {
	desktopSafeTop: boolean;
	inboxItems: Array<{ _id: unknown }> | undefined;
	inboxOpen: boolean;
	isMobile: boolean;
	onInboxOpenChange: (open: boolean) => void;
	onMarkInboxItemsRead: (itemIds: string[]) => void;
	sidebarState: "expanded" | "collapsed";
	user: {
		name: string;
		email: string;
		avatar: string;
	};
}) {
	const handleMarkAllRead = React.useCallback(() => {
		if (!inboxItems) {
			return;
		}

		onMarkInboxItemsRead(inboxItems.map((item) => String(item._id)));
	}, [inboxItems, onMarkInboxItemsRead]);

	return (
		<InboxSheet
			open={inboxOpen}
			onOpenChange={onInboxOpenChange}
			sidebarState={sidebarState}
			isMobile={isMobile}
			desktopSafeTop={desktopSafeTop}
			currentUser={user}
			onMarkItemsRead={onMarkInboxItemsRead}
			onMarkAllRead={handleMarkAllRead}
		/>
	);
});
