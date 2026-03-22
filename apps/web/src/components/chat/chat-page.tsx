import { useChat } from "@ai-sdk/react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
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
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@workspace/ui/components/empty";
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
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowUp,
	AtSign,
	Book,
	Check,
	CirclePlus,
	FileText,
	Globe,
	Grid3x3,
	MessageCircle,
	MoreHorizontal,
	Plus,
	Trash2,
	X,
} from "lucide-react";
import * as React from "react";
import { ChatMessages } from "@/components/chat/messages";
import { chatModels, fallbackChatModel } from "@/lib/ai/models";
import { authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";

export function ChatPage({
	chatId,
	initialMessages,
	onChatPersisted,
	chats,
	isChatsLoading,
	activeChatId,
	onOpenChat,
	onChatRemoved,
}: {
	chatId: string;
	initialMessages: UIMessage[];
	onChatPersisted?: (chatId: string) => void;
	chats: Array<Doc<"chats">>;
	isChatsLoading: boolean;
	activeChatId: string | null;
	onOpenChat: (chatId: string) => void;
	onChatRemoved: (chatId: string) => void;
}) {
	const [draft, setDraft] = React.useState("");
	const [confirmTrashChatId, setConfirmTrashChatId] = React.useState<
		string | null
	>(null);
	const [selectedModel, setSelectedModel] = React.useState(fallbackChatModel);
	const [mentionPopoverOpen, setMentionPopoverOpen] = React.useState(false);
	const [documentSearchTerm, setDocumentSearchTerm] = React.useState("");
	const [mentions, setMentions] = React.useState<string[]>([]);
	const [modelPopoverOpen, setModelPopoverOpen] = React.useState(false);
	const [sourcesOpen, setSourcesOpen] = React.useState(false);
	const [sourceSearchTerm, setSourceSearchTerm] = React.useState("");
	const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
	const [appsEnabled, setAppsEnabled] = React.useState(true);
	const [isPreparingRequest, setIsPreparingRequest] = React.useState(false);
	const [isMovingChatToTrash, setIsMovingChatToTrash] = React.useState(false);
	const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>(
		[],
	);
	const notes = useQuery(api.notes.list, {});
	const moveChatToTrash = useMutation(
		api.chats.moveToTrash,
	).withOptimisticUpdate((localStore, args) => {
		const currentChats = localStore.getQuery(api.chats.list, {});

		if (currentChats !== undefined) {
			localStore.setQuery(
				api.chats.list,
				{},
				currentChats.filter((chat) => getChatId(chat) !== args.chatId),
			);
		}

		const currentMessages = localStore.getQuery(api.chats.getMessages, {
			chatId: args.chatId,
		});

		if (currentMessages !== undefined) {
			localStore.setQuery(api.chats.getMessages, { chatId: args.chatId }, []);
		}
	});
	const transport = React.useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				prepareSendMessagesRequest: ({
					id,
					messages,
					body,
					headers,
					credentials,
				}) => ({
					api: "/api/chat",
					headers,
					credentials,
					body: body?.convexToken
						? {
								...body,
								id,
								message: messages[messages.length - 1],
							}
						: {
								...body,
								id,
								messages,
							},
				}),
			}),
		[],
	);
	const { messages, setMessages, sendMessage, error, status } = useChat({
		id: chatId,
		messages: initialMessages,
		transport,
	});
	React.useEffect(() => {
		if (initialMessages.length === 0) {
			return;
		}

		setMessages((currentMessages) =>
			currentMessages.length === 0 ? initialMessages : currentMessages,
		);
	}, [initialMessages, setMessages]);
	const isLoading =
		status === "submitted" || status === "streaming" || isPreparingRequest;
	const hasMessages = messages.length > 0;
	const isNotesLoading = notes === undefined;
	const contextPages = React.useMemo(
		() =>
			(notes ?? []).map((note) => ({
				id: note._id,
				title: note.title.trim() || "New note",
				icon: FileText,
				preview: note.searchableText.trim(),
			})),
		[notes],
	);
	const shouldSearchDocuments = documentSearchTerm.trim().length > 0;
	const mentionableDocuments = React.useMemo(() => {
		const query = documentSearchTerm.trim().toLowerCase();

		if (!query) {
			return contextPages;
		}

		return contextPages.filter((page) =>
			[page.title, page.preview].join(" ").toLowerCase().includes(query),
		);
	}, [contextPages, documentSearchTerm]);
	const workspaceSources = React.useMemo(
		() =>
			contextPages.map((page) => ({
				id: page.id,
				title: page.title,
				preview: page.preview,
			})),
		[contextPages],
	);
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
			[source.title, source.preview].join(" ").toLowerCase().includes(query),
		);
	}, [sourceSearchTerm, workspaceSources]);
	const hasWorkspaceScopes = selectedSourceIds.length > 0;
	const emptyStateMessage = shouldSearchDocuments
		? "No notes found."
		: "No notes available.";
	const groupedChats = React.useMemo(() => groupChatsByDate(chats), [chats]);
	const chatSections = [
		{ key: "today", label: "Today", chats: groupedChats.today },
		{ key: "yesterday", label: "Yesterday", chats: groupedChats.yesterday },
		{ key: "lastWeek", label: "Last 7 days", chats: groupedChats.lastWeek },
		{
			key: "lastMonth",
			label: "Last 30 days",
			chats: groupedChats.lastMonth,
		},
		{ key: "older", label: "Older", chats: groupedChats.older },
	] as const;

	const handleSubmit = async () => {
		const value = draft.trim();

		if (!value || isLoading) {
			return;
		}

		setIsPreparingRequest(true);

		try {
			const { data } = await authClient.convex.token({
				fetchOptions: { throw: false },
			});
			onChatPersisted?.(chatId);

			void sendMessage(
				{ text: value },
				{
					body: {
						model: selectedModel.model,
						webSearchEnabled,
						appsEnabled,
						mentions,
						selectedSourceIds,
						convexToken: data?.token ?? null,
					},
				},
			);
			setDraft("");
		} finally {
			setIsPreparingRequest(false);
		}
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

	const handleDraftKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
	) => {
		if (
			event.key !== "Enter" ||
			event.shiftKey ||
			event.nativeEvent.isComposing
		) {
			return;
		}

		event.preventDefault();
		handleSubmit();
	};

	const handleMoveChatToTrash = React.useCallback(() => {
		if (!confirmTrashChatId || isMovingChatToTrash) {
			return;
		}

		setIsMovingChatToTrash(true);

		void moveChatToTrash({ chatId: confirmTrashChatId })
			.then(() => {
				onChatRemoved(confirmTrashChatId);
				setConfirmTrashChatId(null);
			})
			.catch((error) => {
				console.error("Failed to move chat to trash", error);
			})
			.finally(() => {
				setIsMovingChatToTrash(false);
			});
	}, [confirmTrashChatId, isMovingChatToTrash, moveChatToTrash, onChatRemoved]);

	return (
		<>
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
					<div
						className={`mx-auto w-full max-w-xl ${hasMessages ? "mt-auto" : ""}`}
					>
						<label htmlFor="chat-prompt" className="sr-only">
							Prompt
						</label>
						<InputGroup className="min-h-[176px] max-h-[32rem] overflow-hidden rounded-xl border-border bg-card shadow-sm [--radius:1rem]">
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

									<PopoverContent
										className="p-0 [--radius:1.2rem]"
										align="start"
									>
										<Command>
											<CommandInput
												placeholder="Search notes..."
												value={documentSearchTerm}
												onValueChange={setDocumentSearchTerm}
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
																onSelect={() => addMention(document.id)}
															>
																<document.icon />
																<span className="truncate">
																	{document.title}
																</span>
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
								onKeyDown={handleDraftKeyDown}
								placeholder="Ask, search, or make anything..."
								className="min-h-[92px] max-h-[24rem] overflow-y-auto px-4 pt-2"
							/>
							<InputGroupAddon align="block-end" className="gap-1 px-4 pb-4">
								<DropdownMenu
									open={modelPopoverOpen}
									onOpenChange={setModelPopoverOpen}
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<DropdownMenuTrigger asChild>
												<InputGroupButton
													size="sm"
													className="rounded-full gap-2"
												>
													<Icons.codexLogo className="size-3.5 text-muted-foreground" />
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
												OpenAI
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
													<span className="inline-flex items-center gap-2">
														<Icons.codexLogo className="size-3.5 text-muted-foreground" />
														{model.name}
													</span>
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
															onValueChange={setSourceSearchTerm}
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
																			<div className="min-w-0">
																				<div className="truncate">
																					{source.title}
																				</div>
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
								<InputGroupButton
									aria-label="Send"
									className="ml-auto rounded-full"
									variant="default"
									size="icon-sm"
									disabled={!draft.trim() || isLoading}
									onClick={() => {
										void handleSubmit();
									}}
								>
									<ArrowUp className="size-4" />
								</InputGroupButton>
							</InputGroupAddon>
						</InputGroup>
					</div>
					{!hasMessages ? (
						<div className="mx-auto mt-6 w-full max-w-xl">
							{isChatsLoading ? (
								<ChatHistorySkeleton />
							) : chats.length > 0 ? (
								<div className="space-y-1">
									{chatSections.map((section) => {
										if (section.chats.length === 0) {
											return null;
										}

										return (
											<div key={section.key} className="space-y-2">
												<div className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-foreground/70">
													{section.label}
												</div>
												<div className="space-y-2">
													{section.chats.map((chat) => {
														const storedChatId = getChatId(chat);
														const preview =
															chat.authorName?.trim() || "Unknown user";

														return (
															<div
																key={chat._id}
																className={cn(
																	"group flex items-center rounded-xl p-1 transition-colors hover:bg-card/50 has-[[data-chat-actions]:focus-visible]:bg-transparent has-[[data-chat-actions]:hover]:bg-transparent",
																	activeChatId === storedChatId
																		? "bg-transparent"
																		: "bg-transparent",
																)}
															>
																<button
																	type="button"
																	onClick={() => onOpenChat(storedChatId)}
																	className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1 text-left"
																>
																	<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
																		<MessageCircle className="size-4" />
																	</div>
																	<div className="min-w-0 flex-1">
																		<div className="truncate text-sm font-medium">
																			{chat.title || "New chat"}
																		</div>
																		<div className="truncate text-xs text-muted-foreground">
																			{preview}
																		</div>
																	</div>
																</button>
																<DropdownMenu>
																	<DropdownMenuTrigger asChild>
																		<button
																			type="button"
																			data-chat-actions
																			className="flex aspect-square size-5 cursor-pointer items-center justify-center rounded-md p-0 text-muted-foreground opacity-0 outline-hidden transition-[color,opacity] group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
																			aria-label={`Open actions for ${chat.title || "chat"}`}
																			onClick={(event) =>
																				event.stopPropagation()
																			}
																		>
																			<MoreHorizontal className="size-4" />
																		</button>
																	</DropdownMenuTrigger>
																	<DropdownMenuContent align="end">
																		<DropdownMenuItem
																			variant="destructive"
																			className="cursor-pointer"
																			onSelect={(event) => {
																				event.preventDefault();
																				setConfirmTrashChatId(storedChatId);
																			}}
																		>
																			<Trash2 />
																			Move to trash
																		</DropdownMenuItem>
																	</DropdownMenuContent>
																</DropdownMenu>
															</div>
														);
													})}
												</div>
											</div>
										);
									})}
								</div>
							) : (
								<Empty className="max-w-xl">
									<EmptyHeader>
										<EmptyTitle>No chats yet</EmptyTitle>
										<EmptyDescription>
											Start a conversation and it will show up here
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							)}
						</div>
					) : null}
				</div>
			</div>
			<AlertDialog
				open={confirmTrashChatId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setConfirmTrashChatId(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Move chat to trash?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes the chat from the list. You can restore it later from
							Trash.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isMovingChatToTrash}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
							onClick={handleMoveChatToTrash}
							disabled={isMovingChatToTrash}
						>
							{isMovingChatToTrash ? "Moving..." : "Move to trash"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

type GroupedChats = {
	today: Array<Doc<"chats">>;
	yesterday: Array<Doc<"chats">>;
	lastWeek: Array<Doc<"chats">>;
	lastMonth: Array<Doc<"chats">>;
	older: Array<Doc<"chats">>;
};

const isSameCalendarDay = (left: Date, right: Date) =>
	left.getFullYear() === right.getFullYear() &&
	left.getMonth() === right.getMonth() &&
	left.getDate() === right.getDate();

const groupChatsByDate = (chats: Array<Doc<"chats">>): GroupedChats => {
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
	const oneMonthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

	return chats.reduce<GroupedChats>(
		(groups, chat) => {
			const chatDate = new Date(
				chat.updatedAt || chat.createdAt || chat._creationTime,
			);

			if (isSameCalendarDay(chatDate, now)) {
				groups.today.push(chat);
			} else if (isSameCalendarDay(chatDate, yesterday)) {
				groups.yesterday.push(chat);
			} else if (chatDate.getTime() > oneWeekAgo) {
				groups.lastWeek.push(chat);
			} else if (chatDate.getTime() > oneMonthAgo) {
				groups.lastMonth.push(chat);
			} else {
				groups.older.push(chat);
			}

			return groups;
		},
		{
			today: [],
			yesterday: [],
			lastWeek: [],
			lastMonth: [],
			older: [],
		},
	);
};

function ChatHistorySkeleton() {
	return (
		<div className="space-y-3">
			<div className="space-y-2">
				{["chat-history-1", "chat-history-2", "chat-history-3"].map((id) => (
					<div key={id} className="flex items-center gap-3 rounded-xl p-2">
						<Skeleton className="size-8 rounded-lg" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-52" />
						</div>
					</div>
				))}
			</div>
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
