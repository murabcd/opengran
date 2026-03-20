"use client";

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
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { useTheme } from "@workspace/ui/components/theme-provider";
import {
	ChevronsUpDown,
	Command,
	Home,
	LogOut,
	type LucideIcon,
	MessageSquare,
	Moon,
	Plus,
	Search,
	Settings,
	Share2,
	Sun,
	Trash2,
	Users,
} from "lucide-react";
import * as React from "react";
import { SearchCommand } from "@/components/search/search-command";
import { SettingsDialog } from "@/components/settings/settings-dialog";
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
		icon: Share2,
	},
	{
		title: "Chat",
		action: "view",
		view: "chat",
		icon: MessageSquare,
	},
];

const workspaces = [
	{ name: "OpenMeet", plan: "Meeting notes", logo: Command },
	{ name: "Townhall Ops", plan: "Team Workspace", logo: Home },
	{ name: "Community Lab", plan: "Shared Notes", logo: Users },
];

const currentUser = {
	name: "Murad",
	email: "owner@openmeet.app",
	avatar: "",
};

export function AppSidebar({
	currentView,
	onViewChange,
	desktopSafeTop = false,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	currentView: "home" | "chat" | "shared" | "quick-note";
	onViewChange: (view: "home" | "chat" | "shared" | "quick-note") => void;
	desktopSafeTop?: boolean;
}) {
	const [activeWorkspace, setActiveWorkspace] = React.useState(workspaces[0]);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [searchOpen, setSearchOpen] = React.useState(false);
	const [trashOpen, setTrashOpen] = React.useState(false);
	const [user, setUser] = React.useState(currentUser);
	const navItems = React.useMemo(
		() =>
			navigation.map((item) => ({
				...item,
				isActive: item.action === "view" && item.view === currentView,
			})),
		[currentView],
	);
	const searchItems = React.useMemo<SearchCommandItem[]>(() => [], []);

	return (
		<>
			<Sidebar {...props}>
				<SidebarHeader className={desktopSafeTop ? "pt-8" : undefined}>
					<WorkspaceSwitcher
						activeWorkspace={activeWorkspace}
						onSelect={setActiveWorkspace}
					/>
					<NavMain
						className="px-0"
						items={navItems}
						onViewChange={onViewChange}
						onSearchOpen={() => setSearchOpen(true)}
					/>
				</SidebarHeader>
				<SidebarContent>
					<NavProjects />
				</SidebarContent>
				<SidebarFooter>
					<NavTrash open={trashOpen} onOpenChange={setTrashOpen} />
					<NavUser user={user} onSettingsOpen={() => setSettingsOpen(true)} />
				</SidebarFooter>
			</Sidebar>
			<SearchCommand
				open={searchOpen}
				onOpenChange={setSearchOpen}
				items={searchItems}
				onSelectItem={(itemId) => {
					onViewChange("home");
					queueMicrotask(() => {
						window.history.replaceState(null, "", `/home#${itemId}`);
					});
				}}
			/>
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				user={user}
				onUserChange={setUser}
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
								className="flex w-full items-center gap-2"
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

function NavProjects() {
	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarGroupLabel>Notes</SidebarGroupLabel>
			<SidebarMenu />
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
}: {
	user: {
		name: string;
		email: string;
		avatar: string;
	};
	onSettingsOpen: () => void;
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
							<Avatar className="h-8 w-8 rounded-lg">
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
						<DropdownMenuItem className="h-8 gap-2 px-2">
							<LogOut />
							Log out
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

	return (
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

			<div className="flex min-h-0 flex-1 items-center justify-center p-6">
				<Empty className="w-full gap-3 border-0 p-0">
					<EmptyHeader className="gap-1">
						<EmptyMedia variant="icon" className="text-muted-foreground">
							<Trash2 />
						</EmptyMedia>
						<EmptyTitle>No results</EmptyTitle>
						<EmptyDescription className="text-xs">
							Deleted notes will appear here.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>

			<div className="border-t px-3 py-2">
				<div className="text-xs text-muted-foreground">
					Notes older than 30 days will be automatically deleted.
				</div>
			</div>
		</div>
	);
}
