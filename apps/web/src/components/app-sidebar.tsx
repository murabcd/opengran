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
import { useTheme } from "@workspace/ui/components/theme-provider";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useMutation, useQuery } from "convex/react";
import {
	ChevronsUpDown,
	Command,
	FileText,
	Home,
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
	Users,
	UsersRound,
} from "lucide-react";
import * as React from "react";
import { QuickNoteActionsMenu } from "@/components/quick-note/quick-note-actions-menu";
import { SearchCommand } from "@/components/search/search-command";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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

const workspaces = [
	{ name: "OpenGran", plan: "Meeting notes", logo: Command },
	{ name: "Townhall Ops", plan: "Team Workspace", logo: Home },
	{ name: "Community Lab", plan: "Shared Notes", logo: Users },
];

const MAX_VISIBLE_NOTES = 5;

export function AppSidebar({
	currentView,
	user,
	onViewChange,
	settingsOpen,
	onSettingsOpenChange,
	onSignOut,
	signingOut = false,
	desktopSafeTop = false,
	currentQuickNoteId,
	currentQuickNoteTitle,
	onQuickNoteSelect,
	onQuickNoteTrashed,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	currentView: "home" | "chat" | "shared" | "quick-note";
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	onViewChange: (view: "home" | "chat" | "shared" | "quick-note") => void;
	settingsOpen: boolean;
	onSettingsOpenChange: (open: boolean) => void;
	onSignOut: () => void;
	signingOut?: boolean;
	desktopSafeTop?: boolean;
	currentQuickNoteId: Id<"quickNotes"> | null;
	currentQuickNoteTitle?: string;
	onQuickNoteSelect: (noteId: Id<"quickNotes">) => void;
	onQuickNoteTrashed?: (noteId: Id<"quickNotes">) => void;
}) {
	const [activeWorkspace, setActiveWorkspace] = React.useState(workspaces[0]);
	const [searchOpen, setSearchOpen] = React.useState(false);
	const [trashOpen, setTrashOpen] = React.useState(false);
	const [draftUser, setDraftUser] = React.useState(user);
	const notes = useQuery(api.quickNotes.list, {});

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
					note._id === currentQuickNoteId && currentQuickNoteTitle?.trim()
						? currentQuickNoteTitle
						: note.title || "New note",
				icon: FileText,
			})),
		[notes, currentQuickNoteId, currentQuickNoteTitle],
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
							activeWorkspace={activeWorkspace}
							onSelect={setActiveWorkspace}
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
						currentNoteId={
							currentView === "quick-note" ? currentQuickNoteId : null
						}
						currentNoteTitle={currentQuickNoteTitle}
						onQuickNoteSelect={onQuickNoteSelect}
						onQuickNoteTrashed={onQuickNoteTrashed}
					/>
				</SidebarContent>
				<SidebarFooter>
					<NavTrash open={trashOpen} onOpenChange={setTrashOpen} />
					<NavUser
						user={draftUser}
						onSettingsOpen={() => onSettingsOpenChange(true)}
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
					onQuickNoteSelect(itemId as Id<"quickNotes">);
				}}
			/>
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={onSettingsOpenChange}
				user={draftUser}
				onUserChange={setDraftUser}
			/>
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
	onViewChange: (view: "home" | "chat" | "shared" | "quick-note") => void;
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
	currentNoteId,
	currentNoteTitle,
	onQuickNoteSelect,
	onQuickNoteTrashed,
}: {
	currentNoteId: Id<"quickNotes"> | null;
	currentNoteTitle?: string;
	onQuickNoteSelect: (noteId: Id<"quickNotes">) => void;
	onQuickNoteTrashed?: (noteId: Id<"quickNotes">) => void;
}) {
	const notes = useQuery(api.quickNotes.list, {});
	const [showAllNotes, setShowAllNotes] = React.useState(false);
	const hasMoreNotes = (notes?.length ?? 0) > MAX_VISIBLE_NOTES;
	const visibleNotes = showAllNotes
		? (notes ?? [])
		: (notes ?? []).slice(0, MAX_VISIBLE_NOTES);

	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarGroupLabel>Notes</SidebarGroupLabel>
			{notes && notes.length === 0 ? (
				<div className="px-2 text-xs text-muted-foreground/50">
					No notes yet
				</div>
			) : null}
			<SidebarGroupContent>
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
									onClick={() => onQuickNoteSelect(note._id)}
									tooltip={title}
								>
									<FileText />
									<span>{title}</span>
								</SidebarMenuButton>
								<QuickNoteActionsMenu
									noteId={note._id}
									onMoveToTrash={onQuickNoteTrashed}
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
								</QuickNoteActionsMenu>
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

function WorkspaceSwitcher({
	activeWorkspace,
	onSelect,
}: {
	activeWorkspace: (typeof workspaces)[number];
	onSelect: (workspace: (typeof workspaces)[number]) => void;
}) {
	if (!activeWorkspace) {
		return null;
	}

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							size="lg"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
								<activeWorkspace.logo className="size-4" />
							</div>
							<div className="grid flex-1 text-left text-sm leading-tight">
								<span className="truncate font-medium">
									{activeWorkspace.name}
								</span>
								<span className="truncate text-xs">{activeWorkspace.plan}</span>
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
						{workspaces.map((workspace) => (
							<DropdownMenuItem
								key={workspace.name}
								onClick={() => onSelect(workspace)}
								className="h-8 gap-2 px-2"
							>
								<div className="flex size-6 items-center justify-center rounded-md">
									<workspace.logo className="size-3.5 shrink-0" />
								</div>
								{workspace.name}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem className="h-8 gap-2 px-2">
							<div className="flex size-6 items-center justify-center rounded-md bg-transparent">
								<Plus className="size-4" />
							</div>
							<div className="font-medium">Add workspace</div>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

function NavUser({
	user,
	onSettingsOpen,
	onSignOut,
	signingOut,
}: {
	user: {
		name: string;
		email: string;
		avatar: string;
	};
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
								<AvatarImage src={user.avatar} alt={user.name} />
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
	const [deleteNoteId, setDeleteNoteId] =
		React.useState<Id<"quickNotes"> | null>(null);
	const archivedNotes = useQuery(api.quickNotes.listArchived, {});
	const restore = useMutation(api.quickNotes.restore).withOptimisticUpdate(
		(localStore, args) => {
			const archived = localStore.getQuery(api.quickNotes.listArchived, {});
			const note = archived?.find((item) => item._id === args.id) ?? null;

			if (archived !== undefined) {
				localStore.setQuery(
					api.quickNotes.listArchived,
					{},
					archived.filter((item) => item._id !== args.id),
				);
			}

			if (note) {
				const active = localStore.getQuery(api.quickNotes.list, {}) ?? [];
				localStore.setQuery(api.quickNotes.list, {}, [
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
	const remove = useMutation(api.quickNotes.remove).withOptimisticUpdate(
		(localStore, args) => {
			const archived = localStore.getQuery(api.quickNotes.listArchived, {});
			if (archived !== undefined) {
				localStore.setQuery(
					api.quickNotes.listArchived,
					{},
					archived.filter((item) => item._id !== args.id),
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
	const hasArchivedNotes = (archivedNotes?.length ?? 0) > 0;

	const handleRestore = React.useCallback(
		(noteId: Id<"quickNotes">) => {
			void restore({ id: noteId }).catch((error) => {
				console.error("Failed to restore quick note", error);
			});
		},
		[restore],
	);

	const handleDelete = React.useCallback(() => {
		if (!deleteNoteId) {
			return;
		}

		void remove({ id: deleteNoteId })
			.then(() => {
				setDeleteNoteId(null);
			})
			.catch((error) => {
				console.error("Failed to delete quick note", error);
			});
	}, [deleteNoteId, remove]);

	return (
		<>
			<div className="flex h-full flex-col text-sm">
				<div className="p-2 pb-1">
					<div className="relative">
						<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="h-8 bg-secondary pr-2 pl-8 focus-visible:ring-transparent"
							placeholder="Search notes..."
						/>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-2 pt-1">
					{hasArchivedNotes && filteredNotes.length > 0 ? (
						<div className="space-y-1">
							{filteredNotes.map((note) => (
								<div
									key={note._id}
									className="group grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 rounded-md px-1.5 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
								>
									<div className="flex min-w-0 items-center gap-1.5">
										<div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
											<FileText className="size-4" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="truncate text-sm">
												{note.title || "New note"}
											</div>
										</div>
									</div>
									<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="flex size-5 cursor-pointer items-center justify-center rounded-md p-0 text-sidebar-foreground outline-hidden transition-transform focus-visible:ring-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0"
													onClick={() => handleRestore(note._id)}
													aria-label={`Restore ${note.title || "New note"}`}
												>
													<Undo2 className="size-4" />
												</button>
											</TooltipTrigger>
											<TooltipContent>Restore</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<button
													type="button"
													className="flex size-5 cursor-pointer items-center justify-center rounded-md p-0 text-destructive outline-hidden transition-transform focus-visible:ring-2 hover:bg-sidebar-accent hover:text-destructive [&>svg]:size-4 [&>svg]:shrink-0 dark:text-red-500"
													onClick={() => setDeleteNoteId(note._id)}
													aria-label={`Delete ${note.title || "New note"}`}
												>
													<Trash2 className="size-4" />
												</button>
											</TooltipTrigger>
											<TooltipContent>Delete</TooltipContent>
										</Tooltip>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="flex h-full items-center justify-center p-6">
							<Empty className="w-full gap-3 border-0 p-0">
								<EmptyHeader className="gap-1">
									<EmptyMedia variant="icon" className="text-muted-foreground">
										<Trash2 />
									</EmptyMedia>
									<EmptyTitle>No results</EmptyTitle>
									<EmptyDescription className="text-xs">
										{hasArchivedNotes
											? "Try a different search."
											: "Deleted notes will appear here."}
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						</div>
					)}
				</div>

				<div className="border-t px-3 py-2">
					<div className="text-xs text-muted-foreground">
						Notes older than 30 days will be automatically deleted.
					</div>
				</div>
			</div>
			<AlertDialog
				open={deleteNoteId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeleteNoteId(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. This will permanently delete your
							account from our servers.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
							onClick={handleDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
