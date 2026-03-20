import { useChat } from "@ai-sdk/react";
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar";
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
import { Switch } from "@workspace/ui/components/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { DefaultChatTransport } from "ai";
import {
	ArrowUp,
	AtSign,
	BadgeDollarSign,
	BarChart3,
	Book,
	BookOpen,
	CalendarDays,
	Check,
	CirclePlus,
	Globe,
	Grid3x3,
	Lightbulb,
	Plus,
	Target,
	Users,
	X,
} from "lucide-react";
import * as React from "react";
import { ChatMessages } from "@/components/chat/messages";
import { chatModels, fallbackChatModel } from "@/lib/ai/models";

const workspaceSources = [
	{ id: "guidelines", title: "Brand guidelines" },
	{ id: "brief", title: "Launch brief" },
	{ id: "notes", title: "Planning notes" },
	{ id: "faq", title: "Internal FAQ" },
];

const contextPages = [
	{ id: "meeting-notes", title: "Meeting Notes", icon: Book },
	{ id: "project-dashboard", title: "Project Dashboard", icon: BarChart3 },
	{ id: "ideas", title: "Ideas & Brainstorming", icon: Lightbulb },
	{ id: "calendar", title: "Calendar & Events", icon: CalendarDays },
	{ id: "documentation", title: "Documentation", icon: BookOpen },
	{ id: "goals", title: "Goals & Objectives", icon: Target },
	{ id: "budget", title: "Budget Planning", icon: BadgeDollarSign },
	{ id: "team", title: "Team Directory", icon: Users },
];

export function ChatPage() {
	const [draft, setDraft] = React.useState("");
	const [selectedModel, setSelectedModel] = React.useState(fallbackChatModel);
	const [mentionPopoverOpen, setMentionPopoverOpen] = React.useState(false);
	const [documentSearchTerm, setDocumentSearchTerm] = React.useState("");
	const [mentions, setMentions] = React.useState<string[]>([]);
	const [modelPopoverOpen, setModelPopoverOpen] = React.useState(false);
	const [sourcesOpen, setSourcesOpen] = React.useState(false);
	const [sourceSearchTerm, setSourceSearchTerm] = React.useState("");
	const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
	const [appsEnabled, setAppsEnabled] = React.useState(true);
	const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>(
		[],
	);
	const transport = React.useMemo(
		() => new DefaultChatTransport({ api: "/api/chat" }),
		[],
	);
	const { messages, sendMessage, error, status } = useChat({ transport });
	const isLoading = status === "submitted" || status === "streaming";
	const hasMessages = messages.length > 0;
	const shouldSearchDocuments = documentSearchTerm.trim().length > 0;
	const mentionableDocuments = React.useMemo(() => {
		const query = documentSearchTerm.trim().toLowerCase();

		if (!query) {
			return contextPages;
		}

		return contextPages.filter((page) =>
			page.title.toLowerCase().includes(query),
		);
	}, [documentSearchTerm]);
	const scopesLabel =
		selectedSourceIds.length === 0
			? "All Sources"
			: selectedSourceIds.length === 1
				? "1 scope"
				: `${selectedSourceIds.length} scopes`;
	const filteredWorkspaceSources = React.useMemo(() => {
		const query = sourceSearchTerm.trim().toLowerCase();

		if (!query) {
			return workspaceSources;
		}

		return workspaceSources.filter((source) =>
			source.title.toLowerCase().includes(query),
		);
	}, [sourceSearchTerm]);
	const hasWorkspaceScopes = selectedSourceIds.length > 0;
	const emptyStateMessage = shouldSearchDocuments
		? "No pages found."
		: "No pages available.";

	const handleSubmit = () => {
		const value = draft.trim();

		if (!value || isLoading) {
			return;
		}

		void sendMessage(
			{ text: value },
			{
				body: {
					model: selectedModel.model,
					webSearchEnabled,
					appsEnabled,
					mentions,
					selectedSourceIds,
				},
			},
		);
		setDraft("");
	};

	const toggleSource = (sourceId: string) => {
		setSelectedSourceIds((current) =>
			current.includes(sourceId)
				? current.filter((id) => id !== sourceId)
				: [...current, sourceId],
		);
	};

	const addMention = (pageId: string) => {
		setMentions((current) =>
			current.includes(pageId) ? current : [...current, pageId],
		);
		setDocumentSearchTerm("");
		setMentionPopoverOpen(false);
	};

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div
				className={`flex w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4 ${
					hasMessages ? "min-h-0" : "gap-6"
				}`}
			>
				{!hasMessages ? (
					<div className="mx-auto w-full max-w-xl">
						<h1 className="text-lg md:text-xl">Ask anything</h1>
					</div>
				) : null}
				{hasMessages ? (
					<div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col pb-4">
						<ChatMessages
							messages={messages}
							error={error}
							isLoading={isLoading}
						/>
					</div>
				) : null}
				<form
					className={`mx-auto w-full max-w-xl ${hasMessages ? "mt-auto" : ""}`}
					onSubmit={(event) => {
						event.preventDefault();
						handleSubmit();
					}}
				>
					<label htmlFor="chat-prompt" className="sr-only">
						Prompt
					</label>
					<InputGroup className="min-h-[176px] rounded-xl border-border bg-card shadow-sm [--radius:1rem]">
						<InputGroupAddon align="block-start" className="px-4 pt-4 pb-0">
							<Popover
								open={mentionPopoverOpen}
								onOpenChange={setMentionPopoverOpen}
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
											placeholder="Search pages..."
											value={documentSearchTerm}
											onValueChange={setDocumentSearchTerm}
										/>
										<CommandList>
											<CommandEmpty>{emptyStateMessage}</CommandEmpty>
											{mentionableDocuments.length > 0 ? (
												<CommandGroup
													heading={
														shouldSearchDocuments ? "Search results" : "Pages"
													}
												>
													{mentionableDocuments.map((document) => (
														<CommandItem
															key={document.id}
															value={`${document.id} ${document.title}`}
															onSelect={() => addMention(document.id)}
														>
															<document.icon />
															{document.title}
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
											onClick={() => {
												setMentions((current) =>
													current.filter((id) => id !== mentionId),
												);
											}}
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
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Ask, search, or make anything..."
							className="min-h-[92px] px-4 pt-2"
						/>
						<InputGroupAddon align="block-end" className="gap-1 px-4 pb-4">
							<DropdownMenu
								open={modelPopoverOpen}
								onOpenChange={setModelPopoverOpen}
							>
								<Tooltip>
									<TooltipTrigger asChild>
										<DropdownMenuTrigger asChild>
											<InputGroupButton size="sm" className="rounded-full">
												{selectedModel.name}
											</InputGroupButton>
										</DropdownMenuTrigger>
									</TooltipTrigger>
									<TooltipContent>Select model</TooltipContent>
								</Tooltip>
								<DropdownMenuContent
									side="top"
									align="start"
									className="[--radius:1rem]"
								>
									<DropdownMenuGroup className="w-42">
										<DropdownMenuLabel className="text-muted-foreground text-xs">
											Select model
										</DropdownMenuLabel>
										{chatModels.map((model) => (
											<DropdownMenuCheckboxItem
												key={model.id}
												checked={model.id === selectedModel.id}
												onCheckedChange={(checked) => {
													if (checked) {
														setSelectedModel(model);
													}
												}}
												className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
											>
												{model.name}
											</DropdownMenuCheckboxItem>
										))}
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
							<DropdownMenu open={sourcesOpen} onOpenChange={setSourcesOpen}>
								<Tooltip>
									<TooltipTrigger asChild>
										<DropdownMenuTrigger asChild>
											<InputGroupButton size="sm" className="rounded-full">
												<Globe />
												<span className="max-w-[160px] truncate">
													{scopesLabel}
												</span>
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
													onCheckedChange={setWebSearchEnabled}
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
													onCheckedChange={setAppsEnabled}
												/>
											</label>
										</DropdownMenuItem>
										<DropdownMenuCheckboxItem
											checked={selectedSourceIds.length === 0}
											className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
											onCheckedChange={(checked) => {
												if (checked) {
													setSelectedSourceIds([]);
												}
											}}
										>
											<CirclePlus /> All Sources I can access
										</DropdownMenuCheckboxItem>
										<DropdownMenuSub>
											<DropdownMenuSubTrigger
												className={
													hasWorkspaceScopes ? "[&>svg:last-child]:ml-2!" : ""
												}
											>
												<Avatar className="size-4">
													<AvatarFallback className="text-[10px]">
														OM
													</AvatarFallback>
												</Avatar>
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
														placeholder="Select a workspace or page"
														autoFocus
														value={sourceSearchTerm}
														onValueChange={setSourceSearchTerm}
													/>
													<CommandList>
														<CommandEmpty>No sources found.</CommandEmpty>
														<CommandGroup heading="Pages">
															{filteredWorkspaceSources.map((source) => {
																const selected = selectedSourceIds.includes(
																	source.id,
																);

																return (
																	<CommandItem
																		key={source.id}
																		value={`${source.id} ${source.title}`}
																		onSelect={() => toggleSource(source.id)}
																		className="gap-2"
																	>
																		<Grid3x3 className="size-4" />
																		<span className="truncate">
																			{source.title}
																		</span>
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
							<InputGroupButton
								aria-label="Send"
								className="ml-auto rounded-full"
								variant="default"
								size="icon-sm"
								disabled={!draft.trim() || isLoading}
								onClick={handleSubmit}
							>
								<ArrowUp className="size-4" />
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
				</form>
			</div>
		</div>
	);
}
