"use client";

import { Button } from "@workspace/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
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
import { cn } from "@workspace/ui/lib/utils";
import { Inbox, MoreHorizontal, SlidersHorizontal } from "lucide-react";

export function InboxSheet({
	open,
	onOpenChange,
	sidebarState,
	isMobile,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sidebarState: "expanded" | "collapsed";
	isMobile: boolean;
}) {
	const sidebarOffset =
		sidebarState === "collapsed" ? SIDEBAR_WIDTH_ICON : SIDEBAR_WIDTH;
	const panelWidth = "16rem";

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
					className="pointer-events-none fixed inset-y-0 z-30 hidden overflow-hidden md:block"
					style={{
						left: sidebarOffset,
						width: panelWidth,
					}}
				>
					<div
						className={cn(
							"pointer-events-auto flex h-svh w-[16rem] flex-col border-r bg-background text-foreground transition-transform duration-200 ease-linear",
							open ? "translate-x-0" : "-translate-x-full",
						)}
					>
						<div className="p-2">
							<InboxPaneHeader isMobile={false} />
						</div>
						<div className="min-h-0 flex-1">
							<InboxPanel />
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
				<InboxPaneHeader isMobile />
				<InboxPanel />
			</SheetContent>
		</Sheet>
	);
}

function InboxPaneHeader({ isMobile = false }: { isMobile?: boolean }) {
	return (
		<div
			className={cn(
				"flex w-full items-center justify-between",
				!isMobile && "h-12 px-2",
				isMobile && "border-b px-4 py-3",
			)}
		>
			{isMobile ? (
				<SheetTitle className="text-sm font-medium">Inbox</SheetTitle>
			) : (
				<h2 className="text-sm font-medium text-foreground">Inbox</h2>
			)}
			<div className="flex items-center gap-0.5">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground"
				>
					<MoreHorizontal className="size-4" />
					<span className="sr-only">More inbox actions</span>
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground"
				>
					<SlidersHorizontal className="size-4" />
					<span className="sr-only">Filter inbox</span>
				</Button>
			</div>
		</div>
	);
}

function InboxPanel() {
	return (
		<ScrollArea className="min-h-0 flex-1">
			<Empty className="min-h-[24rem] border-none">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Inbox className="size-4" />
					</EmptyMedia>
					<EmptyTitle>No inbox items</EmptyTitle>
					<EmptyDescription>
						Inbox content will appear here once it is wired to real data.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</ScrollArea>
	);
}
