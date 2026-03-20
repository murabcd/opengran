"use client";

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
	Users,
} from "lucide-react";
import * as React from "react";
import { SearchCommand } from "@/components/search/search-command";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
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
} from "@/components/ui/sidebar";
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
		title: "Shared with me",
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
	{ name: "OpenMeet", plan: "Starter", logo: Command },
	{ name: "Townhall Ops", plan: "Growth", logo: Home },
	{ name: "Community Lab", plan: "Trial", logo: Users },
];

const currentUser = {
	name: "Murad",
	email: "owner@openmeet.app",
	avatar: "",
};

export function AppSidebar({
	currentView,
	onViewChange,
	...props
}: React.ComponentProps<typeof Sidebar> & {
	currentView: "home" | "chat" | "shared";
	onViewChange: (view: "home" | "chat" | "shared") => void;
}) {
	const [activeWorkspace, setActiveWorkspace] = React.useState(workspaces[0]);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [searchOpen, setSearchOpen] = React.useState(false);
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
			<Sidebar collapsible="icon" {...props}>
				<SidebarHeader>
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
	onViewChange: (view: "home" | "chat" | "shared") => void;
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

	return (
		<SidebarGroup className={className}>
			<SidebarGroupLabel>Platform</SidebarGroupLabel>
			<SidebarMenu>
				{items.map((item) => (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton
							asChild
							tooltip={item.title}
							isActive={item.isActive}
						>
							<button
								type="button"
								onClick={() => {
									if (item.action === "search") {
										onSearchOpen();
										return;
									}

									if (item.action !== "view" || !item.view) {
										return;
									}
									onViewChange(item.view);
								}}
								className="flex w-full items-center gap-2"
							>
								{item.icon && <item.icon />}
								<span>{item.title}</span>
								{item.action === "search" ? (
									<Kbd className="ml-auto font-mono text-[10px]">
										<span className="text-xs">⌘</span>K
									</Kbd>
								) : null}
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
