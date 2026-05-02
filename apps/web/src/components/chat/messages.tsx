import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import {
	Check,
	Copy,
	Paperclip,
	PenLine,
	Plus,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ShimmerText } from "@/components/ai-elements/shimmer";
import {
	Source,
	Sources,
	SourcesContent,
	SourcesTrigger,
} from "@/components/ai-elements/sources";
import { CollapsibleMessageContent } from "@/components/chat/collapsible-message-content";
import {
	ASSISTANT_CHAT_CONTENT_CLASS,
	CHAT_ACTIONS_VISIBILITY_CLASS,
	CHAT_MESSAGE_MAX_WIDTH_CLASS,
	getChatMessageJustifyClass,
	USER_CHAT_BUBBLE_CLASS,
} from "@/components/chat/message-layout";
import { ChatRecipeReceipt } from "@/components/chat/recipe-receipt";
import {
	extractFileParts,
	extractTextParts,
	getChatMessageMetadata,
	getChatText,
} from "@/lib/chat-message";
import { collectMessageSources } from "@/lib/chat-sources";
import {
	getLastAssistantHasRenderableContent,
	groupMessagesIntoTurns,
} from "@/lib/chat-turns";

export function ChatMessages({
	messages,
	error,
	isLoading,
	onEditMessage,
	onDeleteMessage,
	onPlusAction,
	onRegenerateMessage,
}: {
	messages: UIMessage[];
	error?: Error;
	isLoading?: boolean;
	onEditMessage?: (messageId: string, text: string) => void;
	onDeleteMessage?: (messageId: string) => void;
	onPlusAction?: (
		content: string,
	) => Promise<"created" | undefined> | "created" | undefined;
	onRegenerateMessage?: (messageId: string) => void;
}) {
	const lastMessage = messages[messages.length - 1];
	const [messageIdPendingDelete, setMessageIdPendingDelete] = React.useState<
		string | null
	>(null);
	const showLoadingIndicator =
		isLoading &&
		(lastMessage === undefined || lastMessage.role !== "assistant");
	const turns = React.useMemo(
		() => groupMessagesIntoTurns(messages),
		[messages],
	);
	const showAssistantBreathingSpace =
		isLoading ||
		(lastMessage?.role === "assistant" &&
			getLastAssistantHasRenderableContent(
				messages,
				(message) =>
					extractTextParts(message).length > 0 ||
					extractFileParts(message).length > 0 ||
					collectMessageSources(message).length > 0,
			));
	const handleDeleteClick = React.useCallback(
		(messageId: string) => {
			if (messageIdPendingDelete === messageId) {
				onDeleteMessage?.(messageId);
				setMessageIdPendingDelete(null);
				return;
			}

			setMessageIdPendingDelete(messageId);
		},
		[messageIdPendingDelete, onDeleteMessage],
	);

	return (
		<div className="space-y-4">
			{turns.map((turn, turnIndex) => {
				const turnMessages = [
					...(turn.userMessage ? [turn.userMessage] : []),
					...turn.assistantMessages,
				];
				const turnKey = turn.userMessage?.id ?? `assistant-turn-${turnIndex}`;

				return (
					<div
						key={turnKey}
						className={cn(
							"space-y-3",
							turnIndex === turns.length - 1 && "pb-9",
						)}
					>
						{turnMessages.map((message) => {
							const textParts = extractTextParts(message);
							const fileParts = extractFileParts(message);
							const renderedText = textParts
								.map((part) => part.text)
								.join("\n\n");
							const metadata = getChatMessageMetadata(message);
							const selectedRecipe = metadata?.recipe ?? null;
							const displayText = metadata?.recipeOnly ? "" : renderedText;
							const messageText = metadata?.recipeOnly
								? ""
								: getChatText(message);
							const messageSources =
								message.role === "assistant"
									? collectMessageSources(message)
									: [];
							const isStreamingAssistantMessage =
								isLoading &&
								message.role === "assistant" &&
								message.id === lastMessage?.id;
							const isEmpty = displayText.length === 0;

							if (
								isEmpty &&
								fileParts.length === 0 &&
								!selectedRecipe &&
								!isStreamingAssistantMessage
							) {
								return null;
							}

							return (
								<div
									key={message.id}
									className={cn(
										"group/message flex w-full",
										getChatMessageJustifyClass(message.role),
									)}
								>
									<div
										className={cn(
											"flex flex-col",
											message.role === "user" ? "items-end" : "items-start",
											CHAT_MESSAGE_MAX_WIDTH_CLASS,
										)}
									>
										{selectedRecipe ? (
											<ChatRecipeReceipt
												isUserMessage={message.role === "user"}
												recipe={selectedRecipe}
											/>
										) : null}
										<ChatMessageFileAttachments files={fileParts} />
										{isStreamingAssistantMessage || displayText ? (
											<div className="mt-2 flex flex-row items-start gap-2 first:mt-0">
												<div
													className={cn(
														message.role === "user"
															? USER_CHAT_BUBBLE_CLASS
															: ASSISTANT_CHAT_CONTENT_CLASS,
														isStreamingAssistantMessage &&
															isEmpty &&
															"text-muted-foreground",
													)}
												>
													{isStreamingAssistantMessage && isEmpty ? (
														<div className="text-sm text-muted-foreground">
															<ShimmerText>Thinking</ShimmerText>
														</div>
													) : (
														<CollapsibleMessageContent
															role={message.role}
															text={displayText}
															isAnimating={Boolean(isStreamingAssistantMessage)}
															streamdownClassName="note-streamdown"
														/>
													)}
												</div>
											</div>
										) : null}
										{message.role === "assistant" && !isEmpty ? (
											<div
												className={cn(
													"mt-2 flex items-center gap-1",
													CHAT_ACTIONS_VISIBILITY_CLASS,
												)}
											>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															className="size-7 text-muted-foreground hover:text-foreground"
															aria-label="Regenerate"
															disabled={!onRegenerateMessage}
															onClick={() => onRegenerateMessage?.(message.id)}
														>
															<RotateCcw className="size-3.5" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Regenerate</TooltipContent>
												</Tooltip>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															className="size-7 text-muted-foreground hover:text-foreground"
															aria-label="Copy"
															onClick={() => {
																void navigator.clipboard
																	.writeText(messageText)
																	.then(() => toast.success("Copied"))
																	.catch(() => toast.error("Failed to copy"));
															}}
														>
															<Copy className="size-3.5" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Copy</TooltipContent>
												</Tooltip>
												<Tooltip>
													<TooltipTrigger asChild>
														<Button
															type="button"
															variant="ghost"
															size="icon-sm"
															className="size-7 text-muted-foreground hover:text-foreground"
															aria-label="Create note"
															disabled={!onPlusAction}
															onClick={() => {
																if (!onPlusAction) {
																	return;
																}
																void Promise.resolve(onPlusAction(messageText))
																	.then((result) => {
																		if (result === "created") {
																			toast.success("Note created");
																		}
																	})
																	.catch(() =>
																		toast.error("Failed to create note"),
																	);
															}}
														>
															<Plus className="size-3.5" />
														</Button>
													</TooltipTrigger>
													<TooltipContent>Create note</TooltipContent>
												</Tooltip>
											</div>
										) : null}
										{message.role === "user" && (!isEmpty || selectedRecipe) ? (
											<div
												className={cn(
													"mt-2 flex justify-end gap-1",
													CHAT_ACTIONS_VISIBILITY_CLASS,
												)}
											>
												{messageText ? (
													<>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	type="button"
																	variant="ghost"
																	size="icon-sm"
																	className="size-7 text-muted-foreground hover:text-foreground"
																	aria-label="Edit"
																	onClick={() =>
																		onEditMessage?.(message.id, messageText)
																	}
																>
																	<PenLine className="size-3.5" />
																</Button>
															</TooltipTrigger>
															<TooltipContent>Edit</TooltipContent>
														</Tooltip>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	type="button"
																	variant="ghost"
																	size="icon-sm"
																	className="size-7 text-muted-foreground hover:text-foreground"
																	aria-label="Copy"
																	onClick={() => {
																		void navigator.clipboard
																			.writeText(messageText)
																			.then(() => toast.success("Copied"))
																			.catch(() =>
																				toast.error("Failed to copy"),
																			);
																	}}
																>
																	<Copy className="size-3.5" />
																</Button>
															</TooltipTrigger>
															<TooltipContent>Copy</TooltipContent>
														</Tooltip>
													</>
												) : null}
												<Tooltip>
													<TooltipTrigger asChild>
														{(() => {
															const isPendingDelete =
																messageIdPendingDelete === message.id;

															return (
																<Button
																	type="button"
																	variant="ghost"
																	size="icon-sm"
																	className={cn(
																		"size-7 text-muted-foreground hover:text-foreground",
																		isPendingDelete &&
																			"text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-red-500",
																	)}
																	aria-label="Delete"
																	disabled={!onDeleteMessage}
																	onClick={() => handleDeleteClick(message.id)}
																	onMouseLeave={() => {
																		if (isPendingDelete) {
																			setMessageIdPendingDelete(null);
																		}
																	}}
																>
																	{isPendingDelete ? (
																		<Check className="size-3.5" />
																	) : (
																		<Trash2 className="size-3.5" />
																	)}
																</Button>
															);
														})()}
													</TooltipTrigger>
													{messageIdPendingDelete === message.id ? null : (
														<TooltipContent>Delete</TooltipContent>
													)}
												</Tooltip>
											</div>
										) : null}
										{message.role === "assistant" &&
										messageSources.length > 0 ? (
											<Sources defaultOpen={false} className="mt-1">
												<SourcesTrigger count={messageSources.length} />
												<SourcesContent>
													{messageSources.map((source) => (
														<Source
															key={`${message.id}:${source.href}`}
															href={source.href}
															title={source.title}
														/>
													))}
												</SourcesContent>
											</Sources>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
				);
			})}

			{showLoadingIndicator ? (
				<div className="group/message flex w-full justify-start">
					<div className={cn("flex flex-col", CHAT_MESSAGE_MAX_WIDTH_CLASS)}>
						<div className="flex flex-row items-start gap-2 pb-4">
							<div className={ASSISTANT_CHAT_CONTENT_CLASS}>
								<div className="text-sm text-muted-foreground">
									<ShimmerText>Thinking</ShimmerText>
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}

			{showAssistantBreathingSpace ? (
				<div aria-hidden="true" className="min-h-[max(140px,24vh)] w-full" />
			) : null}

			{error ? (
				<p className="px-4 text-sm text-destructive">{error.message}</p>
			) : null}
		</div>
	);
}

export function ChatMessageFileAttachments({
	files,
}: {
	files: ReturnType<typeof extractFileParts>;
}) {
	const [previewImage, setPreviewImage] = React.useState<
		ReturnType<typeof extractFileParts>[number] | null
	>(null);

	if (files.length === 0) {
		return null;
	}

	return (
		<>
			<div className="mt-2 flex max-w-full flex-wrap gap-2 first:mt-0">
				{files.map((file) =>
					file.mediaType.startsWith("image/") ? (
						<button
							key={file.url}
							type="button"
							className="size-24 cursor-zoom-in overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => setPreviewImage(file)}
						>
							<img
								src={file.url}
								alt={file.filename || "Attached image"}
								className="size-full object-cover"
							/>
						</button>
					) : (
						<button
							key={file.url}
							type="button"
							className="flex size-24 items-center justify-center rounded-md border border-border/50 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
						>
							<Paperclip className="size-5" />
							<span className="sr-only">
								{file.filename || "Attached file"}
							</span>
						</button>
					),
				)}
			</div>
			<Dialog
				open={previewImage !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPreviewImage(null);
					}
				}}
			>
				<DialogContent
					showCloseButton={false}
					className="!top-0 !left-0 !flex !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 items-center justify-center !rounded-none !border-0 !bg-transparent p-10 !shadow-none !ring-0 sm:!max-w-none"
					onPointerDown={(event) => {
						if (event.target === event.currentTarget) {
							setPreviewImage(null);
						}
					}}
				>
					<DialogTitle className="sr-only">
						{previewImage?.filename || "Attached image preview"}
					</DialogTitle>
					<DialogDescription className="sr-only">
						Image attachment preview.
					</DialogDescription>
					<DialogClose asChild>
						<Button
							type="button"
							variant="secondary"
							size="icon"
							className="fixed top-4 right-4 z-10 size-11 rounded-full"
						>
							<X className="size-6" />
							<span className="sr-only">Close</span>
						</Button>
					</DialogClose>
					{previewImage ? (
						<img
							src={previewImage.url}
							alt={previewImage.filename || "Attached image"}
							className="block max-h-[calc(100vh-8rem)] max-w-[calc(100vw-8rem)] rounded-lg object-contain"
							onPointerDown={(event) => event.stopPropagation()}
						/>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
