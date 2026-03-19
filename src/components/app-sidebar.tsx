"use client";

import {
	CalendarDays,
	ChevronsUpDown,
	Command,
	Folder,
	Forward,
	Home,
	LifeBuoy,
	LogOut,
	type LucideIcon,
	MessageSquare,
	Moon,
	MoreHorizontal,
	Plus,
	Settings,
	Share2,
	Sun,
	Trash2,
	Users,
} from "lucide-react";
import * as React from "react";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";

type NavItem = {
	title: string;
	view: "home" | "chat" | "shared";
	icon: LucideIcon;
	isActive?: boolean;
};

const navigation: Array<Omit<NavItem, "isActive">> = [
	{
		title: "Home",
		view: "home",
		icon: Home,
	},
	{
		title: "Shared with me",
		view: "shared",
		icon: Share2,
	},
	{
		title: "Chat",
		view: "chat",
		icon: MessageSquare,
	},
];

const quickLinks = [
	{ title: "Calendar", url: "#calendar", icon: CalendarDays },
	{ title: "Inbox", url: "#inbox", icon: MessageSquare },
	{ title: "Support", url: "#support", icon: LifeBuoy },
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
	currentView: "home" | "chat";
	onViewChange: (view: "home" | "chat") => void;
}) {
	const [activeWorkspace, setActiveWorkspace] = React.useState(workspaces[0]);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [user, setUser] = React.useState(currentUser);
	const navItems = React.useMemo(
		() =>
			navigation.map((item) => ({
				...item,
				isActive: item.view === currentView,
			})),
		[currentView],
	);

	return (
		<>
			<Sidebar collapsible="icon" {...props}>
				<SidebarHeader>
					<WorkspaceSwitcher
						activeWorkspace={activeWorkspace}
						onSelect={setActiveWorkspace}
					/>
				</SidebarHeader>
				<SidebarContent>
					<NavMain items={navItems} onViewChange={onViewChange} />
					<NavProjects projects={quickLinks} />
				</SidebarContent>
				<SidebarFooter>
					<NavUser user={user} onSettingsOpen={() => setSettingsOpen(true)} />
				</SidebarFooter>
			</Sidebar>
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
	items,
	onViewChange,
}: {
	items: NavItem[];
	onViewChange: (view: "home" | "chat") => void;
}) {
	return (
		<SidebarGroup>
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
									if (item.view === "shared") {
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
	projects,
}: {
	projects: Array<{
		title: string;
		url: string;
		icon: LucideIcon;
	}>;
}) {
	const { isMobile } = useSidebar();

	return (
		<SidebarGroup className="group-data-[collapsible=icon]:hidden">
			<SidebarGroupLabel>Projects</SidebarGroupLabel>
			<SidebarMenu>
				{projects.map((item) => (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton asChild>
							<a href={item.url}>
								<item.icon />
								<span>{item.title}</span>
							</a>
						</SidebarMenuButton>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuAction showOnHover>
									<MoreHorizontal />
									<span className="sr-only">More</span>
								</SidebarMenuAction>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								className="w-48 rounded-lg"
								side={isMobile ? "bottom" : "right"}
								align={isMobile ? "end" : "start"}
							>
								<DropdownMenuItem>
									<Folder className="text-muted-foreground" />
									<span>View Project</span>
								</DropdownMenuItem>
								<DropdownMenuItem>
									<Forward className="text-muted-foreground" />
									<span>Share Project</span>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem>
									<Trash2 className="text-muted-foreground" />
									<span>Delete Project</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				))}
				<SidebarMenuItem>
					<SidebarMenuButton className="text-sidebar-foreground/70">
						<MoreHorizontal className="text-sidebar-foreground/70" />
						<span>More</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
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
	const { isMobile } = useSidebar();

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
						side={isMobile ? "bottom" : "right"}
						align="start"
						sideOffset={4}
					>
						<DropdownMenuLabel className="text-xs text-muted-foreground">
							Workspaces
						</DropdownMenuLabel>
						{workspaces.map((workspace, index) => (
							<DropdownMenuItem
								key={workspace.name}
								onClick={() => onSelect(workspace)}
								className="h-8 gap-2 px-2"
							>
								<div className="flex size-6 items-center justify-center rounded-md border">
									<workspace.logo className="size-3.5 shrink-0" />
								</div>
								{workspace.name}
								<DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuItem className="h-8 gap-2 px-2">
							<div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
								<Plus className="size-4" />
							</div>
							<div className="font-medium text-muted-foreground">
								Add workspace
							</div>
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
