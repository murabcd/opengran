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
import { fallbackChatModel, resolveChatModel } from "@/lib/ai/models";
import { authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
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
}: ChatPageProps) {
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
	const currentChat = React.useMemo(
		() => chats.find((chat) => getChatId(chat) === chatId) ?? null,
		[chats, chatId],
	);

	React.useEffect(() => {
		setSelectedModel(resolveChatModel(currentChat?.model));
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
		void handleSubmit();
	};

	const handleAddMention = (pageId: string) => {
		setMentions((current) =>
			current.includes(pageId) ? current : [...current, pageId],
		);
		setDocumentSearchTerm("");
		setMentionPopoverOpen(false);
	};

	const handleRemoveMention = (pageId: string) => {
		setMentions((current) => current.filter((id) => id !== pageId));
	};

	const handleToggleSource = (sourceId: string) => {
		setSelectedSourceIds((current) =>
			current.includes(sourceId)
				? current.filter((id) => id !== sourceId)
				: [...current, sourceId],
		);
	};

	const handleClearSelectedSources = () => {
		setSelectedSourceIds([]);
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

					<ChatComposer
						hasMessages={hasMessages}
						draft={draft}
						onDraftChange={setDraft}
						onDraftKeyDown={handleDraftKeyDown}
						onSubmit={handleSubmit}
						isLoading={isLoading}
						selectedModel={selectedModel}
						modelPopoverOpen={modelPopoverOpen}
						onModelPopoverOpenChange={setModelPopoverOpen}
						onSelectedModelChange={setSelectedModel}
						mentionPopoverOpen={mentionPopoverOpen}
						onMentionPopoverOpenChange={setMentionPopoverOpen}
						documentSearchTerm={documentSearchTerm}
						onDocumentSearchTermChange={setDocumentSearchTerm}
						mentions={mentions}
						contextPages={contextPages}
						mentionableDocuments={mentionableDocuments}
						isNotesLoading={isNotesLoading}
						emptyStateMessage={
							shouldSearchDocuments ? "No notes found." : "No notes available."
						}
						shouldSearchDocuments={shouldSearchDocuments}
						onAddMention={handleAddMention}
						onRemoveMention={handleRemoveMention}
						sourcesOpen={sourcesOpen}
						onSourcesOpenChange={setSourcesOpen}
						webSearchEnabled={webSearchEnabled}
						onWebSearchEnabledChange={setWebSearchEnabled}
						appsEnabled={appsEnabled}
						onAppsEnabledChange={setAppsEnabled}
						sourceSearchTerm={sourceSearchTerm}
						onSourceSearchTermChange={setSourceSearchTerm}
						selectedSourceIds={selectedSourceIds}
						workspaceSources={workspaceSources}
						onToggleSource={handleToggleSource}
						onClearSelectedSources={handleClearSelectedSources}
					/>

					{!hasMessages ? (
						<ChatHistoryList
							chats={chats}
							isChatsLoading={isChatsLoading}
							activeChatId={activeChatId}
							onOpenChat={onOpenChat}
							onMoveToTrash={setConfirmTrashChatId}
						/>
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
