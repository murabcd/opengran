import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import { MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { getChatId } from "@/lib/chat";
import type { Doc } from "../../../../../convex/_generated/dataModel";

type ChatHistoryListProps = {
	chats: Array<Doc<"chats">>;
	isChatsLoading: boolean;
	activeChatId: string | null;
	onOpenChat: (chatId: string) => void;
	onMoveToTrash: (chatId: string) => void;
};

type GroupedChats = {
	today: Array<Doc<"chats">>;
	yesterday: Array<Doc<"chats">>;
	lastWeek: Array<Doc<"chats">>;
	lastMonth: Array<Doc<"chats">>;
	older: Array<Doc<"chats">>;
};

const chatCreatedTimeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

export function ChatHistoryList({
	chats,
	isChatsLoading,
	activeChatId,
	onOpenChat,
	onMoveToTrash,
}: ChatHistoryListProps) {
	const groupedChats = groupChatsByDate(chats);
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

	return (
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
										const preview = chat.authorName?.trim() || "Unknown user";
										const createdTime = chatCreatedTimeFormatter.format(
											new Date(chat.createdAt || chat._creationTime),
										);

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
														<div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
															<span className="truncate">{preview}</span>
															<span aria-hidden="true">·</span>
															<time
																dateTime={new Date(
																	chat.createdAt || chat._creationTime,
																).toISOString()}
																className="shrink-0 tabular-nums"
															>
																{createdTime}
															</time>
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
															onClick={(event) => event.stopPropagation()}
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
																onMoveToTrash(storedChatId);
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
						<EmptyMedia variant="icon">
							<MessageCircle className="size-4" />
						</EmptyMedia>
						<EmptyTitle>No chats yet</EmptyTitle>
						<EmptyDescription>
							Start a conversation and it will show up here
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</div>
	);
}

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
