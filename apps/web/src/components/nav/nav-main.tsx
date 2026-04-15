import { Kbd } from "@workspace/ui/components/kbd";
import {
	SidebarGroup,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { SidebarCollapsibleGroup } from "@/components/nav/sidebar-collapsible-group";

type NavItem = {
	title: string;
	icon: LucideIcon;
	action: "search" | "view" | "inbox" | "disabled";
	view?: "home" | "chat" | "shared";
	isActive?: boolean;
	badge?: number;
};

export function NavMain({
	className,
	items,
	onViewChange,
	onSearchOpen,
	onSearchIntent,
	onInboxToggle,
}: {
	className?: string;
	items: NavItem[];
	onViewChange: (view: "home" | "chat" | "shared" | "note") => void;
	onSearchOpen: () => void;
	onSearchIntent?: () => void;
	onInboxToggle: () => void;
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
								onMouseEnter={onSearchIntent}
								onFocus={onSearchIntent}
								onClick={() => {
									if (searchItem.action === "search") {
										onSearchOpen();
										return;
									}

									if (searchItem.action === "inbox") {
										onInboxToggle();
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
			<SidebarCollapsibleGroup
				title="Platform"
				className="p-0"
				labelClassName="mt-6"
			>
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
										if (item.action === "inbox") {
											onInboxToggle();
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
								</button>
							</SidebarMenuButton>
							{item.badge ? (
								<SidebarMenuBadge className="top-1 rounded-full bg-destructive/15 text-destructive peer-hover/menu-button:text-destructive peer-data-active/menu-button:text-destructive dark:text-red-500">
									{formatBadgeCount(item.badge)}
								</SidebarMenuBadge>
							) : null}
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarCollapsibleGroup>
		</SidebarGroup>
	);
}

function formatBadgeCount(value: number) {
	return value > 99 ? "99+" : String(value);
}
