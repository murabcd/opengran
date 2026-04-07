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
import { Kbd } from "@workspace/ui/components/kbd";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { useTheme } from "@workspace/ui/components/theme-provider";
import {
	ArrowDownToLine,
	ChevronsUpDown,
	LayoutTemplate,
	LogOut,
	Moon,
	Settings,
	Sun,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { getAvatarSrc } from "@/lib/avatar";
import { resolveLatestDesktopDownloadUrl } from "@/lib/desktop-release";

export function NavUser({
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
	const [preparingDesktopDownload, setPreparingDesktopDownload] =
		React.useState(false);
	const desktopDownloadInFlightRef = React.useRef(false);
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
	const isDesktopApp =
		typeof window !== "undefined" && Boolean(window.openGranDesktop);

	const handleDesktopDownload = React.useCallback(async () => {
		if (desktopDownloadInFlightRef.current) {
			return;
		}

		desktopDownloadInFlightRef.current = true;
		setPreparingDesktopDownload(true);

		try {
			const downloadUrl = await resolveLatestDesktopDownloadUrl();

			if (window.openGranDesktop?.openExternalUrl) {
				await window.openGranDesktop.openExternalUrl(downloadUrl);
				return;
			}

			window.location.assign(downloadUrl);
		} catch {
			toast.error("Failed to open the latest desktop download");
		} finally {
			desktopDownloadInFlightRef.current = false;
			setPreparingDesktopDownload(false);
		}
	}, []);

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
						{!isDesktopApp ? (
							<DropdownMenuItem
								className="h-8 gap-2 px-2"
								onSelect={() => void handleDesktopDownload()}
								disabled={preparingDesktopDownload}
							>
								<ArrowDownToLine />
								{preparingDesktopDownload
									? "Preparing download..."
									: "Download desktop app"}
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem
							className="h-8 gap-2 px-2"
							onClick={onSettingsOpen}
						>
							<Settings />
							Settings
							<Kbd className="ml-auto font-mono text-[10px]">
								<span className="text-xs">⌘</span>,
							</Kbd>
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
