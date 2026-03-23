"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Input } from "@workspace/ui/components/input";
import { Kbd } from "@workspace/ui/components/kbd";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { useTheme } from "@workspace/ui/components/theme-provider";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronsUpDown,
	FileText,
	Home,
	LayoutTemplate,
	LoaderCircle,
	LogOut,
	type LucideIcon,
	MessageCircle,
	Moon,
	MoreHorizontal,
	Plus,
	Search,
	Settings,
	Sun,
	Trash2,
	Undo2,
	UsersRound,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { NoteActionsMenu } from "@/components/note/note-actions-menu";
import { SearchCommand } from "@/components/search/search-command";
import {
	SettingsDialog,
	type SettingsPage,
} from "@/components/settings/settings-dialog";
import { TemplatesDialog } from "@/components/templates/templates-dialog";
import { WorkspaceComposer } from "@/components/workspaces/workspace-composer";
import { getAvatarSrc } from "@/lib/avatar";
import { getChatId } from "@/lib/chat";
import { getWorkspaceRoleOption } from "@/lib/workspaces";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { SearchCommandItem } from "./search/search-command";

type NavItem = {
	title: string;
	icon: LucideIcon;
	action: "search" | "view" | "disabled";
	view?: "home" | "chat" | "shared";
	isActive?: boolean;
};

const navigation: Array<Omit<NavItem, "isActive">> = [
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
];

const MAX_VISIBLE_NOTES = 5;
const SIDEBAR_NOTE_SKELETON_IDS = [
	"sidebar-note-skeleton-1",
	"sidebar-note-skeleton-2",
	"sidebar-note-skeleton-3",
	"sidebar-note-skeleton-4",
] as const;

const TRASH_NOTE_SKELETON_IDS = [
	"trash-note-skeleton-1",
	"trash-note-skeleton-2",
	"trash-note-skeleton-3",
	"trash-note-skeleton-4",
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
	onNoteTrashed,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	workspaces: Array<Doc<"workspaces">>;
	activeWorkspaceId: Id<"workspaces"> | null;
	currentView: "home" | "chat" | "shared" | "note";
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	notes: Array<Doc<"notes">> | undefined;
	onWorkspaceSelect: (workspaceId: Id<"workspaces">) => void;
	onWorkspaceCreate: (input: { name: string }) => Promise<Doc<"workspaces">>;
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
					<NavProjects
						notes={notes}
						currentNoteId={currentView === "note" ? currentNoteId : null}
						currentNoteTitle={currentNoteTitle}
						onNoteSelect={onNoteSelect}
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
				onUserChange={setDraftUser}
				initialPage={settingsPage}
				onPageChange={(page) => onSettingsOpenChange(true, page)}
			/>
			<TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
		</>
	);
}

function NavMain({
	className,
	items,
	onViewChange,
	onSearchOpen,
}: {
	className?: string;
	items: NavItem[];
	onViewChange: (view: "home" | "chat" | "shared" | "note") => void;
	onSearchOpen: () => void;
}) {
	React.useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				onSearchOpen();
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, [onSearchOpen]);

	const searchItem = items.find((item) => item.action === "search");
	const viewItems = items.filter((item) => item.action !== "search");

	return (
		<SidebarGroup className={className}>
			<SidebarMenu>
				{searchItem ? (
					<SidebarMenuItem key={searchItem.title}>
						<SidebarMenuButton
							asChild
							tooltip={searchItem.title}
							isActive={searchItem.isActive}
						>
							<button
								type="button"
								onClick={() => {
									if (searchItem.action === "search") {
										onSearchOpen();
										return;
									}

									if (searchItem.action !== "view" || !searchItem.view) {
										return;
									}
									onViewChange(searchItem.view);
								}}
								className="flex w-full cursor-text items-center gap-2"
							>
								{searchItem.icon && <searchItem.icon />}
								<span>{searchItem.title}</span>
								{searchItem.action === "search" ? (
									<Kbd className="ml-auto font-mono text-[10px]">
										<span className="text-xs">⌘</span>K
									</Kbd>
								) : null}
							</button>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : null}
			</SidebarMenu>
			<SidebarGroupLabel className="mt-6">Platform</SidebarGroupLabel>
			<SidebarMenu>
				{viewItems.map((item) => (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton
							asChild
							tooltip={item.title}
							isActive={item.isActive}
						>
							<button
								type="button"
								onClick={() => {
									if (item.action !== "view" || !item.view) {
										return;
									}
									onViewChange(item.view);
								}}
								className="flex w-full items-center gap-2"
							>
								{item.icon && <item.icon />}
								<span>{item.title}</span>
							</button>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}

function NavProjects({
	notes,
	currentNoteId,
	currentNoteTitle,
	onNoteSelect,
	onNoteTrashed,
}: {
	notes: Array<Doc<"notes">> | undefined;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	const [showAllNotes, setShowAllNotes] = React.useState(false);
	const isNotesPending = notes === undefined;
	const hasMoreNotes = (notes?.length ?? 0) > MAX_VISIBLE_NOTES;
	const visibleNotes = showAllNotes
		? (notes ?? [])
		: (notes ?? []).slice(0, MAX_VISIBLE_NOTES);

	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarGroupLabel>Notes</SidebarGroupLabel>
			{isNotesPending ? <NavProjectsSkeleton /> : null}
			{notes && notes.length === 0 ? (
				<div className="px-2 text-xs text-muted-foreground/50">
					No notes yet
				</div>
			) : null}
			<SidebarGroupContent className={isNotesPending ? "hidden" : undefined}>
				<SidebarMenu>
					{visibleNotes.map((note) => {
						const isActive = note._id === currentNoteId;
						const title =
							isActive && currentNoteTitle?.trim()
								? currentNoteTitle
								: note.title || "New note";

						return (
							<SidebarMenuItem key={note._id}>
								<SidebarMenuButton
									isActive={isActive}
									onClick={() => onNoteSelect(note._id)}
									tooltip={title}
								>
									<FileText />
									<span>{title}</span>
								</SidebarMenuButton>
								<NoteActionsMenu
									noteId={note._id}
									onMoveToTrash={onNoteTrashed}
									align="start"
									side="right"
								>
									<SidebarMenuAction
										showOnHover
										className="cursor-pointer"
										aria-label={`Open actions for ${title}`}
									>
										<MoreHorizontal />
									</SidebarMenuAction>
								</NoteActionsMenu>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
				{hasMoreNotes ? (
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								className="text-sidebar-foreground/70"
								onClick={() => setShowAllNotes((prev) => !prev)}
							>
								<MoreHorizontal />
								<span>{showAllNotes ? "Show less" : "Show more"}</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				) : null}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}

function NavProjectsSkeleton() {
	return (
		<div className="px-2">
			<div className="space-y-2">
				{SIDEBAR_NOTE_SKELETON_IDS.map((id) => (
					<div key={id} className="flex items-center gap-2 rounded-md py-1">
						<Skeleton className="size-4 rounded-sm" />
						<Skeleton className="h-4 flex-1" />
					</div>
				))}
			</div>
		</div>
	);
}

function WorkspaceSwitcher({
	workspaces,
	activeWorkspaceId,
	onSelect,
	onCreateWorkspace,
}: {
	workspaces: Array<Doc<"workspaces">>;
	activeWorkspaceId: Id<"workspaces"> | null;
	onSelect: (workspaceId: Id<"workspaces">) => void;
	onCreateWorkspace: (input: { name: string }) => Promise<Doc<"workspaces">>;
}) {
	const [createOpen, setCreateOpen] = React.useState(false);
	const [name, setName] = React.useState("");
	const [createError, setCreateError] = React.useState<string | null>(null);
	const [isCreatingWorkspace, startWorkspaceCreation] = React.useTransition();
	const activeWorkspace =
		workspaces.find((workspace) => workspace._id === activeWorkspaceId) ??
		workspaces[0];

	React.useEffect(() => {
		if (createOpen) {
			return;
		}

		setName("");
		setCreateError(null);
	}, [createOpen]);

	if (!activeWorkspace) {
		return null;
	}

	const activeWorkspaceMeta = getWorkspaceRoleOption(activeWorkspace.role);
	const activeWorkspaceAvatarSrc = getAvatarSrc({
		name: activeWorkspace.name,
	});
	const getWorkspaceInitials = (name: string) =>
		name
			.split(" ")
			.map((part) => part[0])
			.join("")
			.slice(0, 2)
			.toUpperCase();
	const handleCreateWorkspace = () => {
		startWorkspaceCreation(async () => {
			try {
				setCreateError(null);
				const workspace = await onCreateWorkspace({
					name,
				});
				onSelect(workspace._id);
				setCreateOpen(false);
			} catch (error) {
				setCreateError(
					error instanceof Error
						? error.message
						: "Failed to create workspace.",
				);
			}
		});
	};

	return (
		<>
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							>
								<Avatar className="size-8 rounded-lg">
									<AvatarImage
										src={activeWorkspaceAvatarSrc}
										alt={activeWorkspace.name}
									/>
									<AvatarFallback className="rounded-lg">
										{getWorkspaceInitials(activeWorkspace.name)}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">
										{activeWorkspace.name}
									</span>
									<span className="truncate text-xs">
										{activeWorkspaceMeta.summary}
									</span>
								</div>
								<ChevronsUpDown className="ml-auto" />
							</SidebarMenuButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
							side="bottom"
							align="start"
							sideOffset={4}
						>
							{workspaces.map((workspace) => {
								const workspaceAvatarSrc = getAvatarSrc({
									name: workspace.name,
								});

								return (
									<DropdownMenuItem
										key={workspace._id}
										onClick={() => onSelect(workspace._id)}
										className="h-8 gap-2 px-2"
									>
										<Avatar className="size-6 rounded-md">
											<AvatarImage
												src={workspaceAvatarSrc}
												alt={workspace.name}
											/>
											<AvatarFallback className="rounded-md text-[10px]">
												{getWorkspaceInitials(workspace.name)}
											</AvatarFallback>
										</Avatar>
										{workspace.name}
									</DropdownMenuItem>
								);
							})}
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="h-8 gap-2 px-2"
								onSelect={(event) => {
									event.preventDefault();
									setCreateOpen(true);
								}}
							>
								<div className="flex size-6 items-center justify-center rounded-md bg-transparent">
									<Plus className="size-4" />
								</div>
								<div className="font-medium">Add workspace</div>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create a workspace</DialogTitle>
						<DialogDescription>
							Add another workspace to keep your notes and context organized.
						</DialogDescription>
					</DialogHeader>
					<WorkspaceComposer
						name={name}
						onNameChange={setName}
						error={createError}
						nameInputId="workspace-dialog-name"
					/>
					<div className="flex items-center justify-end gap-2">
						<Button variant="ghost" onClick={() => setCreateOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleCreateWorkspace}
							disabled={isCreatingWorkspace || name.trim().length < 2}
						>
							{isCreatingWorkspace ? (
								<LoaderCircle
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : null}
							Create workspace
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

function NavUser({
	user,
	onTemplatesOpen,
	onSettingsOpen,
	onSignOut,
	signingOut,
}: {
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	onTemplatesOpen: () => void;
	onSettingsOpen: () => void;
	onSignOut: () => void;
	signingOut: boolean;
}) {
	const { isMobile } = useSidebar();
	const { theme, setTheme } = useTheme();
	const initials = user.name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
	const avatarSrc = getAvatarSrc(user);
	const isDarkTheme =
		theme === "dark" ||
		(theme === "system" && document.documentElement.classList.contains("dark"));
	const nextTheme = isDarkTheme ? "light" : "dark";
	const ThemeIcon = isDarkTheme ? Sun : Moon;
	const themeLabel = isDarkTheme ? "Light theme" : "Dark theme";

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar className="size-8 rounded-lg">
								<AvatarImage src={avatarSrc} alt={user.name} />
								<AvatarFallback className="rounded-lg">
									{initials}
								</AvatarFallback>
							</Avatar>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">{user.name}</span>
								<span className="truncate text-xs">{user.email}</span>
							</div>
							<ChevronsUpDown className="ml-auto size-4" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "top"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuItem
								onClick={() => setTheme(nextTheme)}
								className="h-8 gap-2 px-2"
							>
								<ThemeIcon />
								{themeLabel}
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuItem
							className="h-8 gap-2 px-2"
							onClick={onTemplatesOpen}
						>
							<LayoutTemplate />
							Manage templates
						</DropdownMenuItem>
						<DropdownMenuItem
							className="h-8 gap-2 px-2"
							onClick={onSettingsOpen}
						>
							<Settings />
							Settings
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="h-8 gap-2 px-2"
							onClick={onSignOut}
							disabled={signingOut}
						>
							<LogOut />
							{signingOut ? "Signing out..." : "Log out"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

function NavTrash({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { isMobile } = useSidebar();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<Popover open={open} onOpenChange={onOpenChange}>
					<PopoverTrigger asChild>
						<SidebarMenuButton isActive={open}>
							<Trash2 />
							<span>Trash</span>
						</SidebarMenuButton>
					</PopoverTrigger>
					<PopoverContent
						className="h-[420px] max-h-[70vh] w-[min(420px,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
						side={isMobile ? "bottom" : "right"}
						align="end"
						alignOffset={-24}
					>
						<TrashPopoverContent />
					</PopoverContent>
				</Popover>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

function TrashPopoverContent() {
	const [search, setSearch] = React.useState("");
	const [deleteNoteId, setDeleteNoteId] = React.useState<Id<"notes"> | null>(
		null,
	);
	const [deleteChatId, setDeleteChatId] = React.useState<string | null>(null);
	const archivedNotes = useQuery(api.notes.listArchived, {});
	const archivedChats = useQuery(api.chats.listArchived, {});
	const restore = useMutation(api.notes.restore).withOptimisticUpdate(
		(localStore, args) => {
			const archived = localStore.getQuery(api.notes.listArchived, {});
			const note = archived?.find((item) => item._id === args.id) ?? null;

			if (archived !== undefined) {
				localStore.setQuery(
					api.notes.listArchived,
					{},
					archived.filter((item) => item._id !== args.id),
				);
			}

			if (note) {
				const active = localStore.getQuery(api.notes.list, {}) ?? [];
				localStore.setQuery(api.notes.list, {}, [
					{
						...note,
						isArchived: false,
						archivedAt: undefined,
					},
					...active.filter((item) => item._id !== args.id),
				]);
			}
		},
	);
	const remove = useMutation(api.notes.remove).withOptimisticUpdate(
		(localStore, args) => {
			const archived = localStore.getQuery(api.notes.listArchived, {});
			if (archived !== undefined) {
				localStore.setQuery(
					api.notes.listArchived,
					{},
					archived.filter((item) => item._id !== args.id),
				);
			}
		},
	);
	const restoreChat = useMutation(api.chats.restore).withOptimisticUpdate(
		(localStore, args) => {
			const archived = localStore.getQuery(api.chats.listArchived, {});
			const chat =
				archived?.find((item) => getChatId(item) === args.chatId) ?? null;

			if (archived !== undefined) {
				localStore.setQuery(
					api.chats.listArchived,
					{},
					archived.filter((item) => getChatId(item) !== args.chatId),
				);
			}

			if (chat) {
				const active = localStore.getQuery(api.chats.list, {}) ?? [];
				localStore.setQuery(api.chats.list, {}, [
					{
						...chat,
						isArchived: false,
						archivedAt: undefined,
					},
					...active.filter((item) => getChatId(item) !== args.chatId),
				]);
			}
		},
	);
	const removeChat = useMutation(api.chats.remove).withOptimisticUpdate(
		(localStore, args) => {
			const archived = localStore.getQuery(api.chats.listArchived, {});
			if (archived !== undefined) {
				localStore.setQuery(
					api.chats.listArchived,
					{},
					archived.filter((item) => getChatId(item) !== args.chatId),
				);
			}
		},
	);
	const filteredNotes = React.useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!archivedNotes) {
			return [];
		}

		if (!query) {
			return archivedNotes;
		}

		return archivedNotes.filter((note) => {
			const haystack = [
				note.title,
				note.searchableText,
				note.authorName ?? "",
			].join(" ");

			return haystack.toLowerCase().includes(query);
		});
	}, [archivedNotes, search]);
	const filteredChats = React.useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!archivedChats) {
			return [];
		}

		if (!query) {
			return archivedChats;
		}

		return archivedChats.filter((chat) =>
			[chat.title, chat.preview, chat.authorName ?? "", chat.model ?? ""]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [archivedChats, search]);
	const hasArchivedNotes = (archivedNotes?.length ?? 0) > 0;
	const hasArchivedChats = (archivedChats?.length ?? 0) > 0;
	const hasArchivedItems = hasArchivedNotes || hasArchivedChats;

	const handleRestore = React.useCallback(
		(noteId: Id<"notes">) => {
			void restore({ id: noteId })
				.then(() => {
					toast.success("Note restored");
				})
				.catch((error) => {
					console.error("Failed to restore note", error);
					toast.error("Failed to restore note");
				});
		},
		[restore],
	);
	const handleRestoreChat = React.useCallback(
		(chatId: string) => {
			void restoreChat({ chatId })
				.then(() => {
					toast.success("Chat restored");
				})
				.catch((error) => {
					console.error("Failed to restore chat", error);
					toast.error("Failed to restore chat");
				});
		},
		[restoreChat],
	);

	const handleDelete = React.useCallback(() => {
		if (!deleteNoteId) {
			return;
		}

		void remove({ id: deleteNoteId })
			.then(() => {
				setDeleteNoteId(null);
				toast.success("Note deleted permanently");
			})
			.catch((error) => {
				console.error("Failed to delete note", error);
				toast.error("Failed to delete note");
			});
	}, [deleteNoteId, remove]);
	const handleDeleteChat = React.useCallback(() => {
		if (!deleteChatId) {
			return;
		}

		void removeChat({ chatId: deleteChatId })
			.then(() => {
				setDeleteChatId(null);
				toast.success("Chat deleted permanently");
			})
			.catch((error) => {
				console.error("Failed to delete chat", error);
				toast.error("Failed to delete chat");
			});
	}, [deleteChatId, removeChat]);

	return (
		<>
			<div className="flex h-full flex-col text-sm">
				<TrashSearchInput
					search={search}
					onSearchChange={(event) => setSearch(event.target.value)}
				/>

				<div className="min-h-0 flex-1 overflow-y-auto p-2 pt-1">
					{archivedNotes === undefined || archivedChats === undefined ? (
						<TrashPopoverSkeleton />
					) : filteredNotes.length > 0 || filteredChats.length > 0 ? (
						<TrashResults
							notes={filteredNotes}
							chats={filteredChats}
							onRestoreNote={handleRestore}
							onDeleteNote={setDeleteNoteId}
							onRestoreChat={handleRestoreChat}
							onDeleteChat={setDeleteChatId}
						/>
					) : (
						<TrashEmptyState hasArchivedItems={hasArchivedItems} />
					)}
				</div>

				<div className="border-t px-3 py-2">
					<div className="text-xs text-muted-foreground">
						Items older than 30 days will be automatically deleted.
					</div>
				</div>
			</div>
			<DeleteConfirmDialog
				open={deleteNoteId !== null}
				description="This action cannot be undone. This will permanently delete your note from our servers."
				onOpenChange={(open) => {
					if (!open) {
						setDeleteNoteId(null);
					}
				}}
				onConfirm={handleDelete}
			/>
			<DeleteConfirmDialog
				open={deleteChatId !== null}
				description="This action cannot be undone. This will permanently delete your chat from our servers."
				onOpenChange={(open) => {
					if (!open) {
						setDeleteChatId(null);
					}
				}}
				onConfirm={handleDeleteChat}
			/>
		</>
	);
}

function TrashSearchInput({
	search,
	onSearchChange,
}: {
	search: string;
	onSearchChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
	return (
		<div className="p-2 pb-1">
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={onSearchChange}
					className="h-8 bg-secondary pr-2 pl-8 focus-visible:ring-transparent"
					placeholder="Search notes..."
				/>
			</div>
		</div>
	);
}

function TrashResults({
	notes,
	chats,
	onRestoreNote,
	onDeleteNote,
	onRestoreChat,
	onDeleteChat,
}: {
	notes: Array<Doc<"notes">>;
	chats: Array<Doc<"chats">>;
	onRestoreNote: (noteId: Id<"notes">) => void;
	onDeleteNote: (noteId: Id<"notes">) => void;
	onRestoreChat: (chatId: string) => void;
	onDeleteChat: (chatId: string) => void;
}) {
	return (
		<div className="space-y-1">
			{notes.length > 0 ? (
				<TrashSection title="Notes">
					{notes.map((note) => (
						<TrashItemRow
							key={note._id}
							title={note.title || "New note"}
							icon={FileText}
							onRestore={() => onRestoreNote(note._id)}
							onDelete={() => onDeleteNote(note._id)}
						/>
					))}
				</TrashSection>
			) : null}
			{chats.length > 0 ? (
				<TrashSection title="Chats">
					{chats.map((chat) => (
						<TrashItemRow
							key={chat._id}
							title={chat.title || "New chat"}
							icon={MessageCircle}
							onRestore={() => onRestoreChat(getChatId(chat))}
							onDelete={() => onDeleteChat(getChatId(chat))}
						/>
					))}
				</TrashSection>
			) : null}
		</div>
	);
}

function TrashSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<div className="px-1.5 pt-1 text-xs font-medium text-muted-foreground">
				{title}
			</div>
			{children}
		</div>
	);
}

function TrashItemRow({
	title,
	icon: Icon,
	onRestore,
	onDelete,
}: {
	title: string;
	icon: LucideIcon;
	onRestore: () => void;
	onDelete: () => void;
}) {
	return (
		<div className="group grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
			<div className="flex min-w-0 items-center gap-1.5">
				<div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
					<Icon className="size-4" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-sm">{title}</div>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				<TrashItemAction
					label={`Restore ${title}`}
					onClick={onRestore}
					tooltip="Restore"
				>
					<Undo2 className="size-4" />
				</TrashItemAction>
				<TrashItemAction
					label={`Delete ${title}`}
					onClick={onDelete}
					tooltip="Delete"
					destructive
				>
					<Trash2 className="size-4" />
				</TrashItemAction>
			</div>
		</div>
	);
}

function TrashItemAction({
	label,
	onClick,
	tooltip,
	destructive = false,
	children,
}: {
	label: string;
	onClick: () => void;
	tooltip: string;
	destructive?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={
						destructive
							? "flex size-5 cursor-pointer items-center justify-center rounded-md p-0 text-destructive outline-hidden transition-transform focus-visible:ring-2 hover:bg-sidebar-accent hover:text-destructive [&>svg]:size-4 [&>svg]:shrink-0 dark:text-red-500"
							: "flex size-5 cursor-pointer items-center justify-center rounded-md p-0 text-sidebar-foreground outline-hidden transition-transform focus-visible:ring-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0"
					}
					onClick={onClick}
					aria-label={label}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}

function TrashEmptyState({ hasArchivedItems }: { hasArchivedItems: boolean }) {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<Empty className="w-full gap-3 border-0 p-0">
				<EmptyHeader className="gap-1">
					<EmptyMedia variant="icon" className="text-muted-foreground">
						<Trash2 />
					</EmptyMedia>
					<EmptyTitle>No results</EmptyTitle>
					<EmptyDescription className="text-xs">
						{hasArchivedItems
							? "Try a different search."
							: "Deleted notes and chats will appear here."}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}

function DeleteConfirmDialog({
	open,
	description,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	description: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
						onClick={onConfirm}
					>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function TrashPopoverSkeleton() {
	return (
		<div className="space-y-1">
			{TRASH_NOTE_SKELETON_IDS.map((id) => (
				<div
					key={id}
					className="grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-1.5"
				>
					<div className="flex min-w-0 items-center gap-1.5">
						<div className="flex size-6 shrink-0 items-center justify-center">
							<Skeleton className="size-4 rounded-sm" />
						</div>
						<Skeleton className="h-4 w-32 max-w-full" />
					</div>
					<div className="flex shrink-0 items-center gap-1">
						<Skeleton className="size-5 rounded-md" />
						<Skeleton className="size-5 rounded-md" />
					</div>
				</div>
			))}
		</div>
	);
}
