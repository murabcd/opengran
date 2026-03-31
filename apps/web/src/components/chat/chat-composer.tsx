import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Icons } from "@workspace/ui/components/icons";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import {
	ArrowUp,
	AtSign,
	Book,
	Check,
	CirclePlus,
	FileText,
	Globe,
	Grid3x3,
	type LucideIcon,
	Plus,
	X,
} from "lucide-react";
import type { KeyboardEventHandler } from "react";
import { chatModels } from "@/lib/ai/models";
import { getAvatarSrc } from "@/lib/avatar";
import type { WorkspaceRecord } from "@/lib/workspaces";

type ContextPage = {
	id: string;
	title: string;
	icon: LucideIcon;
	preview: string;
};

type WorkspaceSource = {
	id: string;
	title: string;
	preview: string;
};

type AppSource = {
	id: string;
	title: string;
	preview: string;
	provider: "yandex-tracker";
};

type ChatComposerProps = {
	hasMessages: boolean;
	draft: string;
	onDraftChange: (value: string) => void;
	onDraftKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
	onSubmit: () => void | Promise<void>;
	isLoading: boolean;
	selectedModel: (typeof chatModels)[number];
	modelPopoverOpen: boolean;
	onModelPopoverOpenChange: (open: boolean) => void;
	onSelectedModelChange: (model: (typeof chatModels)[number]) => void;
	mentionPopoverOpen: boolean;
	onMentionPopoverOpenChange: (open: boolean) => void;
	documentSearchTerm: string;
	onDocumentSearchTermChange: (value: string) => void;
	mentions: string[];
	contextPages: ContextPage[];
	mentionableDocuments: ContextPage[];
	isNotesLoading: boolean;
	emptyStateMessage: string;
	shouldSearchDocuments: boolean;
	onAddMention: (pageId: string) => void;
	onRemoveMention: (pageId: string) => void;
	sourcesOpen: boolean;
	onSourcesOpenChange: (open: boolean) => void;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange: (value: boolean) => void;
	appsEnabled: boolean;
	onAppsEnabledChange: (value: boolean) => void;
	sourceSearchTerm: string;
	onSourceSearchTermChange: (value: string) => void;
	selectedSourceIds: string[];
	workspaceSources: WorkspaceSource[];
	workspaceSourceId: string | null;
	activeWorkspace: WorkspaceRecord | null;
	appSources: AppSource[];
	onToggleSource: (sourceId: string) => void;
	onClearSelectedSources: () => void;
};

export function ChatComposer({
	hasMessages,
	draft,
	onDraftChange,
	onDraftKeyDown,
	onSubmit,
	isLoading,
	selectedModel,
	modelPopoverOpen,
	onModelPopoverOpenChange,
	onSelectedModelChange,
	mentionPopoverOpen,
	onMentionPopoverOpenChange,
	documentSearchTerm,
	onDocumentSearchTermChange,
	mentions,
	contextPages,
	mentionableDocuments,
	isNotesLoading,
	emptyStateMessage,
	shouldSearchDocuments,
	onAddMention,
	onRemoveMention,
	sourcesOpen,
	onSourcesOpenChange,
	webSearchEnabled,
	onWebSearchEnabledChange,
	appsEnabled,
	onAppsEnabledChange,
	sourceSearchTerm,
	onSourceSearchTermChange,
	selectedSourceIds,
	workspaceSources,
	workspaceSourceId,
	activeWorkspace,
	appSources,
	onToggleSource,
	onClearSelectedSources,
}: ChatComposerProps) {
	const filteredWorkspaceSources = filterWorkspaceSources(
		workspaceSources,
		sourceSearchTerm,
	);
	const scopesLabel =
		selectedSourceIds.length === 0
			? "All sources"
			: selectedSourceIds.length === 1
				? "1 scope"
				: `${selectedSourceIds.length} scopes`;
	const mentionPicker = (
		<Popover
			open={mentionPopoverOpen}
			onOpenChange={onMentionPopoverOpenChange}
		>
			<Tooltip>
				<TooltipTrigger
					asChild
					onFocusCapture={(event) => event.stopPropagation()}
				>
					<PopoverTrigger asChild>
						<InputGroupButton
							variant="outline"
							size="icon-sm"
							className="rounded-full transition-transform"
						>
							<AtSign />
							<span className="sr-only">Mention a page</span>
						</InputGroupButton>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Add context</TooltipContent>
			</Tooltip>

			<PopoverContent className="p-0 [--radius:1.2rem]" align="start">
				<Command>
					<CommandInput
						placeholder="Search notes..."
						value={documentSearchTerm}
						onValueChange={onDocumentSearchTermChange}
					/>
					<CommandList>
						{isNotesLoading ? (
							<CommandGroup heading="Notes">
								<ChatNoteListSkeleton />
							</CommandGroup>
						) : null}
						<CommandEmpty>{emptyStateMessage}</CommandEmpty>
						{mentionableDocuments.length > 0 ? (
							<CommandGroup
								heading={shouldSearchDocuments ? "Search results" : "Notes"}
							>
								{mentionableDocuments.map((document) => (
									<CommandItem
										key={document.id}
										value={`${document.id} ${document.title}`}
										onSelect={() => onAddMention(document.id)}
									>
										<document.icon />
										<span className="truncate">{document.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
	const showTopAddon = !hasMessages || mentions.length > 0;

	return (
		<div className={`mx-auto w-full max-w-xl ${hasMessages ? "mt-auto" : ""}`}>
			<label htmlFor="chat-prompt" className="sr-only">
				Prompt
			</label>
			<InputGroup
				className={`${hasMessages ? "min-h-[96px]" : "min-h-[148px]"} max-h-[32rem] overflow-hidden rounded-xl border-border bg-card bg-clip-padding shadow-sm has-disabled:bg-card has-disabled:opacity-100 dark:bg-input/30 dark:has-disabled:bg-input/30 [--radius:1rem]`}
			>
				{showTopAddon ? (
					<InputGroupAddon
						align="block-start"
						className={`px-4 pb-0 ${hasMessages ? "pt-2.5" : "pt-4"}`}
					>
						{!hasMessages ? mentionPicker : null}
						{mentions.length > 0 ? (
							<div className="no-scrollbar -m-1.5 flex gap-1 overflow-y-auto p-1.5">
								{mentions.map((mentionId) => {
									const document = contextPages.find(
										(page) => page.id === mentionId,
									);

									if (!document) {
										return null;
									}

									return (
										<InputGroupButton
											key={mentionId}
											size="sm"
											variant="secondary"
											className="rounded-full pl-2!"
											onClick={() => onRemoveMention(mentionId)}
										>
											<document.icon />
											{document.title}
											<X />
										</InputGroupButton>
									);
								})}
							</div>
						) : null}
					</InputGroupAddon>
				) : null}

				<InputGroupTextarea
					id="chat-prompt"
					value={draft}
					onChange={(event) => onDraftChange(event.target.value)}
					onKeyDown={onDraftKeyDown}
					rows={hasMessages ? 1 : 3}
					placeholder="Ask, search, or make anything..."
					className={`${hasMessages ? "min-h-[40px] pt-2 pb-0" : "min-h-[64px] pt-2"} max-h-[24rem] overflow-y-auto px-4 text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0`}
				/>

				<InputGroupAddon
					align="block-end"
					className={`gap-1 px-4 ${hasMessages ? "pb-2.5" : "pb-4"}`}
				>
					{hasMessages ? mentionPicker : null}
					<ModelPicker
						open={modelPopoverOpen}
						onOpenChange={onModelPopoverOpenChange}
						selectedModel={selectedModel}
						onSelectedModelChange={onSelectedModelChange}
					/>
					<ScopePicker
						open={sourcesOpen}
						onOpenChange={onSourcesOpenChange}
						scopesLabel={scopesLabel}
						webSearchEnabled={webSearchEnabled}
						onWebSearchEnabledChange={onWebSearchEnabledChange}
						appsEnabled={appsEnabled}
						onAppsEnabledChange={onAppsEnabledChange}
						selectedSourceIds={selectedSourceIds}
						sourceSearchTerm={sourceSearchTerm}
						onSourceSearchTermChange={onSourceSearchTermChange}
						filteredWorkspaceSources={filteredWorkspaceSources}
						workspaceSourceId={workspaceSourceId}
						activeWorkspace={activeWorkspace}
						appSources={appSources}
						isNotesLoading={isNotesLoading}
						onToggleSource={onToggleSource}
						onClearSelectedSources={onClearSelectedSources}
					/>
					<InputGroupButton
						aria-label="Send"
						className="ml-auto rounded-full"
						variant="default"
						size="icon-sm"
						disabled={!draft.trim() || isLoading}
						onClick={() => {
							void onSubmit();
						}}
					>
						<ArrowUp className="size-4" />
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</div>
	);
}

function ModelPicker({
	open,
	onOpenChange,
	selectedModel,
	onSelectedModelChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedModel: (typeof chatModels)[number];
	onSelectedModelChange: (model: (typeof chatModels)[number]) => void;
}) {
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<InputGroupButton size="sm" className="rounded-full gap-2">
							<Icons.codexLogo className="size-3.5 text-muted-foreground" />
							{selectedModel.name}
						</InputGroupButton>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Select model</TooltipContent>
			</Tooltip>
			<DropdownMenuContent side="top" align="start" className="[--radius:1rem]">
				<DropdownMenuGroup className="w-42">
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						OpenAI
					</DropdownMenuLabel>
					{chatModels.map((model) => (
						<DropdownMenuCheckboxItem
							key={model.id}
							checked={model.id === selectedModel.id}
							onCheckedChange={(checked) => {
								if (checked) {
									onSelectedModelChange(model);
								}
							}}
							className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
						>
							<span className="inline-flex items-center gap-2">
								<Icons.codexLogo className="size-3.5 text-muted-foreground" />
								{model.name}
							</span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ScopePicker({
	open,
	onOpenChange,
	scopesLabel,
	webSearchEnabled,
	onWebSearchEnabledChange,
	appsEnabled,
	onAppsEnabledChange,
	selectedSourceIds,
	sourceSearchTerm,
	onSourceSearchTermChange,
	filteredWorkspaceSources,
	workspaceSourceId,
	activeWorkspace,
	appSources,
	isNotesLoading,
	onToggleSource,
	onClearSelectedSources,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scopesLabel: string;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange: (value: boolean) => void;
	appsEnabled: boolean;
	onAppsEnabledChange: (value: boolean) => void;
	selectedSourceIds: string[];
	sourceSearchTerm: string;
	onSourceSearchTermChange: (value: string) => void;
	filteredWorkspaceSources: WorkspaceSource[];
	workspaceSourceId: string | null;
	activeWorkspace: WorkspaceRecord | null;
	appSources: AppSource[];
	isNotesLoading: boolean;
	onToggleSource: (sourceId: string) => void;
	onClearSelectedSources: () => void;
}) {
	const workspaceSourceSelected = workspaceSourceId
		? selectedSourceIds.includes(workspaceSourceId)
		: false;
	const selectedWorkspaceNoteCount = selectedSourceIds.filter(
		(sourceId) =>
			!sourceId.startsWith("app:") && !sourceId.startsWith("workspace:"),
	).length;
	const hasWorkspaceScopes =
		workspaceSourceSelected || selectedWorkspaceNoteCount > 0;
	const isSearchingWorkspaceNotes = sourceSearchTerm.trim().length > 0;

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<InputGroupButton
							size="sm"
							className="max-w-[180px] justify-start rounded-full"
						>
							<Globe />
							<span className="max-w-[160px] truncate">{scopesLabel}</span>
						</InputGroupButton>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Select scope</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				side="top"
				align="end"
				sideOffset={4}
				className="[--radius:1rem]"
			>
				<DropdownMenuGroup>
					<DropdownMenuItem
						asChild
						onSelect={(event) => event.preventDefault()}
					>
						<label htmlFor="web-search">
							<Globe /> Web search
							<Switch
								id="web-search"
								className="ml-auto"
								checked={webSearchEnabled}
								onCheckedChange={onWebSearchEnabledChange}
							/>
						</label>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						asChild
						onSelect={(event) => event.preventDefault()}
					>
						<label htmlFor="apps">
							<Grid3x3 /> Apps and Integrations
							<Switch
								id="apps"
								className="ml-auto"
								checked={appsEnabled}
								onCheckedChange={onAppsEnabledChange}
							/>
						</label>
					</DropdownMenuItem>
					<DropdownMenuCheckboxItem
						checked={selectedSourceIds.length === 0}
						className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
						onCheckedChange={(checked) => {
							if (checked) {
								onClearSelectedSources();
							}
						}}
					>
						<CirclePlus /> All sources i can access
					</DropdownMenuCheckboxItem>
					<WorkspaceScopeMenu
						hasWorkspaceScopes={hasWorkspaceScopes}
						workspaceSourceId={workspaceSourceId}
						onToggleSource={onToggleSource}
						activeWorkspace={activeWorkspace}
						selectedWorkspaceNoteCount={selectedWorkspaceNoteCount}
						workspaceSourceSelected={workspaceSourceSelected}
						sourceSearchTerm={sourceSearchTerm}
						onSourceSearchTermChange={onSourceSearchTermChange}
						isSearchingWorkspaceNotes={isSearchingWorkspaceNotes}
						isNotesLoading={isNotesLoading}
						filteredWorkspaceSources={filteredWorkspaceSources}
						selectedSourceIds={selectedSourceIds}
					/>
					<AppSourceItems
						appSources={appSources}
						selectedSourceIds={selectedSourceIds}
						onToggleSource={onToggleSource}
					/>
					<DropdownMenuItem>
						<Book /> Help Center
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						onSelect={() => {
							window.history.pushState(null, "", "/settings/connections");
							window.dispatchEvent(new PopStateEvent("popstate"));
						}}
					>
						<Plus /> Connect Apps
					</DropdownMenuItem>
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						We&apos;ll only search in the sources selected here.
					</DropdownMenuLabel>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function WorkspaceScopeMenu({
	hasWorkspaceScopes,
	workspaceSourceId,
	onToggleSource,
	activeWorkspace,
	selectedWorkspaceNoteCount,
	workspaceSourceSelected,
	sourceSearchTerm,
	onSourceSearchTermChange,
	isSearchingWorkspaceNotes,
	isNotesLoading,
	filteredWorkspaceSources,
	selectedSourceIds,
}: {
	hasWorkspaceScopes: boolean;
	workspaceSourceId: string | null;
	onToggleSource: (sourceId: string) => void;
	activeWorkspace: WorkspaceRecord | null;
	selectedWorkspaceNoteCount: number;
	workspaceSourceSelected: boolean;
	sourceSearchTerm: string;
	onSourceSearchTermChange: (value: string) => void;
	isSearchingWorkspaceNotes: boolean;
	isNotesLoading: boolean;
	filteredWorkspaceSources: WorkspaceSource[];
	selectedSourceIds: string[];
}) {
	const activeWorkspaceAvatarSrc = activeWorkspace
		? (activeWorkspace.iconUrl ??
			getAvatarSrc({
				name: activeWorkspace.name,
			}))
		: null;
	const activeWorkspaceInitials = activeWorkspace
		? activeWorkspace.name
				.split(" ")
				.map((part) => part[0])
				.join("")
				.slice(0, 2)
				.toUpperCase()
		: "WG";

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger
				className={hasWorkspaceScopes ? "[&>svg:last-child]:ml-2!" : ""}
				onClick={() => {
					if (workspaceSourceId) {
						onToggleSource(workspaceSourceId);
					}
				}}
			>
				<WorkspaceScopeAvatar
					activeWorkspace={activeWorkspace}
					activeWorkspaceAvatarSrc={activeWorkspaceAvatarSrc}
					activeWorkspaceInitials={activeWorkspaceInitials}
				/>
				{activeWorkspace?.name ?? "Workspace"}
				{hasWorkspaceScopes ? (
					<span className="ml-auto flex items-center gap-2">
						{!workspaceSourceSelected ? (
							<span className="text-xs text-muted-foreground tabular-nums">
								{selectedWorkspaceNoteCount === 1
									? "1 scope"
									: `${selectedWorkspaceNoteCount} scopes`}
							</span>
						) : null}
						<Check className="size-4 text-muted-foreground" />
					</span>
				) : null}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-72 p-0 [--radius:1rem]">
				<Command>
					<div className="[&_[data-slot=input-group]]:rounded-sm!">
						<CommandInput
							placeholder="Select a note"
							value={sourceSearchTerm}
							onValueChange={onSourceSearchTermChange}
						/>
					</div>
					<CommandList>
						<CommandGroup>
							<CommandItem
								value={activeWorkspace?.name ?? "workspace"}
								onSelect={() => {
									if (workspaceSourceId) {
										onToggleSource(workspaceSourceId);
									}
								}}
								className="relative w-full gap-2 pr-8"
							>
								<WorkspaceScopeAvatar
									activeWorkspace={activeWorkspace}
									activeWorkspaceAvatarSrc={activeWorkspaceAvatarSrc}
									activeWorkspaceInitials={activeWorkspaceInitials}
								/>
								<div className="min-w-0 flex-1">
									<div className="truncate">
										{activeWorkspace?.name ?? "Workspace"}
									</div>
								</div>
								{workspaceSourceSelected ? (
									<span className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center">
										<Check className="size-4" />
									</span>
								) : null}
							</CommandItem>
						</CommandGroup>
						{isSearchingWorkspaceNotes && isNotesLoading ? (
							<CommandGroup heading="Notes">
								<ChatNoteListSkeleton />
							</CommandGroup>
						) : null}
						{isSearchingWorkspaceNotes ? (
							<CommandEmpty>No notes found.</CommandEmpty>
						) : (
							<div className="px-3 py-2 text-xs text-muted-foreground">
								Type to find notes in this workspace.
							</div>
						)}
						{isSearchingWorkspaceNotes ? (
							<CommandGroup heading="Notes">
								{filteredWorkspaceSources.map((source) => {
									const selected = selectedSourceIds.includes(source.id);

									return (
										<CommandItem
											key={source.id}
											value={`${source.id} ${source.title}`}
											onSelect={() => onToggleSource(source.id)}
											className="relative w-full gap-2 pr-8"
										>
											<FileText className="size-4" />
											<div className="min-w-0 flex-1">
												<div className="truncate">{source.title}</div>
												{source.preview ? (
													<div className="truncate text-xs text-muted-foreground">
														{source.preview}
													</div>
												) : null}
											</div>
											{selected ? (
												<span className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center">
													<Check className="size-4" />
												</span>
											) : null}
										</CommandItem>
									);
								})}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function WorkspaceScopeAvatar({
	activeWorkspace,
	activeWorkspaceAvatarSrc,
	activeWorkspaceInitials,
}: {
	activeWorkspace: WorkspaceRecord | null;
	activeWorkspaceAvatarSrc: string | null;
	activeWorkspaceInitials: string;
}) {
	if (!activeWorkspace) {
		return (
			<span className="flex size-4 items-center justify-center text-muted-foreground">
				<OpenGranMark className="size-4" />
			</span>
		);
	}

	return (
		<Avatar className="size-4 rounded-sm">
			<AvatarImage
				src={activeWorkspaceAvatarSrc ?? undefined}
				alt={activeWorkspace.name}
			/>
			<AvatarFallback className="rounded-sm text-[8px]">
				{activeWorkspaceInitials}
			</AvatarFallback>
		</Avatar>
	);
}

function AppSourceItems({
	appSources,
	selectedSourceIds,
	onToggleSource,
}: {
	appSources: AppSource[];
	selectedSourceIds: string[];
	onToggleSource: (sourceId: string) => void;
}) {
	return appSources.map((source) => {
		const selected = selectedSourceIds.includes(source.id);

		return (
			<DropdownMenuCheckboxItem
				key={source.id}
				checked={selected}
				className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
				onCheckedChange={() => onToggleSource(source.id)}
			>
				{source.provider === "yandex-tracker" ? (
					<Icons.yandexTrackerLogo className="size-4 text-blue-500" />
				) : (
					<Grid3x3 className="size-4" />
				)}
				<div className="min-w-0">
					<div className="truncate">{source.title}</div>
				</div>
			</DropdownMenuCheckboxItem>
		);
	});
}

function ChatNoteListSkeleton() {
	return (
		<div className="space-y-2 px-1 py-1">
			{["primary", "secondary"].map((item) => (
				<div
					key={item}
					className="flex items-center gap-2 rounded-md px-2 py-2"
				>
					<Skeleton className="size-4 rounded-sm" />
					<Skeleton className="h-4 w-32 max-w-full" />
				</div>
			))}
		</div>
	);
}

function OpenGranMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

const filterWorkspaceSources = (
	workspaceSources: WorkspaceSource[],
	query: string,
) => {
	const normalizedQuery = query.trim().toLowerCase();

	if (!normalizedQuery) {
		return workspaceSources;
	}

	return workspaceSources.filter((source) =>
		[source.title, source.preview]
			.join(" ")
			.toLowerCase()
			.includes(normalizedQuery),
	);
};
