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
	Globe,
	Grid3x3,
	type LucideIcon,
	Plus,
	X,
} from "lucide-react";
import type { KeyboardEventHandler } from "react";
import { chatModels } from "@/lib/ai/models";

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
	onToggleSource,
	onClearSelectedSources,
}: ChatComposerProps) {
	const filteredWorkspaceSources = filterWorkspaceSources(
		workspaceSources,
		sourceSearchTerm,
	);
	const hasWorkspaceScopes = selectedSourceIds.length > 0;
	const scopesLabel =
		selectedSourceIds.length === 0
			? "All Sources"
			: selectedSourceIds.length === 1
				? "1 scope"
				: `${selectedSourceIds.length} scopes`;

	return (
		<div className={`mx-auto w-full max-w-xl ${hasMessages ? "mt-auto" : ""}`}>
			<label htmlFor="chat-prompt" className="sr-only">
				Prompt
			</label>
			<InputGroup className="min-h-[176px] max-h-[32rem] overflow-hidden rounded-xl border-border bg-card shadow-sm [--radius:1rem]">
				<InputGroupAddon align="block-start" className="px-4 pt-4 pb-0">
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
											heading={
												shouldSearchDocuments ? "Search results" : "Notes"
											}
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
				</InputGroupAddon>

				<InputGroupTextarea
					id="chat-prompt"
					value={draft}
					onChange={(event) => onDraftChange(event.target.value)}
					onKeyDown={onDraftKeyDown}
					placeholder="Ask, search, or make anything..."
					className="min-h-[92px] max-h-[24rem] overflow-y-auto px-4 pt-2"
				/>

				<InputGroupAddon align="block-end" className="gap-1 px-4 pb-4">
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
						hasWorkspaceScopes={hasWorkspaceScopes}
						webSearchEnabled={webSearchEnabled}
						onWebSearchEnabledChange={onWebSearchEnabledChange}
						appsEnabled={appsEnabled}
						onAppsEnabledChange={onAppsEnabledChange}
						selectedSourceIds={selectedSourceIds}
						sourceSearchTerm={sourceSearchTerm}
						onSourceSearchTermChange={onSourceSearchTermChange}
						filteredWorkspaceSources={filteredWorkspaceSources}
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
	hasWorkspaceScopes,
	webSearchEnabled,
	onWebSearchEnabledChange,
	appsEnabled,
	onAppsEnabledChange,
	selectedSourceIds,
	sourceSearchTerm,
	onSourceSearchTermChange,
	filteredWorkspaceSources,
	isNotesLoading,
	onToggleSource,
	onClearSelectedSources,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scopesLabel: string;
	hasWorkspaceScopes: boolean;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange: (value: boolean) => void;
	appsEnabled: boolean;
	onAppsEnabledChange: (value: boolean) => void;
	selectedSourceIds: string[];
	sourceSearchTerm: string;
	onSourceSearchTermChange: (value: string) => void;
	filteredWorkspaceSources: WorkspaceSource[];
	isNotesLoading: boolean;
	onToggleSource: (sourceId: string) => void;
	onClearSelectedSources: () => void;
}) {
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<InputGroupButton size="sm" className="rounded-full">
							<Globe />
							<span className="max-w-[160px] truncate">{scopesLabel}</span>
						</InputGroupButton>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Select search scope</TooltipContent>
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
							<Globe /> Web Search
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
						<CirclePlus /> All Sources I can access
					</DropdownMenuCheckboxItem>
					<DropdownMenuSub>
						<DropdownMenuSubTrigger
							className={hasWorkspaceScopes ? "[&>svg:last-child]:ml-2!" : ""}
						>
							<span className="flex size-4 items-center justify-center text-muted-foreground">
								<OpenGranMark className="size-4" />
							</span>
							OpenGran
							{hasWorkspaceScopes ? (
								<span className="ml-auto flex items-center gap-2">
									<span className="text-xs text-muted-foreground tabular-nums">
										{selectedSourceIds.length === 1
											? "1 scope"
											: `${selectedSourceIds.length} scopes`}
									</span>
									<Check className="size-4 text-muted-foreground" />
								</span>
							) : null}
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent className="w-72 p-0 [--radius:1rem]">
							<Command>
								<CommandInput
									placeholder="Select a workspace or note"
									value={sourceSearchTerm}
									onValueChange={onSourceSearchTermChange}
								/>
								<CommandList>
									{isNotesLoading ? (
										<CommandGroup heading="Notes">
											<ChatNoteListSkeleton />
										</CommandGroup>
									) : null}
									<CommandEmpty>No sources found.</CommandEmpty>
									<CommandGroup heading="Notes">
										{filteredWorkspaceSources.map((source) => {
											const selected = selectedSourceIds.includes(source.id);

											return (
												<CommandItem
													key={source.id}
													value={`${source.id} ${source.title}`}
													onSelect={() => onToggleSource(source.id)}
													className="gap-2"
												>
													<Grid3x3 className="size-4" />
													<div className="min-w-0">
														<div className="truncate">{source.title}</div>
														{source.preview ? (
															<div className="truncate text-xs text-muted-foreground">
																{source.preview}
															</div>
														) : null}
													</div>
													{selected ? (
														<Check className="ml-auto size-4" />
													) : null}
												</CommandItem>
											);
										})}
									</CommandGroup>
								</CommandList>
							</Command>
						</DropdownMenuSubContent>
					</DropdownMenuSub>
					<DropdownMenuItem>
						<Book /> Help Center
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem>
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
