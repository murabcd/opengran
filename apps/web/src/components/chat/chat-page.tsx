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
import { Button } from "@workspace/ui/components/button";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, FileText } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ChatMessages } from "@/components/chat/messages";
import { COMPOSER_DOCK_WRAPPER_CLASS } from "@/components/layout/composer-dock";
import { PageTitle } from "@/components/layout/page-title";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { useLinkedAccounts } from "@/hooks/use-linked-accounts";
import { useStickyScrollToBottom } from "@/hooks/use-sticky-scroll-to-bottom";
import { chatModels, defaultChatModel, findChatModel } from "@/lib/ai/models";
import { authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
import { getChatText } from "@/lib/chat-message";
import { getUIMessageSeedKey, toStoredChatMessages } from "@/lib/chat-snapshot";
import { getMessagesBefore } from "@/lib/chat-thread";
import { getCachedConvexToken, prefetchConvexToken } from "@/lib/convex-token";
import {
	GOOGLE_CALENDAR_SCOPE,
	GOOGLE_CALENDAR_SOURCE_ID,
	GOOGLE_DRIVE_SCOPE,
	GOOGLE_DRIVE_SOURCE_ID,
	getGoogleLinkedAccount,
	hasGoogleScope,
} from "@/lib/google-integrations";
import { getNoteDisplayTitle } from "@/lib/note-title";
import type { WorkspaceRecord } from "@/lib/workspaces";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { ChatComposer } from "./chat-composer";
import { ChatHistoryList } from "./chat-history-list";

type ChatPageProps = {
	chatId: string;
	initialMessages: UIMessage[];
	isInitialMessagesLoading?: boolean;
	onChatPersisted?: (chatId: string) => void;
	chats: Array<Doc<"chats">>;
	isChatsLoading: boolean;
	activeChatId: string | null;
	onOpenChat: (chatId: string) => void;
	onPrefetchChat: (chatId: string) => void;
	onChatRemoved: (chatId: string) => void;
	activeWorkspace: WorkspaceRecord | null;
	isDesktopMac: boolean;
	onOpenConnectionsSettings: () => void;
	onCreateNoteFromResponse?: (
		title: string,
		content: string,
	) => Promise<"created" | undefined> | "created" | undefined;
};

const getLatestUserMessageText = (messages: UIMessage[]) => {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];

		if (message?.role !== "user") {
			continue;
		}

		const text = getChatText(message);
		if (text) {
			return text;
		}
	}

	return "";
};

const useChatPageController = ({
	chatId,
	initialMessages,
	onChatPersisted,
	chats,
	onChatRemoved,
	activeWorkspace,
}: Pick<
	ChatPageProps,
	| "chatId"
	| "initialMessages"
	| "onChatPersisted"
	| "chats"
	| "onChatRemoved"
	| "activeWorkspace"
>) => {
	const activeWorkspaceId = useActiveWorkspaceId();
	const { data: session } = authClient.useSession();
	const { accounts } = useLinkedAccounts(session?.user);
	const [draft, setDraft] = React.useState("");
	const [confirmTrashChatId, setConfirmTrashChatId] = React.useState<
		string | null
	>(null);
	const [selectedModel, setSelectedModel] = React.useState(
		defaultChatModel ?? chatModels[0],
	);
	const [mentionPopoverOpen, setMentionPopoverOpen] = React.useState(false);
	const [documentSearchTerm, setDocumentSearchTerm] = React.useState("");
	const [mentions, setMentions] = React.useState<string[]>([]);
	const [modelPopoverOpen, setModelPopoverOpen] = React.useState(false);
	const [sourcesOpen, setSourcesOpen] = React.useState(false);
	const [sourceSearchTerm, setSourceSearchTerm] = React.useState("");
	const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
	const [appsEnabled, setAppsEnabled] = React.useState(true);
	const [editingMessageId, setEditingMessageId] = React.useState<string | null>(
		null,
	);
	const [isPreparingRequest, setIsPreparingRequest] = React.useState(false);
	const [isMovingChatToTrash, setIsMovingChatToTrash] = React.useState(false);
	const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>(
		[],
	);
	const workspaceSourceId = activeWorkspaceId
		? `workspace:${activeWorkspaceId}`
		: null;
	const notes = useQuery(
		api.notes.list,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const appSources = useQuery(
		api.appConnections.listSources,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const googleAccount = React.useMemo(
		() => getGoogleLinkedAccount(accounts),
		[accounts],
	);
	const googleAppSources = React.useMemo(() => {
		if (!googleAccount) {
			return [];
		}

		const sources = [];

		if (hasGoogleScope(googleAccount, GOOGLE_CALENDAR_SCOPE)) {
			sources.push({
				id: GOOGLE_CALENDAR_SOURCE_ID,
				title: "Google Calendar",
				preview: "Google account",
				provider: "google-calendar" as const,
			});
		}

		if (hasGoogleScope(googleAccount, GOOGLE_DRIVE_SCOPE)) {
			sources.push({
				id: GOOGLE_DRIVE_SOURCE_ID,
				title: "Google Drive",
				preview: "Google account",
				provider: "google-drive" as const,
			});
		}

		return sources;
	}, [googleAccount]);
	const mergedAppSources = React.useMemo(
		() => [...googleAppSources, ...(appSources ?? [])],
		[appSources, googleAppSources],
	);
	React.useEffect(() => {
		void activeWorkspaceId;
		setSelectedSourceIds([]);
	}, [activeWorkspaceId]);
	const moveChatToTrash = useMutation(
		api.chats.moveToTrash,
	).withOptimisticUpdate((localStore, args) => {
		const currentChats = localStore.getQuery(api.chats.list, {
			workspaceId: args.workspaceId,
		});

		if (currentChats !== undefined) {
			localStore.setQuery(
				api.chats.list,
				{ workspaceId: args.workspaceId },
				currentChats.filter((chat) => getChatId(chat) !== args.chatId),
			);
		}

		const currentMessages = localStore.getQuery(api.chats.getMessages, {
			workspaceId: args.workspaceId,
			chatId: args.chatId,
		});

		if (currentMessages !== undefined) {
			localStore.setQuery(
				api.chats.getMessages,
				{ workspaceId: args.workspaceId, chatId: args.chatId },
				[],
			);
		}
	});
	const truncateFromMessage = useMutation(api.chats.truncateFromMessage);
	const storedMessages = useQuery(
		api.chats.getMessages,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId, chatId } : "skip",
	);
	const runningAutomationRun = useQuery(
		api.automations.getRunningRunForChat,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId, chatId } : "skip",
	);
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
					trigger,
					messageId,
				}) => ({
					api: "/api/chat",
					headers,
					credentials,
					body: {
						...body,
						id,
						message: messages[messages.length - 1],
						trigger,
						messageId,
						workspaceId: activeWorkspaceId,
					},
				}),
			}),
		[activeWorkspaceId],
	);
	const {
		messages,
		setMessages,
		sendMessage,
		regenerate,
		error,
		status,
		stop,
	} = useChat({
		id: chatId,
		messages: initialMessages,
		transport,
	});
	const persistedMessages = React.useMemo(
		() =>
			storedMessages === undefined
				? initialMessages
				: toStoredChatMessages(storedMessages),
		[initialMessages, storedMessages],
	);

	React.useEffect(() => {
		if (!activeWorkspaceId) {
			return;
		}

		void prefetchConvexToken();
	}, [activeWorkspaceId]);
	const persistedMessagesSeedKey = React.useMemo(
		() => getUIMessageSeedKey(persistedMessages),
		[persistedMessages],
	);
	const appliedPersistedMessagesSeedKeyRef = React.useRef(
		persistedMessagesSeedKey,
	);

	React.useEffect(() => {
		setMessages((currentMessages) => {
			const currentMessagesSeedKey = getUIMessageSeedKey(currentMessages);
			const isLocalRequestRunning =
				status === "submitted" || status === "streaming" || isPreparingRequest;
			const shouldUsePersistedMessages =
				currentMessages.length === 0 ||
				currentMessagesSeedKey === appliedPersistedMessagesSeedKeyRef.current ||
				(!isLocalRequestRunning &&
					persistedMessages.length > currentMessages.length);

			if (shouldUsePersistedMessages) {
				appliedPersistedMessagesSeedKeyRef.current = persistedMessagesSeedKey;
				return persistedMessages;
			}

			return currentMessages;
		});
	}, [
		isPreparingRequest,
		persistedMessages,
		persistedMessagesSeedKey,
		setMessages,
		status,
	]);

	const isLocalChatLoading =
		status === "submitted" || status === "streaming" || isPreparingRequest;
	const isAutomationRunning = Boolean(runningAutomationRun);
	const isLoading = isLocalChatLoading || isAutomationRunning;
	const hasMessages = messages.length > 0 || isAutomationRunning;
	const isNotesLoading = notes === undefined;
	const currentChat = React.useMemo(
		() => chats.find((chat) => getChatId(chat) === chatId) ?? null,
		[chats, chatId],
	);

	React.useEffect(() => {
		if (!currentChat?.model) {
			setSelectedModel(defaultChatModel);
			return;
		}

		const model = findChatModel(currentChat.model);

		if (model) {
			setSelectedModel(model);
		}
	}, [currentChat?.model]);

	const contextPages = React.useMemo(
		() =>
			(notes ?? []).map((note) => ({
				id: note._id,
				title: getNoteDisplayTitle(note.title),
				icon: FileText,
				preview: note.searchableText.trim(),
			})),
		[notes],
	);
	const workspaceSources = React.useMemo(
		() =>
			contextPages.map((page) => ({
				id: page.id,
				title: page.title,
				preview: page.preview,
			})),
		[contextPages],
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

	const handleSubmit = React.useCallback(async () => {
		const value = draft.trim();

		if (!value || isLoading) {
			return;
		}

		setIsPreparingRequest(true);

		try {
			const convexToken = await getCachedConvexToken();
			onChatPersisted?.(chatId);
			const nextOutgoingMessage = editingMessageId
				? {
						messageId: editingMessageId,
						text: value,
					}
				: { text: value };

			void sendMessage(nextOutgoingMessage, {
				body: {
					model: selectedModel.model,
					webSearchEnabled,
					appsEnabled,
					mentions,
					selectedSourceIds,
					workspaceId: activeWorkspaceId,
					convexToken,
				},
			});
			setEditingMessageId(null);
			setDraft("");
		} finally {
			setIsPreparingRequest(false);
		}
	}, [
		activeWorkspaceId,
		appsEnabled,
		chatId,
		draft,
		editingMessageId,
		isLoading,
		mentions,
		onChatPersisted,
		selectedModel.model,
		selectedSourceIds,
		sendMessage,
		webSearchEnabled,
	]);

	const handleDraftKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (
				event.key !== "Enter" ||
				event.shiftKey ||
				event.nativeEvent.isComposing
			) {
				return;
			}

			event.preventDefault();
			void handleSubmit();
		},
		[handleSubmit],
	);

	const handleMoveChatToTrash = React.useCallback(() => {
		if (!confirmTrashChatId || !activeWorkspaceId || isMovingChatToTrash) {
			return;
		}

		setIsMovingChatToTrash(true);

		void moveChatToTrash({
			workspaceId: activeWorkspaceId,
			chatId: confirmTrashChatId,
		})
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
	}, [
		activeWorkspaceId,
		confirmTrashChatId,
		isMovingChatToTrash,
		moveChatToTrash,
		onChatRemoved,
	]);

	const handleWebSearchEnabledChange = React.useCallback((enabled: boolean) => {
		setWebSearchEnabled((current) => {
			if (current === enabled) {
				return current;
			}

			toast.success(enabled ? "Web search enabled" : "Web search disabled");
			return enabled;
		});
	}, []);

	const handleEditMessage = React.useCallback(
		(messageId: string, text: string) => {
			if (isLoading) {
				stop();
			}

			setEditingMessageId(messageId);
			setDraft(text);
		},
		[isLoading, stop],
	);

	const handleCancelEdit = React.useCallback(() => {
		setEditingMessageId(null);
		setDraft("");
	}, []);

	const buildRequestBody = React.useCallback(async () => {
		const convexToken = await getCachedConvexToken();

		return {
			model: selectedModel.model,
			webSearchEnabled,
			appsEnabled,
			mentions,
			selectedSourceIds,
			workspaceId: activeWorkspaceId,
			convexToken,
		};
	}, [
		activeWorkspaceId,
		appsEnabled,
		mentions,
		selectedModel.model,
		selectedSourceIds,
		webSearchEnabled,
	]);

	const handleDeleteMessage = React.useCallback(
		(messageId: string) => {
			if (isLoading) {
				stop();
			}

			setMessages((currentMessages) =>
				getMessagesBefore(currentMessages, messageId),
			);
			setEditingMessageId(null);
			setDraft("");

			if (!activeWorkspaceId) {
				return;
			}

			void truncateFromMessage({
				workspaceId: activeWorkspaceId,
				chatId,
				messageId,
			}).catch((error) => {
				console.error("Failed to delete message", error);
				toast.error("Failed to delete message");
			});
		},
		[
			activeWorkspaceId,
			chatId,
			isLoading,
			setMessages,
			stop,
			truncateFromMessage,
		],
	);

	const handleRegenerateMessage = React.useCallback(
		async (assistantMessageId: string) => {
			if (isLoading) {
				stop();
			}

			setIsPreparingRequest(true);

			try {
				const requestBody = await buildRequestBody();
				setEditingMessageId(null);
				setDraft("");
				void regenerate({
					messageId: assistantMessageId,
					body: requestBody,
				});
			} finally {
				setIsPreparingRequest(false);
			}
		},
		[buildRequestBody, isLoading, regenerate, stop],
	);

	return {
		appsEnabled,
		confirmTrashChatId,
		contextPages,
		currentChatTitle: currentChat?.title ?? "",
		draft,
		error,
		activeWorkspace,
		handleClearSelectedSources: () => setSelectedSourceIds([]),
		handleDraftKeyDown,
		handleMoveChatToTrash,
		handleSubmit,
		handleWebSearchEnabledChange,
		hasMessages,
		isLoading,
		isMovingChatToTrash,
		isNotesLoading,
		mentionPopoverOpen,
		mentionableDocuments,
		messages,
		modelPopoverOpen,
		selectedModel,
		selectedSourceIds,
		workspaceSourceId,
		setAppsEnabled,
		setConfirmTrashChatId,
		setDocumentSearchTerm,
		setDraft,
		setMentionPopoverOpen,
		setMentions,
		setModelPopoverOpen,
		setSelectedModel,
		setSourceSearchTerm,
		setSourcesOpen,
		stop,
		shouldSearchDocuments,
		sourceSearchTerm,
		sourcesOpen,
		webSearchEnabled,
		workspaceSources,
		appSources: mergedAppSources,
		documentSearchTerm,
		editingMessageId,
		mentions,
		handleCancelEdit,
		onDeleteMessage: handleDeleteMessage,
		onAddMention: (pageId: string) => {
			setMentions((current) =>
				current.includes(pageId) ? current : [...current, pageId],
			);
			setDocumentSearchTerm("");
			setMentionPopoverOpen(false);
		},
		onRemoveMention: (pageId: string) => {
			setMentions((current) => current.filter((id) => id !== pageId));
		},
		onToggleSource: (sourceId: string) => {
			setSelectedSourceIds((current) => {
				if (sourceId.startsWith("workspace:")) {
					return current.includes(sourceId)
						? current.filter((id) => id !== sourceId)
						: current.filter((id) => id.startsWith("app:")).concat(sourceId);
				}

				if (sourceId.startsWith("app:")) {
					return current.includes(sourceId)
						? current.filter((id) => id !== sourceId)
						: [
								...current.filter((id) => !id.startsWith("workspace:")),
								sourceId,
							];
				}

				return current.includes(sourceId)
					? current.filter((id) => id !== sourceId)
					: [...current.filter((id) => !id.startsWith("workspace:")), sourceId];
			});
		},
		onEditMessage: handleEditMessage,
		onRegenerateMessage: handleRegenerateMessage,
	};
};

export function ChatPage({
	chatId,
	initialMessages,
	onChatPersisted,
	chats,
	isChatsLoading,
	activeChatId,
	onOpenChat,
	onPrefetchChat,
	onChatRemoved,
	activeWorkspace,
	isDesktopMac,
	onOpenConnectionsSettings,
	onCreateNoteFromResponse,
}: ChatPageProps) {
	const controller = useChatPageController({
		chatId,
		initialMessages,
		onChatPersisted,
		chats,
		onChatRemoved,
		activeWorkspace,
	});
	const {
		containerRef,
		isAtBottom: isChatViewportAtBottom,
		scrollToBottom: scrollChatToBottom,
	} = useStickyScrollToBottom();
	const handleCreateNoteFromResponse = React.useCallback(
		(content: string) => {
			if (!onCreateNoteFromResponse) {
				return undefined;
			}

			const title =
				controller.currentChatTitle.trim() ||
				getLatestUserMessageText(controller.messages) ||
				"New note";

			return onCreateNoteFromResponse(title, content);
		},
		[
			controller.currentChatTitle,
			controller.messages,
			onCreateNoteFromResponse,
		],
	);
	const shouldShowActiveChatSurface =
		controller.hasMessages || activeChatId === chatId;
	// Web chat uses a 4rem shell header, while the native mac shell keeps a
	// taller md offset. Matching the shell height keeps short-chat docks flush.
	const chatSurfaceMinHeightClass = isDesktopMac
		? "min-h-[calc(100dvh-4rem)] md:min-h-[calc(100dvh-5rem)]"
		: "min-h-[calc(100dvh-4rem)] md:min-h-[calc(100dvh-4rem)]";
	const composer = (
		<ChatComposer
			useCompactLayout={shouldShowActiveChatSurface}
			draft={controller.draft}
			topAccessory={
				controller.hasMessages && !isChatViewportAtBottom ? (
					<Button
						type="button"
						variant="secondary"
						size="icon"
						className="size-9 rounded-full border border-border/60 shadow-md"
						onClick={() => scrollChatToBottom()}
						aria-label="Scroll to latest messages"
					>
						<ArrowDown className="size-4" />
					</Button>
				) : undefined
			}
			onDraftChange={controller.setDraft}
			onDraftKeyDown={controller.handleDraftKeyDown}
			onSubmit={controller.handleSubmit}
			onStop={controller.stop}
			isLoading={controller.isLoading}
			selectedModel={controller.selectedModel}
			modelPopoverOpen={controller.modelPopoverOpen}
			onModelPopoverOpenChange={controller.setModelPopoverOpen}
			onSelectedModelChange={controller.setSelectedModel}
			mentionPopoverOpen={controller.mentionPopoverOpen}
			onMentionPopoverOpenChange={controller.setMentionPopoverOpen}
			documentSearchTerm={controller.documentSearchTerm}
			onDocumentSearchTermChange={controller.setDocumentSearchTerm}
			mentions={controller.mentions}
			contextPages={controller.contextPages}
			mentionableDocuments={controller.mentionableDocuments}
			isNotesLoading={controller.isNotesLoading}
			emptyStateMessage={
				controller.shouldSearchDocuments
					? "No notes found."
					: "No notes available."
			}
			shouldSearchDocuments={controller.shouldSearchDocuments}
			onAddMention={controller.onAddMention}
			onRemoveMention={controller.onRemoveMention}
			sourcesOpen={controller.sourcesOpen}
			onSourcesOpenChange={controller.setSourcesOpen}
			webSearchEnabled={controller.webSearchEnabled}
			onWebSearchEnabledChange={controller.handleWebSearchEnabledChange}
			appsEnabled={controller.appsEnabled}
			onAppsEnabledChange={controller.setAppsEnabled}
			sourceSearchTerm={controller.sourceSearchTerm}
			onSourceSearchTermChange={controller.setSourceSearchTerm}
			selectedSourceIds={controller.selectedSourceIds}
			workspaceSources={controller.workspaceSources}
			workspaceSourceId={controller.workspaceSourceId}
			activeWorkspace={controller.activeWorkspace}
			appSources={controller.appSources}
			onToggleSource={controller.onToggleSource}
			onClearSelectedSources={controller.handleClearSelectedSources}
			onOpenConnectionsSettings={onOpenConnectionsSettings}
			editingMessageId={controller.editingMessageId}
			onCancelEdit={controller.handleCancelEdit}
		/>
	);

	return (
		<>
			<ScrollArea
				className="min-h-0 flex-1"
				viewportClassName="overscroll-contain"
				viewportRef={controller.hasMessages ? containerRef : undefined}
			>
				<div className="flex min-h-0 flex-1 justify-center px-4 md:px-6">
					<div
						className={cn(
							"flex min-h-0 w-full max-w-5xl flex-1 flex-col",
							isDesktopMac ? "pt-2 md:pt-4" : "pt-0",
						)}
					>
						{shouldShowActiveChatSurface ? (
							<div
								className={cn(
									"relative mx-auto flex w-full max-w-xl flex-1 flex-col",
									chatSurfaceMinHeightClass,
								)}
							>
								<div className="flex-1 pt-8 pb-28 md:pb-32">
									<ChatMessages
										messages={controller.messages}
										error={controller.error}
										isLoading={controller.isLoading}
										onDeleteMessage={controller.onDeleteMessage}
										onEditMessage={controller.onEditMessage}
										onPlusAction={handleCreateNoteFromResponse}
										onRegenerateMessage={controller.onRegenerateMessage}
									/>
								</div>

								<div className="sticky bottom-0 z-10 mt-auto h-0">
									<div className={COMPOSER_DOCK_WRAPPER_CLASS}>
										<div className="pointer-events-auto relative mx-auto w-full max-w-xl">
											{composer}
										</div>
									</div>
								</div>
							</div>
						) : (
							<div
								className={cn(
									"mx-auto flex w-full max-w-xl flex-1 flex-col",
									chatSurfaceMinHeightClass,
								)}
							>
								<div className="flex flex-1 flex-col gap-6 pb-8">
									<PageTitle isDesktopMac={isDesktopMac} className="w-full">
										Ask anything
									</PageTitle>

									{composer}

									<div className="min-h-0 flex-1">
										<ChatHistoryList
											chats={chats}
											isChatsLoading={isChatsLoading}
											activeChatId={activeChatId}
											onOpenChat={onOpenChat}
											onPrefetchChat={onPrefetchChat}
											onMoveToTrash={controller.setConfirmTrashChatId}
										/>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</ScrollArea>

			<AlertDialog
				open={controller.confirmTrashChatId !== null}
				onOpenChange={(open) => {
					if (!open) {
						controller.setConfirmTrashChatId(null);
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
						<AlertDialogCancel disabled={controller.isMovingChatToTrash}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
							onClick={controller.handleMoveChatToTrash}
							disabled={controller.isMovingChatToTrash}
						>
							{controller.isMovingChatToTrash ? "Moving..." : "Move to trash"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
