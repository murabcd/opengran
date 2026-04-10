import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@workspace/ui/components/sidebar";
import type { LucideIcon } from "lucide-react";

export type ManageDialogNavigationItem = {
	id: string;
	icon: LucideIcon;
	label: string;
};

export function ManageDialogSidebarNav({
	activeItemId,
	items,
	onSelect,
}: {
	activeItemId: string | null;
	items: ManageDialogNavigationItem[];
	onSelect: (itemId: string) => void;
}) {
	return (
		<Sidebar collapsible="none" className="hidden md:flex">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{items.map((item) => {
								const Icon = item.icon;

								return (
									<SidebarMenuItem key={item.id}>
										<SidebarMenuButton
											asChild
											isActive={activeItemId === item.id}
										>
											<button type="button" onClick={() => onSelect(item.id)}>
												<Icon />
												<span>{item.label}</span>
											</button>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}

export function ManageDialogHeader({
	activeItemId,
	items,
	onSelect,
	title,
}: {
	activeItemId: string | null;
	items: ManageDialogNavigationItem[];
	onSelect: (itemId: string) => void;
	title: string;
}) {
	const activeItemLabel =
		items.find((item) => item.id === activeItemId)?.label ?? title;

	return (
		<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
			<div className="flex items-center gap-2 px-4">
				<Breadcrumb className="hidden md:block">
					<BreadcrumbList>
						<BreadcrumbItem className="hidden md:block">
							<BreadcrumbLink href="#">{title}</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden md:block" />
						<BreadcrumbItem>
							<BreadcrumbPage>{activeItemLabel}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<div className="flex gap-2 md:hidden">
					{items.map((item) => {
						const Icon = item.icon;

						return (
							<Button
								key={item.id}
								variant={activeItemId === item.id ? "secondary" : "ghost"}
								size="sm"
								onClick={() => onSelect(item.id)}
								className="whitespace-nowrap"
							>
								<Icon />
								{item.label}
							</Button>
						);
					})}
				</div>
			</div>
		</header>
	);
}
