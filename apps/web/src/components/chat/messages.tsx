import { Button } from "@workspace/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import { Copy, PenLine, Plus, RotateCcw, Trash2 } from "lucide-react";
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
	extractTextParts,
	getChatMessageMetadata,
	getChatText,
} from "@/lib/chat-message";
import { collectMessageSources } from "@/lib/chat-sources";

export {
	collectMessageSources,
	type ToolSource,
} from "@/lib/chat-sources";

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
	const showLoadingIndicator =
		isLoading &&
		(lastMessage === undefined || lastMessage.role !== "assistant");

	return (
		<div className="space-y-4 pb-9">
			{messages.map((message) => {
				const textParts = extractTextParts(message);
				const renderedText = textParts.map((part) => part.text).join("\n\n");
				const metadata = getChatMessageMetadata(message);
				const selectedRecipe = metadata?.recipe ?? null;
				const displayText = metadata?.recipeOnly ? "" : renderedText;
				const messageText = metadata?.recipeOnly ? "" : getChatText(message);
				const messageSources =
					message.role === "assistant" ? collectMessageSources(message) : [];
				const isStreamingAssistantMessage =
					isLoading &&
					message.role === "assistant" &&
					message.id === lastMessage?.id;
				const isEmpty = displayText.length === 0;

				if (isEmpty && !selectedRecipe && !isStreamingAssistantMessage) {
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
														.catch(() => toast.error("Failed to create note"));
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
																.catch(() => toast.error("Failed to copy"));
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
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												className="size-7 text-muted-foreground hover:text-foreground"
												aria-label="Delete"
												disabled={!onDeleteMessage}
												onClick={() => onDeleteMessage?.(message.id)}
											>
												<Trash2 className="size-3.5" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Delete</TooltipContent>
									</Tooltip>
								</div>
							) : null}
							{message.role === "assistant" && messageSources.length > 0 ? (
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

			{error ? (
				<p className="px-4 text-sm text-destructive">{error.message}</p>
			) : null}
		</div>
	);
}
