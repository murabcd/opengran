"use client";

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Icons } from "@workspace/ui/components/icons";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import {
	SIDEBAR_WIDTH,
	SIDEBAR_WIDTH_ICON,
} from "@workspace/ui/components/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	Archive,
	Check,
	CheckCheck,
	Inbox,
	MoreHorizontal,
	SlidersHorizontal,
	Square,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import {
	DESKTOP_INBOX_PANEL_WIDTH,
	DESKTOP_MAIN_HEADER_CONTENT_CLASS,
} from "@/lib/desktop-chrome";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type InboxView = "all" | "unread" | "archived";

const INBOX_VIEW_OPTIONS: Array<{
	value: InboxView;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}> = [
	{ value: "all", label: "Unread & read", icon: Inbox },
	{ value: "unread", label: "Unread", icon: Square },
	{ value: "archived", label: "Archived", icon: Archive },
];

const getErrorMessage = (error: unknown, fallback: string) =>
	error instanceof Error && error.message.trim().length > 0
		? error.message.replace(/\.$/, "")
		: fallback;

export function InboxSheet({
	open,
	onOpenChange,
	sidebarState,
	isMobile,
	desktopSafeTop = false,
	onMarkItemsRead,
	onMarkAllRead,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sidebarState: "expanded" | "collapsed";
	isMobile: boolean;
	desktopSafeTop?: boolean;
	onMarkItemsRead?: (itemIds: string[]) => void;
	onMarkAllRead?: () => void;
}) {
	const sidebarOffset =
		sidebarState === "collapsed" ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH;
	const panelWidth = DESKTOP_INBOX_PANEL_WIDTH;
	const [view, setView] = React.useState<InboxView>("all");
	const [markAllReadRequestId, setMarkAllReadRequestId] = React.useState(0);
	const [archiveReadRequestId, setArchiveReadRequestId] = React.useState(0);
	const [clearArchivedRequestId, setClearArchivedRequestId] = React.useState(0);

	if (!isMobile) {
		return (
			<>
				{open ? (
					<button
						type="button"
						aria-label="Close inbox"
						className="fixed inset-y-0 right-0 z-20 hidden bg-transparent md:block"
						style={{
							left: `calc(${sidebarOffset} + ${panelWidth})`,
						}}
						onClick={() => onOpenChange(false)}
					/>
				) : null}
				<div
					aria-hidden={!open}
					data-app-region={desktopSafeTop && open ? "no-drag" : undefined}
					className="pointer-events-none fixed inset-y-0 z-30 hidden overflow-hidden md:block"
					style={{
						left: sidebarOffset,
						width: panelWidth,
					}}
				>
					<div
						data-app-region={desktopSafeTop && open ? "no-drag" : undefined}
						className={cn(
							"flex h-svh w-[16rem] flex-col border-r bg-background text-foreground transition-transform duration-200 ease-linear",
							open
								? "pointer-events-auto translate-x-0"
								: "pointer-events-none -translate-x-full",
						)}
					>
						<div className="px-2">
							<InboxPaneHeader
								isMobile={false}
								open={open}
								view={view}
								onViewChange={setView}
								onMarkAllRead={() => {
									setMarkAllReadRequestId((current) => current + 1);
									onMarkAllRead?.();
								}}
								onArchiveRead={() => {
									setArchiveReadRequestId((current) => current + 1);
								}}
								onClearArchived={() => {
									setClearArchivedRequestId((current) => current + 1);
								}}
							/>
						</div>
						<div className="min-h-0 flex-1">
							<InboxPanel
								view={view}
								markAllReadRequestId={markAllReadRequestId}
								archiveReadRequestId={archiveReadRequestId}
								clearArchivedRequestId={clearArchivedRequestId}
								onMarkItemsRead={onMarkItemsRead}
							/>
						</div>
					</div>
				</div>
			</>
		);
	}

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="left"
				showCloseButton={false}
				className={cn(
					"gap-0 border-r bg-background p-0 shadow-none",
					"data-[side=left]:left-0 data-[side=left]:w-full data-[side=left]:sm:max-w-none",
				)}
			>
				<InboxPaneHeader
					isMobile
					open={open}
					view={view}
					onViewChange={setView}
					onMarkAllRead={() => {
						setMarkAllReadRequestId((current) => current + 1);
						onMarkAllRead?.();
					}}
					onArchiveRead={() => {
						setArchiveReadRequestId((current) => current + 1);
					}}
					onClearArchived={() => {
						setClearArchivedRequestId((current) => current + 1);
					}}
				/>
				<InboxPanel
					view={view}
					markAllReadRequestId={markAllReadRequestId}
					archiveReadRequestId={archiveReadRequestId}
					clearArchivedRequestId={clearArchivedRequestId}
					onMarkItemsRead={onMarkItemsRead}
				/>
			</SheetContent>
		</Sheet>
	);
}

function InboxPaneHeader({
	isMobile = false,
	open = true,
	view,
	onViewChange,
	onMarkAllRead,
	onArchiveRead,
	onClearArchived,
}: {
	isMobile?: boolean;
	open?: boolean;
	view: InboxView;
	onViewChange: (view: InboxView) => void;
	onMarkAllRead: () => void;
	onArchiveRead: () => void;
	onClearArchived: () => void;
}) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const markAllRead = useMutation(api.inboxItems.markAllRead);
	const archiveRead = useMutation(api.inboxItems.archiveRead);
	const clearArchived = useMutation(api.inboxItems.clearArchived);
	const [actionsOpen, setActionsOpen] = React.useState(false);
	const [filtersOpen, setFiltersOpen] = React.useState(false);
	const handleMarkAllRead = React.useCallback(() => {
		if (!activeWorkspaceId) {
			return;
		}

		setActionsOpen(false);
		void markAllRead({ workspaceId: activeWorkspaceId })
			.then(() => {
				onMarkAllRead();
			})
			.catch((error) => {
				toast.error(
					getErrorMessage(error, "Failed to mark all inbox items as read"),
				);
			});
	}, [activeWorkspaceId, markAllRead, onMarkAllRead]);
	const handleArchiveRead = React.useCallback(() => {
		if (!activeWorkspaceId) {
			return;
		}

		setActionsOpen(false);
		void archiveRead({ workspaceId: activeWorkspaceId })
			.then(() => {
				onArchiveRead();
			})
			.catch((error) => {
				toast.error(
					getErrorMessage(error, "Failed to archive read inbox items"),
				);
			});
	}, [activeWorkspaceId, archiveRead, onArchiveRead]);
	const handleClearArchived = React.useCallback(() => {
		if (!activeWorkspaceId) {
			return;
		}

		setActionsOpen(false);
		void clearArchived({ workspaceId: activeWorkspaceId })
			.then(() => {
				onClearArchived();
			})
			.catch((error) => {
				toast.error(
					getErrorMessage(error, "Failed to clear archived inbox items"),
				);
			});
	}, [activeWorkspaceId, clearArchived, onClearArchived]);

	return (
		<div
			data-app-region={!isMobile && open ? "no-drag" : undefined}
			className={cn(
				"flex w-full items-center justify-between",
				!isMobile && "h-10 px-2",
				isMobile && "border-b px-4 py-3",
			)}
		>
			{isMobile ? (
				<SheetTitle className="text-sm font-medium">Inbox</SheetTitle>
			) : (
				<Breadcrumb className={DESKTOP_MAIN_HEADER_CONTENT_CLASS}>
					<BreadcrumbList className="gap-0">
						<BreadcrumbItem>
							<BreadcrumbPage>Inbox</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			)}
			<div
				className={cn(
					"flex items-center gap-0.5",
					!isMobile && DESKTOP_MAIN_HEADER_CONTENT_CLASS,
				)}
			>
				<DropdownMenu
					open={actionsOpen}
					onOpenChange={(open) => {
						setActionsOpen(open);
						if (open) {
							setFiltersOpen(false);
						}
					}}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="Inbox actions"
									data-app-region={!isMobile && open ? "no-drag" : undefined}
								>
									<MoreHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent
							sideOffset={8}
							className="pointer-events-none select-none"
						>
							Inbox actions
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end" className="min-w-44">
						<DropdownMenuItem
							disabled={!activeWorkspaceId}
							onSelect={handleMarkAllRead}
						>
							<CheckCheck className="size-4" />
							<span>Mark all as read</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!activeWorkspaceId}
							onSelect={handleArchiveRead}
						>
							<Archive className="size-4" />
							<span>Archive read</span>
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!activeWorkspaceId}
							onSelect={handleClearArchived}
						>
							<Trash2 className="size-4" />
							<span>Clear archived</span>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<DropdownMenu
					open={filtersOpen}
					onOpenChange={(open) => {
						setFiltersOpen(open);
						if (open) {
							setActionsOpen(false);
						}
					}}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="Filter inbox"
									data-app-region={!isMobile && open ? "no-drag" : undefined}
								>
									<SlidersHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent
							sideOffset={8}
							className="pointer-events-none select-none"
						>
							Filter inbox
						</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end" className="min-w-44">
						{INBOX_VIEW_OPTIONS.map((option) => {
							const Icon = option.icon;

							return (
								<DropdownMenuItem
									key={option.value}
									onSelect={() => onViewChange(option.value)}
								>
									<Icon className="size-4" />
									<span>{option.label}</span>
									{view === option.value ? (
										<Check className="ml-auto size-4 text-foreground" />
									) : null}
								</DropdownMenuItem>
							);
						})}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

function InboxPanel({
	view,
	markAllReadRequestId,
	archiveReadRequestId,
	clearArchivedRequestId,
	onMarkItemsRead,
}: {
	view: InboxView;
	markAllReadRequestId: number;
	archiveReadRequestId: number;
	clearArchivedRequestId: number;
	onMarkItemsRead?: (itemIds: string[]) => void;
}) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const items = useQuery(
		api.inboxItems.list,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId, view } : "skip",
	);
	const markRead = useMutation(api.inboxItems.markRead);
	const [optimisticReadItemIds, setOptimisticReadItemIds] = React.useState(
		() => new Set<string>(),
	);
	const [optimisticRemovedItemIds, setOptimisticRemovedItemIds] =
		React.useState(() => new Set<string>());

	React.useEffect(() => {
		if (markAllReadRequestId === 0 || !items) {
			return;
		}

		setOptimisticReadItemIds((current) => {
			const next = new Set(current);
			for (const item of items) {
				next.add(String(item._id));
			}
			return next;
		});
	}, [items, markAllReadRequestId]);

	React.useEffect(() => {
		const nextScope = `${activeWorkspaceId ?? "no-workspace"}:${view}`;

		if (!nextScope) {
			return;
		}

		setOptimisticReadItemIds(new Set());
		setOptimisticRemovedItemIds(new Set());
	}, [activeWorkspaceId, view]);

	React.useEffect(() => {
		if (archiveReadRequestId === 0 || !items || view === "archived") {
			return;
		}

		setOptimisticRemovedItemIds((current) => {
			const next = new Set(current);
			for (const item of items) {
				const itemId = String(item._id);
				const isRead = item.isRead || optimisticReadItemIds.has(itemId);
				if (isRead) {
					next.add(itemId);
				}
			}
			return next;
		});
	}, [archiveReadRequestId, items, optimisticReadItemIds, view]);

	React.useEffect(() => {
		if (clearArchivedRequestId === 0 || !items || view !== "archived") {
			return;
		}

		setOptimisticRemovedItemIds((current) => {
			const next = new Set(current);
			for (const item of items) {
				next.add(String(item._id));
			}
			return next;
		});
	}, [clearArchivedRequestId, items, view]);

	const handleMarkItemRead = async (item: {
		_id: Id<"inboxItems">;
		isRead: boolean;
	}) => {
		const optimisticItemId = String(item._id);

		if (item.isRead || optimisticReadItemIds.has(optimisticItemId)) {
			return;
		}

		setOptimisticReadItemIds((current) => {
			const next = new Set(current);
			next.add(optimisticItemId);
			return next;
		});
		onMarkItemsRead?.([optimisticItemId]);

		try {
			await markRead({ itemId: item._id });
		} catch (error) {
			setOptimisticReadItemIds((current) => {
				const next = new Set(current);
				next.delete(optimisticItemId);
				return next;
			});
			throw error;
		}
	};

	const handleOpenItem = async (item: {
		_id: Id<"inboxItems">;
		url: string;
		isRead: boolean;
	}) => {
		await handleMarkItemRead(item);

		if (window.openGranDesktop?.openExternalUrl) {
			await window.openGranDesktop.openExternalUrl(item.url);
			return;
		}

		window.open(item.url, "_blank", "noopener,noreferrer");
	};

	if (!activeWorkspaceId) {
		return (
			<ScrollArea className="min-h-0 flex-1">
				<Empty className="min-h-[24rem] border-none">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Inbox className="size-4" />
						</EmptyMedia>
						<EmptyTitle>Select a workspace</EmptyTitle>
						<EmptyDescription>
							Inbox items are scoped to the active workspace.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</ScrollArea>
		);
	}

	if (!items) {
		return null;
	}

	if (items.length === 0) {
		return (
			<ScrollArea className="min-h-0 flex-1">
				<Empty className="min-h-[24rem] border-none">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Inbox className="size-4" />
						</EmptyMedia>
						<EmptyTitle>No inbox items</EmptyTitle>
						<EmptyDescription>
							{getInboxEmptyDescription(view)}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</ScrollArea>
		);
	}

	const visibleItems = items.filter(
		(item) => !optimisticRemovedItemIds.has(String(item._id)),
	);

	if (visibleItems.length === 0) {
		return (
			<ScrollArea className="min-h-0 flex-1">
				<Empty className="min-h-[24rem] border-none">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Inbox className="size-4" />
						</EmptyMedia>
						<EmptyTitle>No inbox items</EmptyTitle>
						<EmptyDescription>
							{getInboxEmptyDescription(view)}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</ScrollArea>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1">
			<div>
				{visibleItems.map((item) => {
					const isRead =
						item.isRead || optimisticReadItemIds.has(String(item._id));

					return (
						<div
							key={item._id}
							className="group border-b transition-colors hover:bg-accent/20"
						>
							<button
								type="button"
								className="w-full cursor-pointer px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => {
									void handleMarkItemRead(item).catch((error) => {
										toast.error(
											getErrorMessage(
												error,
												"Failed to mark inbox item as read",
											),
										);
									});
								}}
							>
								<div
									className={cn(
										"grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1",
										isRead && "opacity-50",
									)}
								>
									<div className="flex pt-0.5">
										<Icons.jiraLogo className="size-4" />
									</div>
									<div className="min-w-0">
										<div className="flex items-start justify-between gap-3">
											<p className="truncate text-sm font-medium text-foreground">
												{formatInboxTitle(item.title, item.actorDisplayName)}
											</p>
											<p className="shrink-0 pt-0.5 text-xs text-muted-foreground">
												{formatInboxTimestamp(item.occurredAt)}
											</p>
										</div>
									</div>
									<div className="col-start-2 min-w-0">
										<p className="truncate text-xs leading-4 text-muted-foreground">
											{item.issueKey}
										</p>
									</div>
									<div className="col-start-2 min-w-0">
										<p className="line-clamp-3 text-sm text-muted-foreground">
											{formatInboxPreview(item.preview)}
										</p>
									</div>
								</div>
							</button>
							<div className="px-3 pb-3 pl-9">
								<Button
									type="button"
									variant="outline"
									className="relative z-10 cursor-pointer"
									onClick={() => {
										void handleOpenItem(item).catch((error) => {
											toast.error(
												getErrorMessage(error, "Failed to open inbox item"),
											);
										});
									}}
								>
									Reply
								</Button>
							</div>
						</div>
					);
				})}
			</div>
		</ScrollArea>
	);
}

function getInboxEmptyDescription(view: InboxView) {
	switch (view) {
		case "unread":
			return "Unread inbox items will appear here.";
		case "archived":
			return "Archived inbox items will appear here.";
		default:
			return "Inbox items will appear here as updates come in.";
	}
}

function formatInboxTimestamp(value: number) {
	const date = new Date(value);
	const now = new Date();
	const sameDay = date.toDateString() === now.toDateString();

	return sameDay
		? date.toLocaleTimeString([], {
				hour: "numeric",
				minute: "2-digit",
			})
		: date.toLocaleDateString([], {
				month: "short",
				day: "numeric",
			});
}

function formatInboxPreview(value: string) {
	return value
		.replace(/\[~accountid:[^\]]+\]/gi, "")
		.replace(/\s+/g, " ")
		.trim();
}

function formatInboxTitle(title: string, actorDisplayName?: string | null) {
	if (actorDisplayName?.trim()) {
		return `${actorDisplayName.trim()} mentioned you`;
	}

	if (title.startsWith("Mentioned in ")) {
		return "Someone mentioned you";
	}

	return title;
}
