"use client";

import { Tiptap, useEditor } from "@tiptap/react";
import { Button } from "@workspace/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import { useOptionalSidebarShell } from "@workspace/ui/components/sidebar";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import {
	APP_SIDEBAR_COLLAPSED_WIDTH,
	APP_SIDEBAR_EXPANDED_WIDTH,
} from "@workspace/ui/lib/panel-dimensions";
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import {
	ChevronRight,
	Clock3,
	ExternalLink,
	FileText,
	Globe,
	Plus,
	X,
} from "lucide-react";
import * as React from "react";
import {
	DESKTOP_DOCKED_PANEL_DEFAULT_WIDTH,
	DESKTOP_DOCKED_PANEL_MAX_WIDTH,
	DESKTOP_DOCKED_PANEL_MIN_WIDTH,
	MOBILE_DOCKED_PANEL_MIN_WIDTH,
} from "@/components/layout/docked-panel-dimensions";
import {
	DesktopDockedSidePanel,
	DockedPanelPinButton,
	useDockedPanelInset,
} from "@/components/layout/docked-side-panel";
import {
	ResizableSidePanelHandle,
	useResizableSidePanel,
} from "@/components/layout/resizable-side-panel";
import {
	SearchCommand,
	type SearchCommandItem,
} from "@/components/search/search-command";
import { collectMessageSources, type ToolSource } from "@/lib/chat-sources";
import {
	createNoteEditorExtensions,
	parseStoredNoteContent,
} from "@/lib/note-editor";

export const OPEN_CHAT_SUMMARY_EVENT = "opengran:open-chat-summary";

const CHAT_SUMMARY_PANEL_STORAGE_KEY_DESKTOP =
	"opengran.chat-summary-panel-width.desktop";
const CHAT_SUMMARY_PANEL_STORAGE_KEY_MOBILE =
	"opengran.chat-summary-panel-width.mobile";
const CHAT_SUMMARY_PANEL_PINNED_STORAGE_KEY =
	"opengran.chat-summary-panel-pinned.desktop";

type SummaryWorkspaceSource = {
	id: string;
	title: string;
	preview?: string;
	content?: string;
	updatedAt?: number;
};

type SummaryTab =
	| { id: "summary"; kind: "summary"; title: "Summary" }
	| {
			id: string;
			kind: "file";
			sourceId: string;
			title: string;
			preview?: string;
			content?: string;
	  }
	| { id: "automation"; kind: "automation"; title: "Automation" };

const SUMMARY_TAB: SummaryTab = {
	id: "summary",
	kind: "summary",
	title: "Summary",
};

const readDesktopChatSummaryPanelPinnedState = () => {
	if (typeof window === "undefined") {
		return false;
	}

	try {
		return (
			window.localStorage.getItem(CHAT_SUMMARY_PANEL_PINNED_STORAGE_KEY) ===
			"true"
		);
	} catch {
		return false;
	}
};

const writeDesktopChatSummaryPanelPinnedState = (isPinned: boolean) => {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(
			CHAT_SUMMARY_PANEL_PINNED_STORAGE_KEY,
			String(isPinned),
		);
	} catch {
		// Keep the in-memory state if localStorage is unavailable.
	}
};

const collectChatSources = (messages: UIMessage[]): ToolSource[] => {
	const sources = messages.flatMap((message) =>
		message.role === "assistant" ? collectMessageSources(message) : [],
	);
	const seen = new Set<string>();

	return sources.filter((source) => {
		const key = `${source.href}::${source.title}`;

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
};

export function ChatSummarySheet({
	open,
	messages,
	workspaceSources,
	onOpenChange,
}: {
	open: boolean;
	messages: UIMessage[];
	workspaceSources: SummaryWorkspaceSource[];
	onOpenChange: (open: boolean) => void;
}) {
	const sidebarShell = useOptionalSidebarShell();
	const isMobile = useIsMobile();
	const [isPinned, setIsPinned] = React.useState(
		readDesktopChatSummaryPanelPinnedState,
	);
	const { handleResizeKeyDown, handleResizeStart, isResizing, panelWidth } =
		useResizableSidePanel({
			isMobile,
			side: "right",
			desktopStorageKey: CHAT_SUMMARY_PANEL_STORAGE_KEY_DESKTOP,
			mobileStorageKey: CHAT_SUMMARY_PANEL_STORAGE_KEY_MOBILE,
			defaultDesktopWidth: DESKTOP_DOCKED_PANEL_DEFAULT_WIDTH,
			desktopMinWidth: DESKTOP_DOCKED_PANEL_MIN_WIDTH,
			desktopMaxWidth: DESKTOP_DOCKED_PANEL_MAX_WIDTH,
			mobileMinWidth: MOBILE_DOCKED_PANEL_MIN_WIDTH,
		});
	const leftSidebarReservedWidth =
		sidebarShell?.state === "collapsed"
			? APP_SIDEBAR_COLLAPSED_WIDTH
			: APP_SIDEBAR_EXPANDED_WIDTH;
	const sources = React.useMemo(() => collectChatSources(messages), [messages]);
	const togglePinned = React.useCallback(() => {
		setIsPinned((current) => {
			const nextPinned = !current;
			writeDesktopChatSummaryPanelPinnedState(nextPinned);
			return nextPinned;
		});
	}, []);

	useDockedPanelInset({
		side: "right",
		isMobile,
		isPinned,
		open,
		panelWidth,
	});

	const panel = (
		<ChatSummaryPanel
			isMobile={isMobile}
			isPinned={isPinned}
			sources={sources}
			workspaceSources={workspaceSources}
			onTogglePinned={togglePinned}
		/>
	);

	if (isMobile) {
		return (
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent
					side="right"
					showCloseButton={false}
					className="group/docked-sheet gap-0 border-l bg-background p-0 shadow-none data-[side=right]:sm:max-w-none"
					style={{ width: panelWidth, maxWidth: "100vw" }}
				>
					<SheetTitle className="sr-only">Chat summary</SheetTitle>
					<SheetDescription className="sr-only">
						View files, artifacts, and sources used in this chat.
					</SheetDescription>
					<ResizableSidePanelHandle
						side="right"
						label="Resize chat summary panel"
						panelWidth={panelWidth}
						isResizing={isResizing}
						className="opacity-0 transition-opacity duration-150 group-hover/docked-sheet:opacity-100 group-focus-within/docked-sheet:opacity-100"
						onPointerDown={handleResizeStart}
						onKeyDown={handleResizeKeyDown}
					/>
					{panel}
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<DesktopDockedSidePanel
			side="right"
			open={open}
			isPinned={isPinned}
			panelWidth={panelWidth}
			dismissLeadingOffset={`${leftSidebarReservedWidth}px`}
			onOpenChange={onOpenChange}
			panelName="chat summary"
			resizeLabel="Resize chat summary panel"
			isResizing={isResizing}
			onResizeStart={handleResizeStart}
			onResizeKeyDown={handleResizeKeyDown}
		>
			{panel}
		</DesktopDockedSidePanel>
	);
}

function ChatSummaryPanel({
	isMobile,
	isPinned,
	sources,
	workspaceSources,
	onTogglePinned,
}: {
	isMobile: boolean;
	isPinned: boolean;
	sources: ToolSource[];
	workspaceSources: SummaryWorkspaceSource[];
	onTogglePinned: () => void;
}) {
	const [tabs, setTabs] = React.useState<SummaryTab[]>([SUMMARY_TAB]);
	const [activeTabId, setActiveTabId] = React.useState(SUMMARY_TAB.id);
	const [fileSearchOpen, setFileSearchOpen] = React.useState(false);
	const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? SUMMARY_TAB;
	const fileSearchItems = React.useMemo<SearchCommandItem[]>(
		() =>
			workspaceSources.map((source) => ({
				id: source.id,
				title: source.title,
				kind: "note" as const,
				icon: FileText,
				preview: source.preview,
				updatedAt: source.updatedAt,
			})),
		[workspaceSources],
	);
	const addTab = React.useCallback((tab: SummaryTab) => {
		setTabs((current) =>
			current.some((item) => item.id === tab.id) ? current : [...current, tab],
		);
		setActiveTabId(tab.id);
	}, []);
	const closeTab = React.useCallback(
		(tabId: string) => {
			setTabs((current) => {
				const nextTabs = current.filter((tab) => tab.id !== tabId);

				if (activeTabId === tabId) {
					setActiveTabId(SUMMARY_TAB.id);
				}

				return nextTabs.length > 0 ? nextTabs : [SUMMARY_TAB];
			});
		},
		[activeTabId],
	);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-14 shrink-0 items-center justify-between px-4">
				<SummaryTabRail
					tabs={tabs}
					activeTabId={activeTabId}
					onSelectTab={setActiveTabId}
					onCloseTab={closeTab}
				/>
				<div className="flex items-center gap-1">
					<SummaryAddPopover
						showAutomation={!tabs.some((tab) => tab.kind === "automation")}
						onOpenFileSearch={() => {
							setFileSearchOpen(true);
						}}
						onAddAutomation={() =>
							addTab({
								id: "automation",
								kind: "automation",
								title: "Automation",
							})
						}
					/>
					{isMobile ? null : (
						<DockedPanelPinButton
							isPinned={isPinned}
							label="summary"
							onTogglePinned={onTogglePinned}
						/>
					)}
				</div>
			</div>
			{fileSearchOpen ? (
				<SearchCommand
					open={fileSearchOpen}
					onOpenChange={setFileSearchOpen}
					items={fileSearchItems}
					projects={[]}
					onSelectItem={(itemId) => {
						const source = workspaceSources.find((item) => item.id === itemId);

						if (!source) {
							return;
						}

						addTab({
							id: `file:${source.id}`,
							kind: "file",
							sourceId: source.id,
							title: source.title,
							preview: source.preview,
							content: source.content,
						});
					}}
				/>
			) : null}
			<SummaryTabContent activeTab={activeTab} sources={sources} />
		</div>
	);
}

function SummaryTabRail({
	tabs,
	activeTabId,
	onSelectTab,
	onCloseTab,
}: {
	tabs: SummaryTab[];
	activeTabId: string;
	onSelectTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
}) {
	return (
		<div className="no-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
			<div className="flex min-w-max items-center gap-1 pr-2">
				{tabs.map((tab) => {
					const isActive = tab.id === activeTabId;

					return (
						<div
							key={tab.id}
							className={cn(
								"group/tab flex h-8 max-w-36 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm transition-colors",
								isActive
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground",
								"focus-within:text-foreground",
							)}
							title={tab.title}
						>
							<button
								type="button"
								className="min-w-0 flex-1 truncate text-left"
								onClick={() => onSelectTab(tab.id)}
							>
								{tab.title}
							</button>
							{tab.kind !== "summary" ? (
								<button
									type="button"
									aria-label={`Close ${tab.title}`}
									className="flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover/tab:opacity-100"
									onClick={() => {
										onCloseTab(tab.id);
									}}
								>
									<X className="size-3" />
								</button>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function SummaryAddPopover({
	showAutomation,
	onOpenFileSearch,
	onAddAutomation,
}: {
	showAutomation: boolean;
	onOpenFileSearch: () => void;
	onAddAutomation: () => void;
}) {
	const [open, setOpen] = React.useState(false);
	const handleOpenChange = React.useCallback((nextOpen: boolean) => {
		setOpen(nextOpen);
	}, []);

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label="Add summary tab"
				>
					<Plus className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={6} className="w-72 p-0">
				<Command>
					<CommandList>
						<CommandGroup>
							<CommandItem
								value="open-file"
								onSelect={() => {
									handleOpenChange(false);
									onOpenFileSearch();
								}}
							>
								<FileText className="size-4" />
								Open note
							</CommandItem>
							{showAutomation ? (
								<CommandItem
									value="automation"
									onSelect={() => {
										onAddAutomation();
										handleOpenChange(false);
									}}
								>
									<Clock3 className="size-4" />
									Automation
								</CommandItem>
							) : null}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function SummaryTabContent({
	activeTab,
	sources,
}: {
	activeTab: SummaryTab;
	sources: ToolSource[];
}) {
	if (activeTab.kind === "automation") {
		return (
			<div className="min-h-0 flex-1 p-4">
				<Empty className="h-full border-0">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Clock3 />
						</EmptyMedia>
						<EmptyTitle>Automation unavailable</EmptyTitle>
						<EmptyDescription>
							This automation may have been deleted or is no longer available on
							this machine
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	if (activeTab.kind === "file") {
		return (
			<ScrollArea
				className="min-h-0 flex-1"
				reserveScrollbarGap
				viewportClassName="overflow-x-hidden [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full"
			>
				<div className="summary-note-preview-content flex flex-col gap-4 px-5 py-4">
					<div className="flex items-center gap-2 text-xl font-medium leading-tight tracking-tight">
						<span className="min-w-0 truncate">{activeTab.title}</span>
					</div>
					{activeTab.preview ? (
						<ReadOnlyNoteContent
							content={activeTab.content}
							fallbackText={activeTab.preview}
						/>
					) : (
						<p className="text-xs text-muted-foreground">
							No preview available.
						</p>
					)}
				</div>
			</ScrollArea>
		);
	}

	return <SummaryDefaultContent sources={sources} />;
}

function ReadOnlyNoteContent({
	content,
	fallbackText,
}: {
	content?: string;
	fallbackText: string;
}) {
	const editor = useEditor({
		extensions: createNoteEditorExtensions(),
		immediatelyRender: false,
		editable: false,
		editorProps: {
			attributes: {
				class:
					"note-tiptap min-h-0 border border-transparent bg-transparent px-0 py-0 text-base outline-none",
			},
		},
	});

	React.useEffect(() => {
		if (!editor) {
			return;
		}

		editor.commands.setContent(
			parseStoredNoteContent(
				content?.trim() ? content : fallbackText,
				editor.state.schema,
			),
			{
				emitUpdate: false,
			},
		);
	}, [content, editor, fallbackText]);

	if (!editor) {
		return null;
	}

	return (
		<Tiptap editor={editor}>
			<Tiptap.Content className="text-base text-foreground" />
		</Tiptap>
	);
}

function SummaryDefaultContent({ sources }: { sources: ToolSource[] }) {
	return (
		<ScrollArea
			className="min-h-0 flex-1"
			reserveScrollbarGap
			viewportClassName="overflow-x-hidden [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full"
		>
			<div className="flex flex-col gap-2 px-3 py-4">
				<SummarySection title="Artifacts">
					<p className="px-2 py-1.5 text-xs text-muted-foreground">
						View and open files
					</p>
				</SummarySection>
				<SummarySection title="Sources">
					{sources.length > 0 ? (
						<div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
							{sources.map((source) => (
								<a
									key={`${source.href}:${source.title}`}
									href={source.href}
									target="_blank"
									rel="noreferrer"
									className={cn(
										"group/source flex h-8 w-full min-w-0 max-w-full items-center gap-2 overflow-hidden rounded-md px-2 text-sm text-muted-foreground transition-colors",
										"hover:bg-accent/50 hover:text-foreground",
									)}
								>
									<Globe className="size-3.5 shrink-0" />
									<span className="min-w-0 flex-1 basis-0 truncate">
										{source.title}
									</span>
									<ExternalLink className="size-3 shrink-0 opacity-0 transition-opacity group-hover/source:opacity-70" />
								</a>
							))}
						</div>
					) : (
						<p className="px-2 py-1.5 text-xs text-muted-foreground">
							No sources yet
						</p>
					)}
				</SummarySection>
			</div>
		</ScrollArea>
	);
}

function SummarySection({
	children,
	defaultOpen = true,
	title,
}: {
	children: React.ReactNode;
	defaultOpen?: boolean;
	title: string;
}) {
	const contentId = React.useId();

	return (
		<Collapsible defaultOpen={defaultOpen} className="group/collapsible">
			<CollapsibleTrigger
				aria-controls={contentId}
				className={cn(
					"group/label flex h-8 w-full cursor-pointer items-center justify-start gap-1.5 rounded-lg px-3 text-xs font-medium text-sidebar-foreground/60 outline-hidden transition-colors",
					"hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
				)}
			>
				<span>{title}</span>
				<ChevronRight
					className={cn(
						"mt-px size-3 shrink-0 opacity-0 transition-[opacity,transform] group-hover/label:opacity-100 group-focus-visible/label:opacity-100",
						"group-data-[state=open]/collapsible:rotate-90",
					)}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent
				id={contentId}
				className="min-w-0 overflow-hidden px-1 pb-2"
			>
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
