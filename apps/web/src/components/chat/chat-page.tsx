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
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useMutation, useQuery } from "convex/react";
import { FileText } from "lucide-react";
import * as React from "react";
import { ChatMessages } from "@/components/chat/messages";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { useStickyScrollToBottom } from "@/hooks/use-sticky-scroll-to-bottom";
import { defaultChatModel, findChatModel } from "@/lib/ai/models";
import { authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
import type { WorkspaceRecord } from "@/lib/workspaces";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { ChatComposer } from "./chat-composer";
import { ChatHistoryList } from "./chat-history-list";

type ChatPageProps = {
	chatId: string;
	initialMessages: UIMessage[];
	onChatPersisted?: (chatId: string) => void;
	chats: Array<Doc<"chats">>;
	isChatsLoading: boolean;
	activeChatId: string | null;
	onOpenChat: (chatId: string) => void;
	onChatRemoved: (chatId: string) => void;
	activeWorkspace: WorkspaceRecord | null;
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
	const [draft, setDraft] = React.useState("");
	const [confirmTrashChatId, setConfirmTrashChatId] = React.useState<
		string | null
	>(null);
	const [selectedModel, setSelectedModel] = React.useState(defaultChatModel);
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
								workspaceId: activeWorkspaceId,
							}
						: {
								...body,
								id,
								messages,
								workspaceId: activeWorkspaceId,
							},
				}),
			}),
		[activeWorkspaceId],
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
				title: note.title.trim() || "New note",
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
						workspaceId: activeWorkspaceId,
						convexToken: data?.token ?? null,
					},
				},
			);
			setDraft("");
		} finally {
			setIsPreparingRequest(false);
		}
	}, [
		activeWorkspaceId,
		appsEnabled,
		chatId,
		draft,
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

	return {
		appsEnabled,
		confirmTrashChatId,
		contextPages,
		draft,
		error,
		activeWorkspace,
		handleClearSelectedSources: () => setSelectedSourceIds([]),
		handleDraftKeyDown,
		handleMoveChatToTrash,
		handleSubmit,
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
		setWebSearchEnabled,
		shouldSearchDocuments,
		sourceSearchTerm,
		sourcesOpen,
		webSearchEnabled,
		workspaceSources,
		appSources: appSources ?? [],
		documentSearchTerm,
		mentions,
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
	onChatRemoved,
	activeWorkspace,
}: ChatPageProps) {
	const controller = useChatPageController({
		chatId,
		initialMessages,
		onChatPersisted,
		chats,
		onChatRemoved,
		activeWorkspace,
	});
	const { containerRef } = useStickyScrollToBottom();
	const composer = (
		<ChatComposer
			hasMessages={controller.hasMessages}
			draft={controller.draft}
			onDraftChange={controller.setDraft}
			onDraftKeyDown={controller.handleDraftKeyDown}
			onSubmit={controller.handleSubmit}
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
			onWebSearchEnabledChange={controller.setWebSearchEnabled}
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
		/>
	);

	return (
		<>
			<div
				ref={controller.hasMessages ? containerRef : undefined}
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
			>
				<div className="flex min-h-0 flex-1 justify-center px-4 md:px-6">
					<div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
						{controller.hasMessages ? (
							<div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl flex-1 flex-col md:min-h-[calc(100svh-5rem)]">
								<div className="flex-1 pt-8 pb-28 md:pb-32">
									<ChatMessages
										messages={controller.messages}
										error={controller.error}
										isLoading={controller.isLoading}
									/>
								</div>

								<div className="sticky bottom-0 z-10 mt-auto h-0">
									<div className="pointer-events-none absolute inset-x-0 bottom-0 -mx-4 bg-background pt-2 pb-6 md:-mx-6">
										<div className="pointer-events-auto relative mx-auto w-full max-w-xl">
											{composer}
										</div>
									</div>
								</div>
							</div>
						) : (
							<div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl flex-1 flex-col md:min-h-[calc(100svh-5rem)]">
								<div className="flex flex-1 flex-col gap-6 pb-8">
									<div className="w-full">
										<h1 className="text-lg md:text-xl">Ask anything</h1>
									</div>

									{composer}

									<div className="min-h-0 flex-1">
										<ChatHistoryList
											chats={chats}
											isChatsLoading={isChatsLoading}
											activeChatId={activeChatId}
											onOpenChat={onOpenChat}
											onMoveToTrash={controller.setConfirmTrashChatId}
										/>
									</div>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

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
