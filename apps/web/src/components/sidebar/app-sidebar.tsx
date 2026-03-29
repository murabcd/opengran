"use client";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
} from "@workspace/ui/components/sidebar";
import {
	FileText,
	Home,
	MessageCircle,
	Search,
	UsersRound,
} from "lucide-react";
import * as React from "react";
import { NavMain } from "@/components/nav/nav-main";
import { NavNotes } from "@/components/nav/nav-notes";
import { NavTrash } from "@/components/nav/nav-trash";
import type { SearchCommandItem } from "@/components/search/search-command";
import { SearchCommand } from "@/components/search/search-command";
import {
	SettingsDialog,
	type SettingsPage,
} from "@/components/settings/settings-dialog";
import { NavUser } from "@/components/sidebar/nav-user";
import { TemplatesDialog } from "@/components/templates/templates-dialog";
import { WorkspaceSwitcher } from "@/components/workspaces/workspace-switcher";
import type { WorkspaceRecord } from "@/lib/workspaces";
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
] as const;

export function AppSidebar({
	workspaces,
	activeWorkspaceId,
	currentView,
	user,
	notes,
	onWorkspaceSelect,
	onWorkspaceCreate,
	onViewChange,
	settingsOpen,
	settingsPage = "Profile",
	onSettingsOpenChange,
	onSignOut,
	signingOut = false,
	desktopSafeTop = false,
	currentNoteId,
	currentNoteTitle,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	workspaces: Array<WorkspaceRecord>;
	activeWorkspaceId: Id<"workspaces"> | null;
	currentView: "home" | "chat" | "shared" | "note" | "notFound";
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	notes: Array<Doc<"notes">> | undefined;
	onWorkspaceSelect: (workspaceId: Id<"workspaces">) => void;
	onWorkspaceCreate: (input: { name: string }) => Promise<WorkspaceRecord>;
	onViewChange: (view: "home" | "chat" | "shared" | "note") => void;
	settingsOpen: boolean;
	settingsPage?: SettingsPage;
	onSettingsOpenChange: (open: boolean, page?: SettingsPage) => void;
	onSignOut: () => void;
	signingOut?: boolean;
	desktopSafeTop?: boolean;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	const [searchOpen, setSearchOpen] = React.useState(false);
	const [trashOpen, setTrashOpen] = React.useState(false);
	const [templatesOpen, setTemplatesOpen] = React.useState(false);
	const [draftUser, setDraftUser] = React.useState(user);

	React.useEffect(() => {
		setDraftUser(user);
	}, [user]);

	const navItems = React.useMemo(
		() =>
			navigation.map((item) => ({
				...item,
				isActive: item.action === "view" && item.view === currentView,
			})),
		[currentView],
	);
	const searchItems = React.useMemo<SearchCommandItem[]>(
		() =>
			(notes ?? []).map((note) => ({
				id: note._id,
				title:
					note._id === currentNoteId && currentNoteTitle?.trim()
						? currentNoteTitle
						: note.title || "New note",
				icon: FileText,
			})),
		[notes, currentNoteId, currentNoteTitle],
	);

	return (
		<>
			<Sidebar {...props}>
				<SidebarHeader
					data-app-region={desktopSafeTop ? "drag" : undefined}
					className={desktopSafeTop ? "pt-8" : undefined}
				>
					<div data-app-region={desktopSafeTop ? "no-drag" : undefined}>
						<WorkspaceSwitcher
							workspaces={workspaces}
							activeWorkspaceId={activeWorkspaceId}
							onSelect={onWorkspaceSelect}
							onCreateWorkspace={onWorkspaceCreate}
						/>
					</div>
					<div data-app-region={desktopSafeTop ? "no-drag" : undefined}>
						<NavMain
							className="px-0"
							items={navItems}
							onViewChange={onViewChange}
							onSearchOpen={() => setSearchOpen(true)}
						/>
					</div>
				</SidebarHeader>
				<SidebarContent>
					<NavNotes
						notes={notes}
						currentNoteId={currentView === "note" ? currentNoteId : null}
						currentNoteTitle={currentNoteTitle}
						onNoteSelect={onNoteSelect}
						onNoteTitleChange={onNoteTitleChange}
						onNoteTrashed={onNoteTrashed}
					/>
				</SidebarContent>
				<SidebarFooter>
					<NavTrash open={trashOpen} onOpenChange={setTrashOpen} />
					<NavUser
						user={draftUser}
						onTemplatesOpen={() => setTemplatesOpen(true)}
						onSettingsOpen={() => onSettingsOpenChange(true, "Profile")}
						onSignOut={onSignOut}
						signingOut={signingOut}
					/>
				</SidebarFooter>
			</Sidebar>
			<SearchCommand
				open={searchOpen}
				onOpenChange={setSearchOpen}
				items={searchItems}
				onSelectItem={(itemId) => {
					onNoteSelect(itemId as Id<"notes">);
				}}
			/>
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={onSettingsOpenChange}
				user={draftUser}
				workspace={
					workspaces.find((workspace) => workspace._id === activeWorkspaceId) ??
					null
				}
				onUserChange={setDraftUser}
				initialPage={settingsPage}
				onPageChange={(page) => onSettingsOpenChange(true, page)}
			/>
			<TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
		</>
	);
}
