"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { useQuery } from "convex/react";
import {
	FileText,
	Home,
	Inbox,
	MessageCircle,
	Search,
	UsersRound,
} from "lucide-react";
import * as React from "react";
import { InboxSheet } from "@/components/inbox/inbox-sheet";
import { NavMain } from "@/components/nav/nav-main";
import { NavNotes } from "@/components/nav/nav-notes";
import { NavProjects } from "@/components/nav/nav-projects";
import { NavTrash } from "@/components/nav/nav-trash";
import { RecipesDialog } from "@/components/recipes/recipes-dialog";
import type { SearchCommandItem } from "@/components/search/search-command";
import { SearchCommand } from "@/components/search/search-command";
import {
	SettingsDialog,
	type SettingsPage,
} from "@/components/settings/settings-dialog";
import { NavUser } from "@/components/sidebar/nav-user";
import { TemplatesDialog } from "@/components/templates/templates-dialog";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import { useTranscriptionSession } from "@/hooks/use-transcription-session";
import { getChatId } from "@/lib/chat";
import { getNoteDisplayTitle } from "@/lib/note-title";
import type { WorkspaceRecord } from "@/lib/workspaces";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

const navigation = [
	{
		title: "Search",
		action: "search",
		icon: Search,
	},
	{
		title: "Home",
		action: "view",
		view: "home",
		icon: Home,
	},
	{
		title: "Shared",
		action: "view",
		view: "shared",
		icon: UsersRound,
	},
	{
		title: "Chat",
		action: "view",
		view: "chat",
		icon: MessageCircle,
	},
	{
		title: "Inbox",
		action: "inbox",
		icon: Inbox,
	},
] as const;

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
	const { isMobile, state } = useSidebar();
	const [uiState, dispatchUi] = React.useReducer(
		sidebarUiReducer,
		undefined,
		createInitialSidebarUiState,
	);
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

	const navItems = React.useMemo(
		() =>
			navigation.map((item) => ({
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
	const searchItems: SearchCommandItem[] = [
		...(notes ?? []).map((note) => ({
			id: note._id,
			title: getNoteDisplayTitle(
				note._id === currentNoteId && currentNoteTitle?.trim()
					? currentNoteTitle
					: note.title,
			),
			kind: "note" as const,
			icon: FileText,
			preview: note.searchableText.trim() || undefined,
		})),
		...(chats ?? []).map((chat) => ({
			id: getChatId(chat),
			title: chat.title || "New chat",
			kind: "chat" as const,
			icon: MessageCircle,
			preview: chat.authorName?.trim() || undefined,
		})),
	];

	return (
		<>
			<Sidebar {...props}>
				<AppSidebarHeaderSection
					activeWorkspaceId={activeWorkspaceId}
					currentView={currentView}
					desktopSafeTop={desktopSafeTop}
					inboxOpen={inboxOpen}
					navItems={navItems}
					onInboxOpenChange={onInboxOpenChange}
					onSearchOpen={() =>
						dispatchUi({
							type: "setOpen",
							key: "searchOpen",
							value: true,
						})
					}
					onViewChange={onViewChange}
					onWorkspaceCreate={onWorkspaceCreate}
					onWorkspaceSelect={onWorkspaceSelect}
					workspaces={workspaces}
				/>
				<AppSidebarContentSection
					activeWorkspaceId={activeWorkspaceId}
					currentNoteId={currentNoteId}
					currentNoteTitle={currentNoteTitle}
					currentView={currentView}
					notes={notes}
					onCreateNote={onCreateNote}
					onNoteSelect={onNoteSelect}
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
						onRecipesOpen={() =>
							dispatchUi({
								type: "setOpen",
								key: "recipesOpen",
								value: true,
							})
						}
						onTemplatesOpen={() =>
							dispatchUi({
								type: "setOpen",
								key: "templatesOpen",
								value: true,
							})
						}
						onSettingsOpen={() => onSettingsOpenChange(true, "Profile")}
						onSignOut={onSignOut}
						signingOut={signingOut}
					/>
				</SidebarFooter>
			</Sidebar>
			<AppSidebarDialogs
				activeWorkspaceId={activeWorkspaceId}
				desktopSafeTop={desktopSafeTop}
				inboxItems={inboxItems}
				inboxOpen={inboxOpen}
				isMobile={isMobile}
				onChatSelect={onChatSelect}
				onInboxOpenChange={onInboxOpenChange}
				onNoteSelect={onNoteSelect}
				onOpenChange={(key, value) =>
					dispatchUi({
						type: "setOpen",
						key,
						value,
					})
				}
				onMarkInboxItemsRead={(itemIds) =>
					dispatchUi({ type: "markInboxItemsRead", itemIds })
				}
				onSettingsOpenChange={onSettingsOpenChange}
				searchItems={searchItems}
				settingsOpen={settingsOpen}
				settingsPage={settingsPage}
				sidebarState={state}
				templatesOpen={uiState.templatesOpen}
				recipesOpen={uiState.recipesOpen}
				searchOpen={uiState.searchOpen}
				user={user}
				workspaces={workspaces}
			/>
		</>
	);
}

function AppSidebarHeaderSection({
	activeWorkspaceId,
	currentView,
	desktopSafeTop,
	inboxOpen,
	navItems,
	onInboxOpenChange,
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
		(typeof navigation)[number] & { isActive: boolean; badge?: number }
	>;
	onInboxOpenChange: (open: boolean) => void;
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
					onViewChange={onViewChange}
					onSearchOpen={onSearchOpen}
					onInboxToggle={() => onInboxOpenChange(!inboxOpen)}
				/>
			</div>
		</SidebarHeader>
	);
}

function AppSidebarContentSection({
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
}

function AppSidebarDialogs({
	activeWorkspaceId,
	desktopSafeTop,
	inboxItems,
	inboxOpen,
	isMobile,
	onChatSelect,
	onInboxOpenChange,
	onNoteSelect,
	onOpenChange,
	onMarkInboxItemsRead,
	onSettingsOpenChange,
	searchItems,
	settingsOpen,
	settingsPage,
	sidebarState,
	templatesOpen,
	recipesOpen,
	searchOpen,
	user,
	workspaces,
}: {
	activeWorkspaceId: Id<"workspaces"> | null;
	desktopSafeTop: boolean;
	inboxItems: Array<{ _id: unknown }> | undefined;
	inboxOpen: boolean;
	isMobile: boolean;
	onChatSelect: (chatId: string) => void;
	onInboxOpenChange: (open: boolean) => void;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onOpenChange: (
		key: "searchOpen" | "recipesOpen" | "templatesOpen",
		value: boolean,
	) => void;
	onMarkInboxItemsRead: (itemIds: string[]) => void;
	onSettingsOpenChange: (open: boolean, page?: SettingsPage) => void;
	searchItems: SearchCommandItem[];
	settingsOpen: boolean;
	settingsPage: SettingsPage;
	sidebarState: "expanded" | "collapsed";
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
	return (
		<>
			<SearchCommand
				open={searchOpen}
				onOpenChange={(open) => onOpenChange("searchOpen", open)}
				items={searchItems}
				onSelectItem={(itemId) => {
					const selectedItem = searchItems.find((item) => item.id === itemId);
					if (!selectedItem) {
						return;
					}

					if (selectedItem.kind === "chat") {
						onChatSelect(itemId);
						return;
					}

					onNoteSelect(itemId as Id<"notes">);
				}}
			/>
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={onSettingsOpenChange}
				user={user}
				workspace={
					workspaces.find((workspace) => workspace._id === activeWorkspaceId) ??
					null
				}
				initialPage={settingsPage}
				onPageChange={(page) => onSettingsOpenChange(true, page)}
			/>
			<RecipesDialog
				open={recipesOpen}
				onOpenChange={(open) => onOpenChange("recipesOpen", open)}
			/>
			<TemplatesDialog
				open={templatesOpen}
				onOpenChange={(open) => onOpenChange("templatesOpen", open)}
			/>
			<InboxSheet
				open={inboxOpen}
				onOpenChange={onInboxOpenChange}
				sidebarState={sidebarState}
				isMobile={isMobile}
				desktopSafeTop={desktopSafeTop}
				onMarkItemsRead={onMarkInboxItemsRead}
				onMarkAllRead={() => {
					if (!inboxItems) {
						return;
					}

					onMarkInboxItemsRead(inboxItems.map((item) => String(item._id)));
				}}
			/>
		</>
	);
}
