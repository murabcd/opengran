"use client";

import type { Editor } from "@tiptap/react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetTitle,
} from "@workspace/ui/components/sheet";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	ArrowUp,
	Bell,
	BellOff,
	Check,
	Link2,
	LoaderCircle,
	MessageSquareMore,
	Minus,
	MoreHorizontal,
	PencilLine,
	Reply,
	SlidersHorizontal,
	Square,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import {
	DESKTOP_DOCKED_PANEL_DEFAULT_WIDTH,
	DESKTOP_DOCKED_PANEL_MAX_WIDTH,
	DESKTOP_DOCKED_PANEL_MIN_WIDTH,
	MOBILE_DOCKED_PANEL_MIN_WIDTH,
} from "@/components/layout/docked-panel-dimensions";
import {
	DesktopDockedSidePanel,
	DockedPanelPinButton,
	useDockedPanelInset,
} from "@/components/layout/docked-side-panel";
import {
	ResizableSidePanelHandle,
	useResizableSidePanel,
} from "@/components/layout/resizable-side-panel";
import { useDesktopPanelPin } from "@/components/layout/use-desktop-panel-pin";
import { COMMENTS_PANEL_PINNED_STORAGE_KEY } from "@/components/note/note-comments-panel-state";
import { writeTextToClipboard } from "@/components/note/share-note";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { getAvatarSrc } from "@/lib/avatar";
import { DESKTOP_MAIN_HEADER_CONTENT_CLASS } from "@/lib/desktop-chrome";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

const MAX_VISIBLE_THREAD_DEPTH = 3;
const COMMENTS_PANEL_STORAGE_KEY_DESKTOP =
	"opengran.note-comments-panel-width.desktop";
const COMMENTS_PANEL_STORAGE_KEY_MOBILE =
	"opengran.note-comments-panel-width.mobile";

type ThreadView = "all" | "open" | "resolved";

type ThreadSummary = Doc<"noteCommentThreads">;
type ThreadComment = Doc<"noteComments">;
type ThreadDetail = ThreadSummary & { comments: ThreadComment[] };
type ThreadCommentNode = {
	comment: ThreadComment;
	children: ThreadCommentNode[];
};
type CommentViewer = {
	name: string;
	email: string;
	avatar: string;
};
type CommentsUiState = {
	view: ThreadView;
	draftBody: string;
	replyBody: string;
	editBody: string;
	expandedThreadId: Id<"noteCommentThreads"> | null;
	replyingThreadId: Id<"noteCommentThreads"> | null;
	replyParentCommentId: Id<"noteComments"> | null;
	editingThreadId: Id<"noteCommentThreads"> | null;
	editingCommentId: Id<"noteComments"> | null;
	threadActionsOpenId: Id<"noteCommentThreads"> | null;
	commentActionsOpenId: Id<"noteComments"> | null;
	filtersOpen: boolean;
};

export type PendingNoteCommentSelection = {
	from: number;
	to: number;
	text: string;
};

const getErrorMessage = (error: unknown, fallback: string) =>
	error instanceof Error && error.message.trim().length > 0
		? error.message.replace(/\.$/, "")
		: fallback;

const getAvatarLabel = (name?: string | null) =>
	(name ?? "")
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "?";

const getDisplayName = (name?: string | null) => {
	const trimmed = name?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : "Unknown";
};

const isUnknownAuthorName = (name?: string | null) => {
	const trimmed = name?.trim().toLowerCase();
	return !trimmed || trimmed === "unknown" || trimmed === "unknown user";
};

const getNormalizedIdentity = (value?: string | null) =>
	value?.trim().toLowerCase() ?? "";

const resolveAuthorIdentity = ({
	name,
	currentUser,
}: {
	name?: string | null;
	currentUser: CommentViewer;
}) => {
	const normalizedName = getNormalizedIdentity(name);
	const normalizedCurrentUserName = getNormalizedIdentity(currentUser.name);
	const normalizedCurrentUserEmail = getNormalizedIdentity(currentUser.email);

	if (
		isUnknownAuthorName(name) ||
		normalizedName === normalizedCurrentUserName ||
		normalizedName === normalizedCurrentUserEmail
	) {
		return {
			name: "You",
			avatarSrc: getAvatarSrc(currentUser),
		};
	}

	return {
		name: getDisplayName(name),
		avatarSrc: null,
	};
};

const formatCommentTimestamp = (value: number) =>
	new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(value);

const formatDiscussionTitle = (
	authorName: string,
	latestCommentIsReply: boolean,
) => `${authorName} ${latestCommentIsReply ? "replied in" : "commented in"}`;

const THREAD_VIEW_OPTIONS: Array<{
	value: ThreadView;
	label: string;
}> = [
	{ value: "all", label: "All discussions" },
	{ value: "open", label: "Open discussions" },
	{ value: "resolved", label: "Resolved discussions" },
];

const INITIAL_COMMENTS_UI_STATE: CommentsUiState = {
	view: "all",
	draftBody: "",
	replyBody: "",
	editBody: "",
	expandedThreadId: null,
	replyingThreadId: null,
	replyParentCommentId: null,
	editingThreadId: null,
	editingCommentId: null,
	threadActionsOpenId: null,
	commentActionsOpenId: null,
	filtersOpen: false,
};

const commentsUiReducer = (
	state: CommentsUiState,
	patch: Partial<CommentsUiState>,
) => ({ ...state, ...patch });

const buildCommentTree = (comments: ThreadComment[]) => {
	const nodes = new Map<string, ThreadCommentNode>();
	const roots: ThreadCommentNode[] = [];

	for (const comment of comments) {
		nodes.set(String(comment._id), {
			comment,
			children: [],
		});
	}

	for (const comment of comments) {
		const node = nodes.get(String(comment._id));

		if (!node) {
			continue;
		}

		if (!comment.parentCommentId) {
			roots.push(node);
			continue;
		}

		const parent = nodes.get(String(comment.parentCommentId));

		if (!parent) {
			roots.push(node);
			continue;
		}

		parent.children.push(node);
	}

	return roots;
};

const collectVisibleThreadIds = (editor: Editor | null) => {
	const threadIds = new Set<string>();

	if (!editor) {
		return threadIds;
	}

	editor.state.doc.descendants((node) => {
		for (const mark of node.marks) {
			if (mark.type.name !== "noteComment") {
				continue;
			}

			const threadId =
				typeof mark.attrs.threadId === "string"
					? mark.attrs.threadId.trim()
					: "";
			if (threadId) {
				threadIds.add(threadId);
			}
		}

		return true;
	});

	return threadIds;
};

function CommentComposerField({
	value,
	onChange,
	onSubmit,
	isSubmitting,
	ariaLabel,
	sendAriaLabel,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	isSubmitting: boolean;
	ariaLabel: string;
	sendAriaLabel: string;
	placeholder: string;
}) {
	return (
		<InputGroup className="min-h-[96px] overflow-hidden rounded-lg border-input/30 bg-background bg-clip-padding shadow-sm has-disabled:bg-background has-disabled:opacity-100 dark:bg-input/30 dark:has-disabled:bg-input/30">
			<InputGroupTextarea
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={(event) => {
					if (event.key !== "Enter" || event.shiftKey) {
						return;
					}

					event.preventDefault();
					onSubmit();
				}}
				rows={1}
				placeholder={placeholder}
				aria-label={ariaLabel}
				className="min-h-[40px] max-h-52 overflow-y-auto px-4 pt-2 pb-0 text-base font-normal placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
			/>
			<InputGroupAddon align="block-end" className="gap-1 px-4 pb-2.5">
				<InputGroupButton
					type="button"
					variant="default"
					size="icon-sm"
					className="ml-auto rounded-full"
					aria-label={sendAriaLabel}
					onClick={onSubmit}
					disabled={isSubmitting || value.trim().length === 0}
				>
					{isSubmitting ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<ArrowUp className="size-4" />
					)}
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}

function ThreadCommentNodeItem({
	node,
	depth = 0,
	flattenIndent = false,
	currentUser,
	commentActionsOpenId,
	setCommentActionsOpenId,
	replyingThreadId,
	replyParentCommentId,
	editingCommentId,
	editBody,
	replyBody,
	isReplySubmitting,
	editComposerRef,
	replyComposerRef,
	setEditBody,
	setReplyBody,
	handleSaveEdit,
	handleReply,
	handleStartReplyToComment,
	handleStartEditComment,
	handleDeleteComment,
}: {
	node: ThreadCommentNode;
	depth?: number;
	flattenIndent?: boolean;
	currentUser: CommentViewer;
	commentActionsOpenId: Id<"noteComments"> | null;
	setCommentActionsOpenId: (commentId: Id<"noteComments"> | null) => void;
	replyingThreadId: Id<"noteCommentThreads"> | null;
	replyParentCommentId: Id<"noteComments"> | null;
	editingCommentId: Id<"noteComments"> | null;
	editBody: string;
	replyBody: string;
	isReplySubmitting: boolean;
	editComposerRef: React.RefObject<HTMLDivElement | null>;
	replyComposerRef: React.RefObject<HTMLDivElement | null>;
	setEditBody: (value: string) => void;
	setReplyBody: (value: string) => void;
	handleSaveEdit: () => void;
	handleReply: () => void;
	handleStartReplyToComment: (comment: ThreadComment) => void;
	handleStartEditComment: (comment: ThreadComment) => void;
	handleDeleteComment: (comment: ThreadComment) => void;
}) {
	const commentAuthor = resolveAuthorIdentity({
		name: node.comment.authorName,
		currentUser,
	});
	const canManageComment = commentAuthor.name === "You";
	const isReplyComposerOpen =
		replyingThreadId === node.comment.threadId &&
		replyParentCommentId === node.comment._id;
	const nextDepth = depth >= MAX_VISIBLE_THREAD_DEPTH ? depth : depth + 1;
	const flattenChildren = depth >= MAX_VISIBLE_THREAD_DEPTH;

	return (
		<div
			className={cn(
				"min-w-0",
				depth > 0 && !flattenIndent && "ml-3 border-l border-border/60 pl-4",
			)}
		>
			<div className="group">
				<div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1">
					<div className="flex pt-0.5">
						<Avatar className="size-4">
							<AvatarImage
								src={commentAuthor.avatarSrc ?? undefined}
								alt={commentAuthor.name}
							/>
							<AvatarFallback className="text-[9px] font-medium">
								{getAvatarLabel(commentAuthor.name)}
							</AvatarFallback>
						</Avatar>
					</div>
					<div className="min-w-0">
						<div className="flex items-start justify-between gap-3">
							<p className="truncate text-sm font-medium">
								{commentAuthor.name}
							</p>
							<div className="relative flex min-w-[3.75rem] shrink-0 items-start justify-end pt-0.5">
								<span
									className={cn(
										"pointer-events-none text-xs text-muted-foreground transition-opacity duration-150",
										commentActionsOpenId === node.comment._id
											? "opacity-0"
											: "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0",
									)}
								>
									{formatCommentTimestamp(node.comment.createdAt)}
								</span>
								<DropdownMenu
									open={commentActionsOpenId === node.comment._id}
									onOpenChange={(nextOpen) =>
										setCommentActionsOpenId(nextOpen ? node.comment._id : null)
									}
								>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className={cn(
												"absolute top-0 right-0 z-10 h-6 w-6 cursor-pointer rounded-md transition-opacity duration-150",
												commentActionsOpenId === node.comment._id
													? "opacity-100"
													: "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
											)}
											aria-label="Comment actions"
										>
											<MoreHorizontal className="size-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end" className="min-w-36">
										<DropdownMenuItem
											className="cursor-pointer"
											onSelect={() => handleStartReplyToComment(node.comment)}
										>
											<Reply className="size-4" />
											<span>Reply</span>
										</DropdownMenuItem>
										{canManageComment ? (
											<DropdownMenuItem
												className="cursor-pointer"
												onSelect={() => handleStartEditComment(node.comment)}
											>
												<PencilLine className="size-4" />
												<span>Edit</span>
											</DropdownMenuItem>
										) : null}
										{canManageComment ? (
											<DropdownMenuItem
												variant="destructive"
												className="cursor-pointer"
												onSelect={() => handleDeleteComment(node.comment)}
											>
												<Trash2 className="size-4" />
												<span>Delete</span>
											</DropdownMenuItem>
										) : null}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
						</div>
						{editingCommentId === node.comment._id ? (
							<div ref={editComposerRef} className="mt-2">
								<CommentComposerField
									value={editBody}
									onChange={setEditBody}
									onSubmit={handleSaveEdit}
									isSubmitting={isReplySubmitting}
									ariaLabel="Edit comment"
									sendAriaLabel="Save comment"
									placeholder="Edit comment..."
								/>
							</div>
						) : (
							<p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
								{node.comment.body}
							</p>
						)}
					</div>
				</div>
			</div>

			{isReplyComposerOpen ? (
				<div ref={replyComposerRef} className="mt-3">
					<CommentComposerField
						value={replyBody}
						onChange={setReplyBody}
						onSubmit={handleReply}
						isSubmitting={isReplySubmitting}
						ariaLabel="Reply to comment"
						sendAriaLabel="Send reply"
						placeholder="Reply..."
					/>
				</div>
			) : null}

			{node.children.length > 0 ? (
				<div className="mt-3 space-y-3">
					{node.children.map((child) => (
						<ThreadCommentNodeItem
							key={child.comment._id}
							node={child}
							depth={nextDepth}
							flattenIndent={flattenChildren}
							currentUser={currentUser}
							commentActionsOpenId={commentActionsOpenId}
							setCommentActionsOpenId={setCommentActionsOpenId}
							replyingThreadId={replyingThreadId}
							replyParentCommentId={replyParentCommentId}
							editingCommentId={editingCommentId}
							editBody={editBody}
							replyBody={replyBody}
							isReplySubmitting={isReplySubmitting}
							editComposerRef={editComposerRef}
							replyComposerRef={replyComposerRef}
							setEditBody={setEditBody}
							setReplyBody={setReplyBody}
							handleSaveEdit={handleSaveEdit}
							handleReply={handleReply}
							handleStartReplyToComment={handleStartReplyToComment}
							handleStartEditComment={handleStartEditComment}
							handleDeleteComment={handleDeleteComment}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function DiscussionThreadRow({
	thread,
	currentUser,
	activeThreadId,
	expandedThreadId,
	replyingThreadId,
	replyParentCommentId,
	editingCommentId,
	threadActionsOpenId,
	expandedThread,
	optimisticReadThreadIds,
	isReplySubmitting,
	replyBody,
	handleMarkThreadRead,
	handleMarkThreadUnread,
	handleStartEditThread,
	handleCopyThreadLink,
	handleToggleMuteThread,
	handleDeleteThread,
	handleOpenThread,
	activeCommentTree,
	commentActionsOpenId,
	setCommentActionsOpenId,
	editBody,
	editComposerRef,
	replyComposerRef,
	setEditBody,
	setReplyBody,
	handleSaveEdit,
	handleReply,
	handleStartReplyToComment,
	handleStartEditComment,
	handleDeleteComment,
	setThreadActionsOpenId,
}: {
	thread: ThreadSummary;
	currentUser: CommentViewer;
	activeThreadId: Id<"noteCommentThreads"> | null;
	expandedThreadId: Id<"noteCommentThreads"> | null;
	replyingThreadId: Id<"noteCommentThreads"> | null;
	replyParentCommentId: Id<"noteComments"> | null;
	editingCommentId: Id<"noteComments"> | null;
	threadActionsOpenId: Id<"noteCommentThreads"> | null;
	expandedThread: ThreadDetail | null | undefined;
	optimisticReadThreadIds: Set<string>;
	isReplySubmitting: boolean;
	replyBody: string;
	handleMarkThreadRead: (thread: ThreadSummary) => void;
	handleMarkThreadUnread: (threadId: Id<"noteCommentThreads">) => void;
	handleStartEditThread: (thread: ThreadSummary) => void;
	handleCopyThreadLink: (threadId: Id<"noteCommentThreads">) => Promise<void>;
	handleToggleMuteThread: (thread: ThreadSummary) => void;
	handleDeleteThread: (threadId: Id<"noteCommentThreads">) => void;
	handleOpenThread: (thread: ThreadSummary) => void;
	activeCommentTree: ThreadCommentNode[];
	commentActionsOpenId: Id<"noteComments"> | null;
	setCommentActionsOpenId: (commentId: Id<"noteComments"> | null) => void;
	editBody: string;
	editComposerRef: React.RefObject<HTMLDivElement | null>;
	replyComposerRef: React.RefObject<HTMLDivElement | null>;
	setEditBody: (value: string) => void;
	setReplyBody: (value: string) => void;
	handleSaveEdit: () => void;
	handleReply: () => void;
	handleStartReplyToComment: (comment: ThreadComment) => void;
	handleStartEditComment: (comment: ThreadComment) => void;
	handleDeleteComment: (comment: ThreadComment) => void;
	setThreadActionsOpenId: (threadId: Id<"noteCommentThreads"> | null) => void;
}) {
	const isActive = activeThreadId === thread._id;
	const isExpanded = expandedThreadId === thread._id;
	const isReplyComposerOpen = replyingThreadId === thread._id;
	const isEditComposerOpen =
		isExpanded &&
		editingCommentId !== null &&
		expandedThread?.comments.some(
			(comment) => comment._id === editingCommentId,
		) === true;
	const isRead =
		thread.isRead || optimisticReadThreadIds.has(String(thread._id));
	const expandedDetail =
		isExpanded && expandedThread && expandedThread._id === thread._id
			? expandedThread
			: null;
	const threadAuthor = resolveAuthorIdentity({
		name: thread.createdByName,
		currentUser,
	});

	return (
		<div
			className={cn(!isReplyComposerOpen && !isEditComposerOpen && "border-b")}
		>
			<DiscussionThreadSummary
				thread={thread}
				threadAuthor={threadAuthor}
				isRead={isRead}
				isActive={isActive}
				threadActionsOpenId={threadActionsOpenId}
				setThreadActionsOpenId={setThreadActionsOpenId}
				handleMarkThreadRead={handleMarkThreadRead}
				handleMarkThreadUnread={handleMarkThreadUnread}
				handleStartEditThread={handleStartEditThread}
				handleCopyThreadLink={handleCopyThreadLink}
				handleToggleMuteThread={handleToggleMuteThread}
				handleDeleteThread={handleDeleteThread}
				handleOpenThread={handleOpenThread}
			/>

			{isExpanded ? (
				expandedThread === undefined ? (
					<div className="mx-4 mt-4 border-t pt-4" />
				) : expandedDetail === null ? (
					<div className="mx-4 mt-4 border-t pt-4 text-sm text-muted-foreground">
						This discussion is no longer available.
					</div>
				) : (
					<ExpandedDiscussionThread
						expandedDetail={expandedDetail}
						activeCommentTree={activeCommentTree}
						currentUser={currentUser}
						commentActionsOpenId={commentActionsOpenId}
						setCommentActionsOpenId={setCommentActionsOpenId}
						replyingThreadId={replyingThreadId}
						replyParentCommentId={replyParentCommentId}
						editingCommentId={editingCommentId}
						editBody={editBody}
						replyBody={replyBody}
						isReplySubmitting={isReplySubmitting}
						editComposerRef={editComposerRef}
						replyComposerRef={replyComposerRef}
						setEditBody={setEditBody}
						setReplyBody={setReplyBody}
						handleSaveEdit={handleSaveEdit}
						handleReply={handleReply}
						handleStartReplyToComment={handleStartReplyToComment}
						handleStartEditComment={handleStartEditComment}
						handleDeleteComment={handleDeleteComment}
						isReplyComposerOpen={isReplyComposerOpen}
					/>
				)
			) : null}
		</div>
	);
}

function DiscussionThreadSummary({
	thread,
	threadAuthor,
	isRead,
	isActive,
	threadActionsOpenId,
	setThreadActionsOpenId,
	handleMarkThreadRead,
	handleMarkThreadUnread,
	handleStartEditThread,
	handleCopyThreadLink,
	handleToggleMuteThread,
	handleDeleteThread,
	handleOpenThread,
}: {
	thread: ThreadSummary;
	threadAuthor: ReturnType<typeof resolveAuthorIdentity>;
	isRead: boolean;
	isActive: boolean;
	threadActionsOpenId: Id<"noteCommentThreads"> | null;
	setThreadActionsOpenId: (threadId: Id<"noteCommentThreads"> | null) => void;
	handleMarkThreadRead: (thread: ThreadSummary) => void;
	handleMarkThreadUnread: (threadId: Id<"noteCommentThreads">) => void;
	handleStartEditThread: (thread: ThreadSummary) => void;
	handleCopyThreadLink: (threadId: Id<"noteCommentThreads">) => Promise<void>;
	handleToggleMuteThread: (thread: ThreadSummary) => void;
	handleDeleteThread: (threadId: Id<"noteCommentThreads">) => void;
	handleOpenThread: (thread: ThreadSummary) => void;
}) {
	return (
		<div
			className={cn(
				"group transition-colors hover:bg-accent/20",
				isActive && "bg-accent/10",
			)}
		>
			<div className="flex items-start gap-3 px-3 py-3">
				<button
					type="button"
					className="min-w-0 flex-1 cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
					onClick={() => handleMarkThreadRead(thread)}
				>
					<div
						className={cn(
							"grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1",
							isRead && "opacity-50",
						)}
					>
						<div className="flex pt-0.5">
							<Avatar className="size-4">
								<AvatarImage
									src={threadAuthor.avatarSrc ?? undefined}
									alt={threadAuthor.name}
								/>
								<AvatarFallback className="text-[9px] font-medium">
									{getAvatarLabel(threadAuthor.name)}
								</AvatarFallback>
							</Avatar>
						</div>
						<div className="min-w-0">
							<p className="truncate text-sm font-medium">
								{formatDiscussionTitle(
									threadAuthor.name,
									thread.latestCommentIsReply ?? false,
								)}
							</p>
						</div>
						<div className="col-start-2 min-w-0">
							<p className="truncate text-xs leading-4 text-muted-foreground">
								{thread.excerpt}
							</p>
						</div>
						<div className="col-start-2 min-w-0">
							<p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
								{thread.latestCommentPreview}
							</p>
						</div>
					</div>
				</button>
				<div className="relative flex min-w-[3.75rem] shrink-0 items-start justify-end pt-0.5">
					<span
						className={cn(
							"pointer-events-none text-xs text-muted-foreground transition-opacity duration-150",
							threadActionsOpenId === thread._id
								? "opacity-0"
								: "opacity-100 group-hover:opacity-0 group-focus-within:opacity-0",
						)}
					>
						{formatCommentTimestamp(thread.updatedAt)}
					</span>
					<DropdownMenu
						open={threadActionsOpenId === thread._id}
						onOpenChange={(nextOpen) =>
							setThreadActionsOpenId(nextOpen ? thread._id : null)
						}
					>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								className={cn(
									"absolute top-0 right-0 z-10 h-6 w-6 cursor-pointer rounded-md transition-opacity duration-150",
									threadActionsOpenId === thread._id
										? "opacity-100"
										: "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
								)}
								aria-label="Comment actions"
							>
								<MoreHorizontal className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-40">
							<DropdownMenuItem
								className="cursor-pointer"
								onSelect={() =>
									isRead
										? handleMarkThreadUnread(thread._id)
										: handleMarkThreadRead(thread)
								}
							>
								{isRead ? (
									<Square className="size-4" />
								) : (
									<Check className="size-4" />
								)}
								<span>{isRead ? "Mark as unread" : "Mark as read"}</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								onSelect={() => handleStartEditThread(thread)}
							>
								<PencilLine className="size-4" />
								<span>Edit</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								className="cursor-pointer"
								onSelect={() => void handleCopyThreadLink(thread._id)}
							>
								<Link2 className="size-4" />
								<span>Copy link</span>
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								className="cursor-pointer"
								onSelect={() => handleToggleMuteThread(thread)}
							>
								{thread.isMutedReplies ? (
									<Bell className="size-4" />
								) : (
									<BellOff className="size-4" />
								)}
								<span>
									{thread.isMutedReplies ? "Unmute replies" : "Mute replies"}
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								className="cursor-pointer"
								onSelect={() => handleDeleteThread(thread._id)}
							>
								<Trash2 className="size-4" />
								<span>Delete</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
			<div className="px-3 pb-3 pl-9">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="relative z-10 cursor-pointer text-xs"
					onClick={() => handleOpenThread(thread)}
				>
					Reply
				</Button>
			</div>
		</div>
	);
}

function ExpandedDiscussionThread({
	expandedDetail,
	activeCommentTree,
	currentUser,
	commentActionsOpenId,
	setCommentActionsOpenId,
	replyingThreadId,
	replyParentCommentId,
	editingCommentId,
	editBody,
	replyBody,
	isReplySubmitting,
	editComposerRef,
	replyComposerRef,
	setEditBody,
	setReplyBody,
	handleSaveEdit,
	handleReply,
	handleStartReplyToComment,
	handleStartEditComment,
	handleDeleteComment,
	isReplyComposerOpen,
}: {
	expandedDetail: ThreadDetail;
	activeCommentTree: ThreadCommentNode[];
	currentUser: CommentViewer;
	commentActionsOpenId: Id<"noteComments"> | null;
	setCommentActionsOpenId: (commentId: Id<"noteComments"> | null) => void;
	replyingThreadId: Id<"noteCommentThreads"> | null;
	replyParentCommentId: Id<"noteComments"> | null;
	editingCommentId: Id<"noteComments"> | null;
	editBody: string;
	replyBody: string;
	isReplySubmitting: boolean;
	editComposerRef: React.RefObject<HTMLDivElement | null>;
	replyComposerRef: React.RefObject<HTMLDivElement | null>;
	setEditBody: (value: string) => void;
	setReplyBody: (value: string) => void;
	handleSaveEdit: () => void;
	handleReply: () => void;
	handleStartReplyToComment: (comment: ThreadComment) => void;
	handleStartEditComment: (comment: ThreadComment) => void;
	handleDeleteComment: (comment: ThreadComment) => void;
	isReplyComposerOpen: boolean;
}) {
	return (
		<div className="mx-4 mt-4 border-t pt-4">
			<div className="space-y-4">
				{activeCommentTree.map((node) => (
					<ThreadCommentNodeItem
						key={node.comment._id}
						node={node}
						currentUser={currentUser}
						commentActionsOpenId={commentActionsOpenId}
						setCommentActionsOpenId={setCommentActionsOpenId}
						replyingThreadId={replyingThreadId}
						replyParentCommentId={replyParentCommentId}
						editingCommentId={editingCommentId}
						editBody={editBody}
						replyBody={replyBody}
						isReplySubmitting={isReplySubmitting}
						editComposerRef={editComposerRef}
						replyComposerRef={replyComposerRef}
						setEditBody={setEditBody}
						setReplyBody={setReplyBody}
						handleSaveEdit={handleSaveEdit}
						handleReply={handleReply}
						handleStartReplyToComment={handleStartReplyToComment}
						handleStartEditComment={handleStartEditComment}
						handleDeleteComment={handleDeleteComment}
					/>
				))}
			</div>

			{expandedDetail.isResolved ||
			!isReplyComposerOpen ||
			replyParentCommentId ? null : (
				<div className="mt-4">
					<CommentComposerField
						value={replyBody}
						onChange={setReplyBody}
						onSubmit={handleReply}
						isSubmitting={isReplySubmitting}
						ariaLabel="Reply to thread"
						sendAriaLabel="Send reply"
						placeholder="Reply..."
					/>
				</div>
			)}
		</div>
	);
}

function CommentsSheetPanel({
	isMobile,
	open,
	desktopSafeTop,
	isPinned,
	filtersOpen,
	setFiltersOpen,
	view,
	setView,
	onTogglePinned,
	onOpenChange,
	pendingSelection,
	draftBody,
	setDraftBody,
	handleCreateThread,
	isCreating,
	visibleThreads,
	activeThreadId,
	expandedThreadId,
	replyingThreadId,
	replyParentCommentId,
	editingCommentId,
	expandedThread,
	optimisticReadThreadIds,
	currentUser,
	threadActionsOpenId,
	setThreadActionsOpenId,
	handleMarkThreadRead,
	handleMarkThreadUnread,
	handleStartEditThread,
	handleCopyThreadLink,
	handleToggleMuteThread,
	handleDeleteThread,
	handleOpenThread,
	activeCommentTree,
	commentActionsOpenId,
	setCommentActionsOpenId,
	editBody,
	replyBody,
	isReplySubmitting,
	editComposerRef,
	replyComposerRef,
	setEditBody,
	setReplyBody,
	handleSaveEdit,
	handleReply,
	handleStartReplyToComment,
	handleStartEditComment,
	handleDeleteComment,
}: {
	isMobile: boolean;
	open: boolean;
	desktopSafeTop: boolean;
	isPinned: boolean;
	filtersOpen: boolean;
	setFiltersOpen: (open: boolean) => void;
	view: ThreadView;
	setView: (view: ThreadView) => void;
	onTogglePinned: () => void;
	onOpenChange: (open: boolean) => void;
	pendingSelection: PendingNoteCommentSelection | null;
	draftBody: string;
	setDraftBody: (value: string) => void;
	handleCreateThread: () => void;
	isCreating: boolean;
	visibleThreads: ThreadSummary[] | null | undefined;
	activeThreadId: Id<"noteCommentThreads"> | null;
	expandedThreadId: Id<"noteCommentThreads"> | null;
	replyingThreadId: Id<"noteCommentThreads"> | null;
	replyParentCommentId: Id<"noteComments"> | null;
	editingCommentId: Id<"noteComments"> | null;
	expandedThread: ThreadDetail | null | undefined;
	optimisticReadThreadIds: Set<string>;
	currentUser: CommentViewer;
	threadActionsOpenId: Id<"noteCommentThreads"> | null;
	setThreadActionsOpenId: (threadId: Id<"noteCommentThreads"> | null) => void;
	handleMarkThreadRead: (thread: ThreadSummary) => void;
	handleMarkThreadUnread: (threadId: Id<"noteCommentThreads">) => void;
	handleStartEditThread: (thread: ThreadSummary) => void;
	handleCopyThreadLink: (threadId: Id<"noteCommentThreads">) => Promise<void>;
	handleToggleMuteThread: (thread: ThreadSummary) => void;
	handleDeleteThread: (threadId: Id<"noteCommentThreads">) => void;
	handleOpenThread: (thread: ThreadSummary) => void;
	activeCommentTree: ThreadCommentNode[];
	commentActionsOpenId: Id<"noteComments"> | null;
	setCommentActionsOpenId: (commentId: Id<"noteComments"> | null) => void;
	editBody: string;
	replyBody: string;
	isReplySubmitting: boolean;
	editComposerRef: React.RefObject<HTMLDivElement | null>;
	replyComposerRef: React.RefObject<HTMLDivElement | null>;
	setEditBody: (value: string) => void;
	setReplyBody: (value: string) => void;
	handleSaveEdit: () => void;
	handleReply: () => void;
	handleStartReplyToComment: (comment: ThreadComment) => void;
	handleStartEditComment: (comment: ThreadComment) => void;
	handleDeleteComment: (comment: ThreadComment) => void;
}) {
	const threadList = visibleThreads ?? [];

	return (
		<div className="flex h-full flex-col bg-background text-foreground">
			<div
				data-app-region={!isMobile && open ? "no-drag" : undefined}
				className={cn(
					"flex w-full items-center justify-between",
					!isMobile && (desktopSafeTop ? "h-10 px-2" : "h-16 px-4"),
					isMobile && "px-4 py-3",
				)}
			>
				{isMobile ? (
					<h2 className="truncate text-sm font-medium">All discussions</h2>
				) : (
					<Breadcrumb
						className={
							desktopSafeTop ? DESKTOP_MAIN_HEADER_CONTENT_CLASS : undefined
						}
					>
						<BreadcrumbList className="gap-0">
							<BreadcrumbItem>
								<BreadcrumbPage>All discussions</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>
				)}
				<div
					className={cn(
						"flex items-center gap-0.5",
						desktopSafeTop && DESKTOP_MAIN_HEADER_CONTENT_CLASS,
					)}
				>
					<DropdownMenu open={filtersOpen} onOpenChange={setFiltersOpen}>
						<Tooltip>
							<TooltipTrigger asChild>
								<DropdownMenuTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Filter comments"
									>
										<SlidersHorizontal className="size-4" />
									</Button>
								</DropdownMenuTrigger>
							</TooltipTrigger>
							<TooltipContent
								side="bottom"
								align="end"
								sideOffset={8}
								className="pointer-events-none select-none"
							>
								Filter comments
							</TooltipContent>
						</Tooltip>
						<DropdownMenuContent align="end" className="min-w-44">
							{THREAD_VIEW_OPTIONS.map((option) => (
								<DropdownMenuItem
									key={option.value}
									onSelect={() => setView(option.value)}
								>
									<span>{option.label}</span>
									{view === option.value ? (
										<Check className="ml-auto size-4 text-foreground" />
									) : null}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
					{!isMobile ? (
						<DockedPanelPinButton
							isPinned={isPinned}
							label="comments"
							onTogglePinned={onTogglePinned}
						/>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={() => onOpenChange(false)}
					>
						<Minus className="size-4" />
						<span className="sr-only">Close comments</span>
					</Button>
				</div>
			</div>

			{pendingSelection ? (
				<div className="bg-accent/10 px-4 py-4">
					<p className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground">
						{pendingSelection.text}
					</p>
					<CommentComposerField
						value={draftBody}
						onChange={setDraftBody}
						onSubmit={handleCreateThread}
						isSubmitting={isCreating}
						ariaLabel="New comment"
						sendAriaLabel="Send comment"
						placeholder="Add a comment..."
					/>
				</div>
			) : null}

			<ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
				{visibleThreads === undefined ? null : threadList.length === 0 ? (
					pendingSelection ? null : (
						<Empty className="min-h-[24rem] border-none">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<MessageSquareMore className="size-4" />
								</EmptyMedia>
								<EmptyTitle>No discussions yet</EmptyTitle>
								<EmptyDescription>
									Select text in the note to start the first thread.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)
				) : (
					<div>
						{threadList.map((thread) => (
							<DiscussionThreadRow
								key={thread._id}
								thread={thread}
								currentUser={currentUser}
								activeThreadId={activeThreadId}
								expandedThreadId={expandedThreadId}
								replyingThreadId={replyingThreadId}
								replyParentCommentId={replyParentCommentId}
								editingCommentId={editingCommentId}
								threadActionsOpenId={threadActionsOpenId}
								expandedThread={expandedThread}
								optimisticReadThreadIds={optimisticReadThreadIds}
								isReplySubmitting={isReplySubmitting}
								replyBody={replyBody}
								handleMarkThreadRead={handleMarkThreadRead}
								handleMarkThreadUnread={handleMarkThreadUnread}
								handleStartEditThread={handleStartEditThread}
								handleCopyThreadLink={handleCopyThreadLink}
								handleToggleMuteThread={handleToggleMuteThread}
								handleDeleteThread={handleDeleteThread}
								handleOpenThread={handleOpenThread}
								activeCommentTree={activeCommentTree}
								commentActionsOpenId={commentActionsOpenId}
								setCommentActionsOpenId={setCommentActionsOpenId}
								editBody={editBody}
								editComposerRef={editComposerRef}
								replyComposerRef={replyComposerRef}
								setEditBody={setEditBody}
								setReplyBody={setReplyBody}
								handleSaveEdit={handleSaveEdit}
								handleReply={handleReply}
								handleStartReplyToComment={handleStartReplyToComment}
								handleStartEditComment={handleStartEditComment}
								handleDeleteComment={handleDeleteComment}
								setThreadActionsOpenId={setThreadActionsOpenId}
							/>
						))}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

type NoteCommentsSheetProps = {
	noteId: Id<"notes"> | null;
	editor: Editor | null;
	currentUser: CommentViewer;
	open: boolean;
	desktopSafeTop?: boolean;
	onOpenChange: (open: boolean) => void;
	activeThreadId: Id<"noteCommentThreads"> | null;
	onActiveThreadIdChange: (threadId: Id<"noteCommentThreads"> | null) => void;
	pendingSelection: PendingNoteCommentSelection | null;
	onPendingSelectionChange: (
		selection: PendingNoteCommentSelection | null,
	) => void;
};

type NoteCommentsSheetControllerProps = NoteCommentsSheetProps & {
	isPinned: boolean;
	onTogglePinned: () => void;
};

function useNoteCommentsSheetController({
	noteId,
	editor,
	currentUser,
	open,
	desktopSafeTop = false,
	isPinned,
	onTogglePinned,
	onOpenChange,
	activeThreadId,
	onActiveThreadIdChange,
	pendingSelection,
	onPendingSelectionChange,
}: NoteCommentsSheetControllerProps) {
	const isMobile = useIsMobile();
	const { handleResizeKeyDown, handleResizeStart, isResizing, panelWidth } =
		useResizableSidePanel({
			isMobile,
			side: "right",
			desktopStorageKey: COMMENTS_PANEL_STORAGE_KEY_DESKTOP,
			mobileStorageKey: COMMENTS_PANEL_STORAGE_KEY_MOBILE,
			defaultDesktopWidth: DESKTOP_DOCKED_PANEL_DEFAULT_WIDTH,
			desktopMinWidth: DESKTOP_DOCKED_PANEL_MIN_WIDTH,
			desktopMaxWidth: DESKTOP_DOCKED_PANEL_MAX_WIDTH,
			mobileMinWidth: MOBILE_DOCKED_PANEL_MIN_WIDTH,
		});
	const workspaceId = useActiveWorkspaceId();
	const [uiState, setUiState] = React.useReducer(
		commentsUiReducer,
		INITIAL_COMMENTS_UI_STATE,
	);
	const {
		view,
		draftBody,
		replyBody,
		editBody,
		expandedThreadId,
		replyingThreadId,
		replyParentCommentId,
		editingThreadId,
		editingCommentId,
		threadActionsOpenId,
		commentActionsOpenId,
		filtersOpen,
	} = uiState;
	const [optimisticReadThreadIds, setOptimisticReadThreadIds] = React.useState<
		Set<string>
	>(() => new Set());
	const [visibleThreadIds, setVisibleThreadIds] = React.useState<Set<string>>(
		() => collectVisibleThreadIds(editor),
	);
	const [isCreating, startCreating] = React.useTransition();
	const [isReplySubmitting, startReplying] = React.useTransition();
	const replyComposerRef = React.useRef<HTMLDivElement | null>(null);
	const editComposerRef = React.useRef<HTMLDivElement | null>(null);
	const setDraftBody = React.useCallback(
		(value: string) => setUiState({ draftBody: value }),
		[],
	);
	const setReplyBody = React.useCallback(
		(value: string) => setUiState({ replyBody: value }),
		[],
	);
	const setEditBody = React.useCallback(
		(value: string) => setUiState({ editBody: value }),
		[],
	);
	const resetReplyComposer = React.useCallback(() => {
		setUiState({
			replyBody: "",
			replyParentCommentId: null,
		});
	}, []);
	const resetExpandedThreadUi = React.useCallback(() => {
		setUiState({
			replyingThreadId: null,
			replyParentCommentId: null,
			editingThreadId: null,
			editingCommentId: null,
			editBody: "",
			commentActionsOpenId: null,
		});
	}, []);
	const collapseExpandedThread = React.useCallback(() => {
		setUiState({
			expandedThreadId: null,
			replyingThreadId: null,
			replyParentCommentId: null,
		});
	}, []);
	const syncEditingLatestComment = React.useCallback((thread: ThreadDetail) => {
		const latestComment = thread.comments.at(-1);
		if (!latestComment) {
			setUiState({
				editingThreadId: null,
				editingCommentId: null,
				editBody: "",
			});
			return;
		}

		setUiState({
			editingCommentId: latestComment._id,
			editBody: latestComment.body,
			editingThreadId: null,
		});
	}, []);
	const handleDismissInlineEdit = React.useCallback(() => {
		setUiState({
			editingCommentId: null,
			editBody: "",
			replyingThreadId: expandedThreadId ?? null,
			replyParentCommentId: null,
		});
	}, [expandedThreadId]);

	const threads = useQuery(
		api.noteComments.listThreads,
		workspaceId && noteId
			? {
					workspaceId,
					noteId,
					view,
				}
			: "skip",
	);
	const expandedThread = useQuery(
		api.noteComments.getThread,
		workspaceId && noteId && expandedThreadId
			? {
					workspaceId,
					noteId,
					threadId: expandedThreadId,
				}
			: "skip",
	) as ThreadDetail | null | undefined;
	const createThread = useMutation(api.noteComments.createThread);
	const addComment = useMutation(api.noteComments.addComment);
	const markRead = useMutation(api.noteComments.markRead);
	const markUnread = useMutation(api.noteComments.markUnread);
	const updateComment = useMutation(api.noteComments.updateComment);
	const deleteComment = useMutation(api.noteComments.deleteComment);
	const toggleMuteReplies = useMutation(api.noteComments.toggleMuteReplies);
	const deleteThread = useMutation(api.noteComments.deleteThread);
	const visibleThreads = React.useMemo(
		() =>
			threads?.filter((thread) => visibleThreadIds.has(String(thread._id))) ??
			threads,
		[threads, visibleThreadIds],
	);

	React.useEffect(() => {
		setVisibleThreadIds(collectVisibleThreadIds(editor));

		if (!editor) {
			return;
		}

		const syncVisibleThreads = () => {
			setVisibleThreadIds(collectVisibleThreadIds(editor));
		};

		editor.on("transaction", syncVisibleThreads);
		return () => {
			editor.off("transaction", syncVisibleThreads);
		};
	}, [editor]);

	React.useEffect(() => {
		if (!pendingSelection) {
			setUiState({ draftBody: "" });
			return;
		}

		setUiState({ view: "all" });
	}, [pendingSelection]);

	React.useEffect(() => {
		if (!open && pendingSelection) {
			onPendingSelectionChange(null);
		}
	}, [open, onPendingSelectionChange, pendingSelection]);

	React.useEffect(() => {
		void expandedThreadId;
		resetReplyComposer();
	}, [expandedThreadId, resetReplyComposer]);

	React.useEffect(() => {
		if (!expandedThreadId) {
			resetExpandedThreadUi();
		}
	}, [expandedThreadId, resetExpandedThreadUi]);

	React.useEffect(() => {
		if (
			expandedThreadId &&
			visibleThreads &&
			!visibleThreads.some((thread) => thread._id === expandedThreadId)
		) {
			collapseExpandedThread();
		}
	}, [collapseExpandedThread, expandedThreadId, visibleThreads]);

	React.useEffect(() => {
		if (!threads || optimisticReadThreadIds.size === 0) {
			return;
		}

		setOptimisticReadThreadIds((current) => {
			let changed = false;
			const next = new Set(current);

			for (const thread of threads) {
				if (!thread.isRead && next.delete(String(thread._id))) {
					changed = true;
				}
			}

			return changed ? next : current;
		});
	}, [optimisticReadThreadIds.size, threads]);

	React.useEffect(() => {
		if (activeThreadId !== expandedThreadId) {
			collapseExpandedThread();
		}
	}, [activeThreadId, collapseExpandedThread, expandedThreadId]);

	React.useEffect(() => {
		if (!replyParentCommentId && !editingCommentId) {
			return;
		}

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			if (
				replyParentCommentId &&
				replyComposerRef.current &&
				!replyComposerRef.current.contains(target)
			) {
				setUiState({ replyParentCommentId: null });
			}

			if (
				editingCommentId &&
				editComposerRef.current &&
				!editComposerRef.current.contains(target)
			) {
				handleDismissInlineEdit();
			}
		};

		document.addEventListener("pointerdown", handlePointerDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [editingCommentId, handleDismissInlineEdit, replyParentCommentId]);

	const activeCommentTree = React.useMemo(
		() => (expandedThread ? buildCommentTree(expandedThread.comments) : []),
		[expandedThread],
	);

	React.useEffect(() => {
		if (!expandedThread || editingThreadId !== expandedThread._id) {
			return;
		}

		syncEditingLatestComment(expandedThread);
	}, [editingThreadId, expandedThread, syncEditingLatestComment]);

	const handleCreateThread = React.useCallback(() => {
		if (
			!workspaceId ||
			!noteId ||
			!pendingSelection ||
			!editor ||
			draftBody.trim().length === 0
		) {
			return;
		}

		startCreating(() => {
			void createThread({
				workspaceId,
				noteId,
				excerpt: pendingSelection.text,
				body: draftBody,
			})
				.then((threadId) => {
					editor
						.chain()
						.focus()
						.setTextSelection({
							from: pendingSelection.from,
							to: pendingSelection.to,
						})
						.setNoteComment({ threadId: String(threadId) })
						.run();
					setUiState({
						draftBody: "",
						expandedThreadId: null,
						replyingThreadId: null,
						replyParentCommentId: null,
					});
					onPendingSelectionChange(null);
					onActiveThreadIdChange(threadId);
					toast.success("Comment added");
				})
				.catch((error) => {
					toast.error(getErrorMessage(error, "Failed to add comment"));
				});
		});
	}, [
		createThread,
		draftBody,
		editor,
		noteId,
		onActiveThreadIdChange,
		onPendingSelectionChange,
		pendingSelection,
		workspaceId,
	]);

	const handleReply = React.useCallback(() => {
		if (
			!workspaceId ||
			!noteId ||
			!expandedThreadId ||
			replyBody.trim().length === 0
		) {
			return;
		}

		startReplying(() => {
			void addComment({
				workspaceId,
				noteId,
				threadId: expandedThreadId,
				parentCommentId: replyParentCommentId ?? undefined,
				body: replyBody,
			})
				.then(() => {
					setUiState({
						replyBody: "",
						replyParentCommentId: null,
					});
					toast.success("Reply sent");
				})
				.catch((error) => {
					toast.error(getErrorMessage(error, "Failed to send reply"));
				});
		});
	}, [
		addComment,
		expandedThreadId,
		noteId,
		replyBody,
		replyParentCommentId,
		workspaceId,
	]);

	const handleMarkThreadRead = React.useCallback(
		(thread: ThreadSummary) => {
			if (!workspaceId || !noteId) {
				return;
			}

			const optimisticThreadId = String(thread._id);
			if (thread.isRead || optimisticReadThreadIds.has(optimisticThreadId)) {
				return;
			}

			setOptimisticReadThreadIds((current) => {
				const next = new Set(current);
				next.add(optimisticThreadId);
				return next;
			});

			void markRead({
				workspaceId,
				noteId,
				threadId: thread._id,
			}).catch((error) => {
				setOptimisticReadThreadIds((current) => {
					const next = new Set(current);
					next.delete(optimisticThreadId);
					return next;
				});
				toast.error(
					getErrorMessage(error, "Failed to mark discussion as read"),
				);
			});
		},
		[markRead, noteId, optimisticReadThreadIds, workspaceId],
	);

	const removeThreadMarks = React.useCallback(
		(threadId: Id<"noteCommentThreads">) => {
			if (!editor) {
				return;
			}

			const noteCommentMark = editor.state.schema.marks.noteComment;
			if (!noteCommentMark) {
				return;
			}

			const transaction = editor.state.tr;

			editor.state.doc.descendants((node, position) => {
				if (!node.isText || !node.marks.length) {
					return;
				}

				const hasMatchingCommentMark = node.marks.some(
					(mark) =>
						mark.type === noteCommentMark &&
						mark.attrs.threadId === String(threadId),
				);

				if (!hasMatchingCommentMark) {
					return;
				}

				transaction.removeMark(
					position,
					position + node.nodeSize,
					noteCommentMark,
				);
			});

			if (transaction.docChanged) {
				editor.view.dispatch(transaction);
			}
		},
		[editor],
	);

	const handleOpenThread = React.useCallback(
		(thread: ThreadSummary) => {
			onPendingSelectionChange(null);
			if (expandedThreadId === thread._id) {
				if (replyingThreadId === thread._id && replyParentCommentId === null) {
					setUiState({
						expandedThreadId: null,
						replyingThreadId: null,
						replyParentCommentId: null,
					});
					handleMarkThreadRead(thread);
					return;
				}

				setUiState({
					expandedThreadId: thread._id,
					replyingThreadId: thread._id,
					replyParentCommentId: null,
				});
				handleMarkThreadRead(thread);
				return;
			}

			setUiState({
				expandedThreadId: thread._id,
				replyingThreadId: thread._id,
				replyParentCommentId: null,
			});
			handleMarkThreadRead(thread);
			onActiveThreadIdChange(thread._id);
		},
		[
			expandedThreadId,
			handleMarkThreadRead,
			onActiveThreadIdChange,
			onPendingSelectionChange,
			replyParentCommentId,
			replyingThreadId,
		],
	);

	const handleMarkThreadUnread = React.useCallback(
		(threadId: Id<"noteCommentThreads">) => {
			if (!workspaceId || !noteId) {
				return;
			}

			setUiState({ threadActionsOpenId: null });
			setOptimisticReadThreadIds((current) => {
				const next = new Set(current);
				next.delete(String(threadId));
				return next;
			});

			void markUnread({
				workspaceId,
				noteId,
				threadId,
			})
				.then(() => {
					toast.success("Marked as unread");
				})
				.catch((error) => {
					toast.error(
						getErrorMessage(error, "Failed to mark discussion as unread"),
					);
				});
		},
		[markUnread, noteId, workspaceId],
	);

	const handleStartEditThread = React.useCallback(
		(thread: ThreadSummary) => {
			setUiState({
				threadActionsOpenId: null,
				replyingThreadId: null,
				replyParentCommentId: null,
				expandedThreadId: thread._id,
				editingThreadId: thread._id,
			});
			onActiveThreadIdChange(thread._id);
		},
		[onActiveThreadIdChange],
	);

	const handleStartReplyToComment = React.useCallback(
		(comment: ThreadComment) => {
			setUiState({
				commentActionsOpenId: null,
				editingCommentId: null,
				editBody: "",
				expandedThreadId: comment.threadId,
				replyingThreadId: comment.threadId,
				replyParentCommentId: comment._id,
			});
			onActiveThreadIdChange(comment.threadId);
		},
		[onActiveThreadIdChange],
	);

	const handleStartEditComment = React.useCallback((comment: ThreadComment) => {
		setUiState({
			commentActionsOpenId: null,
			replyingThreadId: null,
			replyParentCommentId: null,
			editingCommentId: comment._id,
			editBody: comment.body,
		});
	}, []);

	const handleSaveEdit = React.useCallback(() => {
		if (
			!workspaceId ||
			!noteId ||
			!expandedThreadId ||
			!editingCommentId ||
			editBody.trim().length === 0
		) {
			return;
		}

		startReplying(() => {
			void updateComment({
				workspaceId,
				noteId,
				threadId: expandedThreadId,
				commentId: editingCommentId,
				body: editBody,
			})
				.then(() => {
					setUiState({
						editingCommentId: null,
						editBody: "",
						commentActionsOpenId: null,
					});
					toast.success("Comment updated");
				})
				.catch((error) => {
					toast.error(getErrorMessage(error, "Failed to update comment"));
				});
		});
	}, [
		editBody,
		editingCommentId,
		expandedThreadId,
		noteId,
		updateComment,
		workspaceId,
	]);

	const handleDeleteComment = React.useCallback(
		(comment: ThreadComment) => {
			if (!workspaceId || !noteId) {
				return;
			}

			setUiState({ commentActionsOpenId: null });

			void deleteComment({
				workspaceId,
				noteId,
				threadId: comment.threadId,
				commentId: comment._id,
			})
				.then(() => {
					if (
						expandedThread &&
						expandedThread._id === comment.threadId &&
						expandedThread.comments.length === 1
					) {
						setUiState({
							expandedThreadId: null,
							replyingThreadId: null,
							replyParentCommentId: null,
						});
						onActiveThreadIdChange(null);
					}

					if (editingCommentId === comment._id) {
						setUiState({
							editingCommentId: null,
							editBody: "",
						});
					}

					if (replyParentCommentId === comment._id) {
						setUiState({ replyParentCommentId: null });
					}

					toast.success("Comment deleted");
				})
				.catch((error) => {
					toast.error(getErrorMessage(error, "Failed to delete comment"));
				});
		},
		[
			deleteComment,
			editingCommentId,
			expandedThread,
			noteId,
			onActiveThreadIdChange,
			replyParentCommentId,
			workspaceId,
		],
	);

	const handleCopyThreadLink = React.useCallback(
		async (threadId: Id<"noteCommentThreads">) => {
			if (!noteId) {
				return;
			}

			setUiState({ threadActionsOpenId: null });

			try {
				const url = new URL(window.location.href);
				url.pathname = "/note";
				url.searchParams.set("noteId", String(noteId));
				url.searchParams.set("commentThreadId", String(threadId));
				await writeTextToClipboard(url.toString());
				toast.success("Link copied");
			} catch (error) {
				toast.error(getErrorMessage(error, "Failed to copy link"));
			}
		},
		[noteId],
	);

	const handleToggleMuteThread = React.useCallback(
		(thread: ThreadSummary) => {
			if (!workspaceId || !noteId) {
				return;
			}

			setUiState({ threadActionsOpenId: null });

			void toggleMuteReplies({
				workspaceId,
				noteId,
				threadId: thread._id,
			})
				.then((muted) => {
					toast.success(muted ? "Replies muted" : "Replies unmuted");
				})
				.catch((error) => {
					toast.error(getErrorMessage(error, "Failed to update mute setting"));
				});
		},
		[noteId, toggleMuteReplies, workspaceId],
	);

	const handleDeleteThread = React.useCallback(
		(threadId: Id<"noteCommentThreads">) => {
			if (!workspaceId || !noteId) {
				return;
			}

			setUiState({ threadActionsOpenId: null });

			void deleteThread({
				workspaceId,
				noteId,
				threadId,
			})
				.then(() => {
					removeThreadMarks(threadId);
					setUiState({
						commentActionsOpenId: null,
						replyParentCommentId: null,
					});

					if (activeThreadId === threadId) {
						onActiveThreadIdChange(null);
					}

					if (expandedThreadId === threadId) {
						setUiState({
							expandedThreadId: null,
							replyingThreadId: null,
						});
					}

					toast.success("Comment deleted");
				})
				.catch((error) => {
					toast.error(getErrorMessage(error, "Failed to delete comment"));
				});
		},
		[
			activeThreadId,
			deleteThread,
			expandedThreadId,
			noteId,
			onActiveThreadIdChange,
			removeThreadMarks,
			workspaceId,
		],
	);

	const panel = (
		<CommentsSheetPanel
			isMobile={isMobile}
			open={open}
			desktopSafeTop={desktopSafeTop}
			isPinned={isPinned}
			filtersOpen={filtersOpen}
			setFiltersOpen={(nextOpen) => setUiState({ filtersOpen: nextOpen })}
			view={view}
			setView={(nextView) => setUiState({ view: nextView })}
			onTogglePinned={onTogglePinned}
			onOpenChange={onOpenChange}
			pendingSelection={pendingSelection}
			draftBody={draftBody}
			setDraftBody={setDraftBody}
			handleCreateThread={handleCreateThread}
			isCreating={isCreating}
			visibleThreads={visibleThreads}
			activeThreadId={activeThreadId}
			expandedThreadId={expandedThreadId}
			replyingThreadId={replyingThreadId}
			replyParentCommentId={replyParentCommentId}
			editingCommentId={editingCommentId}
			expandedThread={expandedThread}
			optimisticReadThreadIds={optimisticReadThreadIds}
			currentUser={currentUser}
			threadActionsOpenId={threadActionsOpenId}
			setThreadActionsOpenId={(threadId) =>
				setUiState({ threadActionsOpenId: threadId })
			}
			handleMarkThreadRead={handleMarkThreadRead}
			handleMarkThreadUnread={handleMarkThreadUnread}
			handleStartEditThread={handleStartEditThread}
			handleCopyThreadLink={handleCopyThreadLink}
			handleToggleMuteThread={handleToggleMuteThread}
			handleDeleteThread={handleDeleteThread}
			handleOpenThread={handleOpenThread}
			activeCommentTree={activeCommentTree}
			commentActionsOpenId={commentActionsOpenId}
			setCommentActionsOpenId={(commentId) =>
				setUiState({ commentActionsOpenId: commentId })
			}
			editBody={editBody}
			replyBody={replyBody}
			isReplySubmitting={isReplySubmitting}
			editComposerRef={editComposerRef}
			replyComposerRef={replyComposerRef}
			setEditBody={setEditBody}
			setReplyBody={setReplyBody}
			handleSaveEdit={handleSaveEdit}
			handleReply={handleReply}
			handleStartReplyToComment={handleStartReplyToComment}
			handleStartEditComment={handleStartEditComment}
			handleDeleteComment={handleDeleteComment}
		/>
	);

	return {
		handleResizeKeyDown,
		handleResizeStart,
		isMobile,
		isResizing,
		panel,
		panelWidth,
	};
}

export function NoteCommentsSheet(props: NoteCommentsSheetProps) {
	const { open, onOpenChange } = props;
	const { isPinned, togglePinned } = useDesktopPanelPin({
		storageKey: COMMENTS_PANEL_PINNED_STORAGE_KEY,
	});
	const {
		handleResizeKeyDown,
		handleResizeStart,
		isMobile,
		isResizing,
		panel,
		panelWidth,
	} = useNoteCommentsSheetController({
		...props,
		isPinned,
		onTogglePinned: togglePinned,
	});

	useDockedPanelInset({
		side: "right",
		isMobile,
		isPinned,
		open,
		panelWidth,
	});

	if (isMobile) {
		return (
			<Sheet open={open} onOpenChange={onOpenChange}>
				<SheetContent
					side="right"
					showCloseButton={false}
					className="group/docked-sheet gap-0 border-l bg-background p-0 shadow-none data-[side=right]:sm:max-w-none"
					style={{
						width: panelWidth,
						maxWidth: "100vw",
					}}
				>
					<SheetTitle className="sr-only">Comments</SheetTitle>
					<SheetDescription className="sr-only">
						Review and reply to note comment threads.
					</SheetDescription>
					<ResizableSidePanelHandle
						side="right"
						label="Resize comments panel"
						panelWidth={panelWidth}
						isResizing={isResizing}
						className="opacity-0 transition-opacity duration-150 group-hover/docked-sheet:opacity-100 group-focus-within/docked-sheet:opacity-100"
						onPointerDown={handleResizeStart}
						onKeyDown={handleResizeKeyDown}
					/>
					{panel}
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<DesktopDockedSidePanel
			side="right"
			open={open}
			isPinned={isPinned}
			panelWidth={panelWidth}
			desktopSafeTop={props.desktopSafeTop}
			onOpenChange={onOpenChange}
			panelName="comments"
			resizeLabel="Resize comments panel"
			isResizing={isResizing}
			onResizeStart={handleResizeStart}
			onResizeKeyDown={handleResizeKeyDown}
		>
			{panel}
		</DesktopDockedSidePanel>
	);
}
