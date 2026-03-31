import { useChat } from "@ai-sdk/react";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
} from "@workspace/ui/components/select";
import { Sidebar, useSidebar } from "@workspace/ui/components/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useQuery } from "convex/react";
import {
	ArrowUp,
	Check,
	ChevronUp,
	Copy,
	LoaderCircle,
	Minus,
	PanelRight,
	PanelRightDashed,
	PanelTopBottomDashed,
	Plus,
	Sparkles,
	ThumbsDown,
	ThumbsUp,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { ShimmerText } from "@/components/ai-elements/shimmer";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { useNoteTranscriptSession } from "@/hooks/use-note-transcript-session";
import { useStickyScrollToBottom } from "@/hooks/use-sticky-scroll-to-bottom";
import { getChatModel } from "@/lib/ai/models";
import { authClient } from "@/lib/auth-client";
import type {
	LiveTranscriptState,
	SystemAudioCaptureSourceMode,
	SystemAudioCaptureStatus,
	TranscriptRecoveryStatus,
	TranscriptUtterance,
} from "@/lib/transcript";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { SpeechInput } from "../ai-elements/speech-input";

type NoteChatPresentation = "inline" | "floating" | "sidebar";
const NOTE_CHAT_MODEL = getChatModel("gpt-5.4-mini");
const NOTE_CHAT_FLOATING_WIDTH = "min(28rem, calc(100vw - 2rem))";
const INLINE_POPOVER_FOOTER_CONTAINER_CLASS = "px-6 pt-2 pb-4";
const INLINE_POPOVER_DEFAULT_HEIGHT = 384;
const INLINE_POPOVER_MIN_HEIGHT = INLINE_POPOVER_DEFAULT_HEIGHT;
const INLINE_POPOVER_MAX_HEIGHT = 680;

type NoteChatSummary = Pick<
	Doc<"chats">,
	"_id" | "_creationTime" | "chatId" | "createdAt" | "title" | "updatedAt"
>;

type NoteComposerProps = {
	noteContext: {
		noteId: string | null;
		title: string;
		text: string;
	};
	autoStartTranscription?: boolean;
	onAutoStartTranscriptionHandled?: () => void;
	onAddMessageToNote?: (text: string) => Promise<void> | void;
	onEnhanceTranscript?: (transcript: string) => Promise<void>;
};

const extractTextParts = (message: UIMessage) =>
	message.parts.filter(
		(part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
			part.type === "text" &&
			typeof part.text === "string" &&
			part.text.length > 0,
	);

const toStoredChatMessages = (
	messages: Array<{
		id: string;
		role: "system" | "user" | "assistant";
		partsJson: string;
		metadataJson?: string;
	}>,
): UIMessage[] =>
	messages.map((message) => ({
		id: message.id,
		role: message.role,
		metadata: message.metadataJson
			? (JSON.parse(message.metadataJson) as UIMessage["metadata"])
			: undefined,
		parts: JSON.parse(message.partsJson) as UIMessage["parts"],
	}));

const isSameCalendarDay = (left: Date, right: Date) =>
	left.getFullYear() === right.getFullYear() &&
	left.getMonth() === right.getMonth() &&
	left.getDate() === right.getDate();

const groupChatsForSelector = (chats: NoteChatSummary[]) => {
	const now = new Date();

	return chats.reduce<{
		today: NoteChatSummary[];
		previous: NoteChatSummary[];
	}>(
		(groups, chat) => {
			const chatDate = new Date(
				chat.updatedAt || chat.createdAt || chat._creationTime,
			);

			if (isSameCalendarDay(chatDate, now)) {
				groups.today.push(chat);
			} else {
				groups.previous.push(chat);
			}

			return groups;
		},
		{ today: [], previous: [] },
	);
};

const getChatText = (message: UIMessage) =>
	extractTextParts(message)
		.map((part) => part.text)
		.join("\n\n")
		.trim();

const createDraftChatId = (): string => crypto.randomUUID();

const useNoteComposerController = ({
	noteContext,
	autoStartTranscription,
	onAutoStartTranscriptionHandled,
	onEnhanceTranscript,
}: NoteComposerProps) => {
	const {
		isMobile,
		rightMode,
		rightOpen,
		rightOpenMobile,
		setHasRightSidebar,
		setRightMode,
		setRightOpen,
		setRightOpenMobile,
	} = useSidebar();
	const [message, setMessage] = React.useState("");
	const [, setIsExpanded] = React.useState(false);
	const [panelMode, setPanelMode] = React.useState<
		"chat" | "transcript" | null
	>(null);
	const [presentationMode, setPresentationMode] =
		React.useState<NoteChatPresentation>("inline");
	const [currentChatId, setCurrentChatId] = React.useState<string>(() =>
		createDraftChatId(),
	);
	const [isPreparingRequest, setIsPreparingRequest] = React.useState(false);
	const [inlinePanelHeight, setInlinePanelHeight] = React.useState(
		INLINE_POPOVER_DEFAULT_HEIGHT,
	);
	const [reactionsByMessageId, setReactionsByMessageId] = React.useState<
		Record<string, "like" | "dislike" | undefined>
	>({});
	const rootRef = React.useRef<HTMLDivElement>(null);
	const inlinePanelRef = React.useRef<HTMLDivElement>(null);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const { containerRef: chatViewportRef } = useStickyScrollToBottom();
	const previousSpeechListeningRef = React.useRef(false);
	const shouldOpenChatOnComposerFocusRef = React.useRef(false);
	const shouldFocusInlineChatRef = React.useRef(false);
	const noteId = (noteContext.noteId as Id<"notes"> | null) ?? null;
	const activeWorkspaceId = useActiveWorkspaceId();
	const previousChatIdRef = React.useRef(currentChatId);
	const previousNoteIdRef = React.useRef(noteId);
	const noteChats = useQuery(
		api.chats.listForNote,
		noteId && activeWorkspaceId
			? {
					workspaceId: activeWorkspaceId,
					noteId,
				}
			: "skip",
	);
	const storedMessages = useQuery(
		api.chats.getMessages,
		activeWorkspaceId
			? {
					workspaceId: activeWorkspaceId,
					chatId: currentChatId,
				}
			: "skip",
	);
	const currentChatSession = useQuery(
		api.chats.getSession,
		activeWorkspaceId
			? {
					workspaceId: activeWorkspaceId,
					chatId: currentChatId,
				}
			: "skip",
	);
	const userPreferences = useQuery(api.userPreferences.get, {});
	const transcriptSession = useNoteTranscriptSession({
		autoStartTranscription,
		noteId,
		onAutoStartTranscriptionHandled,
		onEnhanceTranscript,
		transcriptionLanguage: userPreferences?.transcriptionLanguage ?? null,
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

	const initialMessages = React.useMemo(
		() => toStoredChatMessages(storedMessages ?? []),
		[storedMessages],
	);
	const {
		messages: chatMessages,
		setMessages,
		sendMessage,
		error: chatError,
		status: chatStatus,
		stop,
	} = useChat({
		id: currentChatId,
		messages: initialMessages,
		transport,
	});

	React.useEffect(() => {
		if (previousChatIdRef.current !== currentChatId) {
			previousChatIdRef.current = currentChatId;
			setMessages(initialMessages);
			return;
		}

		if (initialMessages.length === 0) {
			return;
		}

		setMessages((currentMessages) =>
			currentMessages.length === 0 ? initialMessages : currentMessages,
		);
	}, [currentChatId, initialMessages, setMessages]);

	const resetTextareaHeight = React.useCallback(() => {
		if (!textareaRef.current) {
			return;
		}

		textareaRef.current.style.height = "auto";
	}, []);

	const resizeTextarea = React.useCallback(() => {
		if (!textareaRef.current) {
			return;
		}

		textareaRef.current.style.height = "auto";
		textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
	}, []);

	const getInlinePanelMaxHeight = React.useCallback(() => {
		if (typeof window === "undefined") {
			return INLINE_POPOVER_MAX_HEIGHT;
		}

		return Math.max(
			INLINE_POPOVER_MIN_HEIGHT,
			Math.min(INLINE_POPOVER_MAX_HEIGHT, window.innerHeight - 112),
		);
	}, []);

	const clampInlinePanelHeight = React.useCallback(
		(nextHeight: number) => {
			return Math.min(
				getInlinePanelMaxHeight(),
				Math.max(INLINE_POPOVER_MIN_HEIGHT, nextHeight),
			);
		},
		[getInlinePanelMaxHeight],
	);

	React.useEffect(() => {
		const handleWindowResize = () => {
			setInlinePanelHeight((currentHeight) =>
				clampInlinePanelHeight(currentHeight),
			);
		};

		window.addEventListener("resize", handleWindowResize);
		return () => {
			window.removeEventListener("resize", handleWindowResize);
		};
	}, [clampInlinePanelHeight]);

	const handleInlinePanelResizeStart = React.useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button !== 0) {
				return;
			}

			event.preventDefault();
			const startY = event.clientY;
			const startHeight =
				inlinePanelRef.current?.getBoundingClientRect().height ??
				inlinePanelHeight;

			const handlePointerMove = (moveEvent: PointerEvent) => {
				const nextHeight = startHeight + (startY - moveEvent.clientY);
				setInlinePanelHeight(clampInlinePanelHeight(nextHeight));
			};

			const handlePointerUp = () => {
				window.removeEventListener("pointermove", handlePointerMove);
				window.removeEventListener("pointerup", handlePointerUp);
			};

			window.addEventListener("pointermove", handlePointerMove);
			window.addEventListener("pointerup", handlePointerUp, { once: true });
		},
		[clampInlinePanelHeight, inlinePanelHeight],
	);

	const isChatOpen = panelMode === "chat";
	const isTranscriptOpen = panelMode === "transcript";
	const isRightSidebarOpen = isMobile ? rightOpenMobile : rightOpen;
	const shouldShowInlinePanel =
		presentationMode === "inline" || isTranscriptOpen;
	const isSidebarPresentation =
		isChatOpen &&
		presentationMode === "sidebar" &&
		isRightSidebarOpen &&
		rightMode === "sidebar";
	const isChatLoading =
		chatStatus === "submitted" ||
		chatStatus === "streaming" ||
		isPreparingRequest;
	const hasMessage = message.trim().length > 0;
	const canGenerateNotes =
		transcriptSession.isTranscriptSessionReady &&
		transcriptSession.hasPendingGenerateTranscript &&
		!transcriptSession.hasGeneratedLatestTranscript &&
		!transcriptSession.isSpeechListening &&
		!isTranscriptOpen &&
		!transcriptSession.isRefiningTranscript;
	const selectedNoteChat =
		(noteChats ?? []).find((chat) => chat.chatId === currentChatId) ?? null;
	const chatTitle =
		selectedNoteChat?.title?.trim() ||
		currentChatSession?.title?.trim() ||
		"New chat";
	const groupedNoteChats = React.useMemo(
		() => groupChatsForSelector(noteChats ?? []),
		[noteChats],
	);
	const latestNoteChat = noteChats?.[0] ?? null;
	const composerPlaceholder = latestNoteChat ? "Continue chat" : "Ask anything";

	const setRightSidebarOpen = React.useCallback(
		(open: boolean) => {
			if (isMobile) {
				setRightOpenMobile(open);
				return;
			}

			setRightOpen(open);
		},
		[isMobile, setRightOpen, setRightOpenMobile],
	);

	const openRightSidebar = React.useCallback(
		(mode: Exclude<NoteChatPresentation, "inline">) => {
			setPresentationMode(mode);
			setRightMode(mode);
			setRightSidebarOpen(true);
			setPanelMode("chat");
		},
		[setRightMode, setRightSidebarOpen],
	);

	const closeRightSidebar = React.useCallback(() => {
		setRightSidebarOpen(false);
	}, [setRightSidebarOpen]);

	React.useEffect(() => {
		if (previousNoteIdRef.current === noteId) {
			return;
		}

		previousNoteIdRef.current = noteId;
		previousSpeechListeningRef.current = false;

		if (isChatLoading) {
			stop();
		}

		setCurrentChatId(createDraftChatId());
		setMessages([]);
		setMessage("");
		setIsExpanded(false);
		setPanelMode(null);
		setReactionsByMessageId({});
		resetTextareaHeight();
		closeRightSidebar();
	}, [
		closeRightSidebar,
		isChatLoading,
		noteId,
		resetTextareaHeight,
		setMessages,
		stop,
	]);

	React.useEffect(() => {
		setHasRightSidebar(panelMode === "chat" && presentationMode !== "inline");
	}, [panelMode, presentationMode, setHasRightSidebar]);

	React.useEffect(
		() => () => {
			setHasRightSidebar(false);
		},
		[setHasRightSidebar],
	);

	React.useEffect(() => {
		if (
			transcriptSession.isSpeechListening &&
			!previousSpeechListeningRef.current
		) {
			closeRightSidebar();
		}

		if (
			!transcriptSession.isSpeechListening &&
			previousSpeechListeningRef.current
		) {
			closeRightSidebar();
			setPanelMode(null);
		}

		previousSpeechListeningRef.current = transcriptSession.isSpeechListening;
	}, [closeRightSidebar, transcriptSession.isSpeechListening]);

	React.useEffect(() => {
		if (presentationMode === "inline") {
			return;
		}

		if (!isRightSidebarOpen && panelMode === "chat") {
			setPanelMode(null);
		}
	}, [isRightSidebarOpen, panelMode, presentationMode]);

	React.useEffect(() => {
		if (
			panelMode !== "chat" ||
			!shouldShowInlinePanel ||
			!shouldFocusInlineChatRef.current
		) {
			return;
		}

		const focusTextarea = () => {
			if (!textareaRef.current) {
				return;
			}

			textareaRef.current.focus({ preventScroll: true });
			const cursorPosition = textareaRef.current.value.length;
			textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
		};

		const immediateTimeoutId = window.setTimeout(focusTextarea, 0);
		const delayedTimeoutId = window.setTimeout(() => {
			focusTextarea();
			shouldFocusInlineChatRef.current = false;
		}, 50);

		return () => {
			window.clearTimeout(immediateTimeoutId);
			window.clearTimeout(delayedTimeoutId);
		};
	}, [panelMode, shouldShowInlinePanel]);

	React.useEffect(() => {
		if (!panelMode || !shouldShowInlinePanel) {
			return;
		}

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}

			const composedPath = event.composedPath();
			const isInsidePortaledDropdown = composedPath.some((entry) => {
				if (!(entry instanceof HTMLElement)) {
					return false;
				}

				return (
					entry.dataset.slot === "dropdown-menu-content" ||
					entry.dataset.slot === "dropdown-menu-sub-content" ||
					entry.hasAttribute("data-radix-popper-content-wrapper")
				);
			});

			if (rootRef.current?.contains(target)) {
				return;
			}

			if (inlinePanelRef.current?.contains(target)) {
				return;
			}

			if (isInsidePortaledDropdown) {
				return;
			}

			setPanelMode(null);
		};

		document.addEventListener("pointerdown", handlePointerDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [panelMode, shouldShowInlinePanel]);

	const openDraftChat = React.useCallback(() => {
		if (isChatLoading) {
			stop();
		}

		const nextChatId = createDraftChatId();
		setCurrentChatId(nextChatId);
		setMessages([]);

		if (presentationMode === "inline") {
			setPanelMode("chat");
			return;
		}

		openRightSidebar(presentationMode);
	}, [isChatLoading, openRightSidebar, presentationMode, setMessages, stop]);

	const handleSend = React.useCallback(async () => {
		const nextMessage = message.trim();

		if (!nextMessage || isChatLoading) {
			return;
		}

		setIsPreparingRequest(true);
		if (presentationMode === "inline") {
			setPanelMode("chat");
		} else {
			openRightSidebar(presentationMode);
		}

		try {
			const { data } = await authClient.convex.token({
				fetchOptions: { throw: false },
			});

			void sendMessage(
				{ text: nextMessage },
				{
					body: {
						model: NOTE_CHAT_MODEL.model,
						convexToken: data?.token ?? null,
						noteContext: {
							noteId: noteContext.noteId,
							title: noteContext.title,
							text: noteContext.text,
						},
					},
				},
			);
			setMessage("");
			setIsExpanded(false);
			resetTextareaHeight();
		} finally {
			setIsPreparingRequest(false);
		}
	}, [
		isChatLoading,
		message,
		noteContext.noteId,
		noteContext.text,
		noteContext.title,
		openRightSidebar,
		presentationMode,
		resetTextareaHeight,
		sendMessage,
	]);

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		await handleSend();
	};

	const handleTextareaChange = (
		event: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		const nextValue = event.target.value;
		setMessage(nextValue);
		resizeTextarea();
		setIsExpanded(nextValue.length > 100 || nextValue.includes("\n"));
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (
			event.key !== "Enter" ||
			event.shiftKey ||
			event.nativeEvent.isComposing
		) {
			return;
		}

		event.preventDefault();
		void handleSend();
	};

	const handleSelectChat = (chatId: string) => {
		if (currentChatId === chatId) {
			return;
		}

		if (isChatLoading) {
			stop();
		}

		setCurrentChatId(chatId);
		if (presentationMode === "inline") {
			setPanelMode("chat");
			return;
		}

		openRightSidebar(presentationMode);
	};

	const handleSelectInlinePresentation = () => {
		setPresentationMode("inline");
		closeRightSidebar();
		shouldFocusInlineChatRef.current = true;
		setPanelMode("chat");
	};

	const handleSelectRightPresentation = (
		mode: Exclude<NoteChatPresentation, "inline">,
	) => {
		openRightSidebar(mode);
	};

	const handleHideChat = () => {
		closeRightSidebar();
		setPanelMode(null);
	};

	const handleComposerPointerDown = React.useCallback(() => {
		shouldOpenChatOnComposerFocusRef.current = true;
	}, []);

	const handleComposerFocus = React.useCallback(() => {
		if (!shouldOpenChatOnComposerFocusRef.current || !latestNoteChat) {
			return;
		}

		shouldOpenChatOnComposerFocusRef.current = false;
		if (isChatLoading) {
			stop();
		}

		closeRightSidebar();
		setPresentationMode("inline");
		setCurrentChatId(latestNoteChat.chatId);
		shouldFocusInlineChatRef.current = true;
		setPanelMode("chat");
	}, [closeRightSidebar, isChatLoading, latestNoteChat, stop]);

	return {
		autoStartKey: transcriptSession.autoStartKey,
		captureScopeKey: transcriptSession.captureScopeKey,
		canGenerateNotes,
		chatError,
		chatMessages,
		chatTitle,
		chatViewportRef,
		closeRightSidebar,
		composerPlaceholder,
		currentChatId,
		fullTranscript: transcriptSession.fullTranscript,
		groupedNoteChats,
		handleComposerFocus,
		handleComposerPointerDown,
		handleGenerateNotes: transcriptSession.handleGenerateNotes,
		handleHideChat,
		handleKeyDown,
		getInlinePanelMaxHeight,
		handleSelectChat,
		handleSelectInlinePresentation,
		handleSelectRightPresentation,
		handleSubmit,
		handleTextareaChange,
		hasMessage,
		systemAudioStatus: transcriptSession.systemAudioStatus,
		recoveryStatus: transcriptSession.recoveryStatus,
		inlinePanelRef,
		inlinePanelHeight,
		isChatLoading,
		isChatOpen,
		isGeneratingNotes: transcriptSession.isGeneratingNotes,
		isRefiningTranscript: transcriptSession.isRefiningTranscript,
		isMobile,
		isSidebarPresentation,
		isSpeechListening: transcriptSession.isSpeechListening,
		isTranscriptOpen,
		liveTranscriptEntries: transcriptSession.liveTranscriptEntries,
		message,
		noteChats,
		onLiveTranscriptChange: transcriptSession.onLiveTranscriptChange,
		onSystemAudioStatusChange: transcriptSession.onSystemAudioStatusChange,
		onRecoveryStatusChange: transcriptSession.onRecoveryStatusChange,
		onTranscriptListeningChange: transcriptSession.onTranscriptListeningChange,
		orderedTranscriptUtterances: transcriptSession.orderedTranscriptUtterances,
		openDraftChat,
		panelMode,
		presentationMode,
		transcriptViewportRef: transcriptSession.transcriptViewportRef,
		transcriptRefinementError: transcriptSession.transcriptRefinementError,
		reactionsByMessageId,
		rootRef,
		setPanelMode,
		setReactionsByMessageId,
		shouldShowInlinePanel,
		textareaRef,
		transcriptionLanguage: userPreferences?.transcriptionLanguage ?? null,
		onSystemAudioRecordingReady: transcriptSession.onSystemAudioRecordingReady,
		onTranscriptUtterance: transcriptSession.onTranscriptUtterance,
		handleInlinePanelResizeStart,
	};
};

function NoteSpeechControls({
	autoStartKey,
	captureScopeKey,
	isTranscriptOpen,
	onToggleTranscript,
	onLiveTranscriptChange,
	onSystemAudioRecordingReady,
	onSystemAudioStatusChange,
	onRecoveryStatusChange,
	onTranscriptListeningChange,
	onTranscriptUtterance,
	transcriptionLanguage,
}: {
	autoStartKey?: string | number | null;
	captureScopeKey: string;
	isTranscriptOpen: boolean;
	onToggleTranscript: () => void;
	onLiveTranscriptChange: (state: LiveTranscriptState) => void;
	onSystemAudioRecordingReady: (payload: {
		blob: Blob;
		endedAt: number;
		sourceMode: SystemAudioCaptureSourceMode;
		startedAt: number;
	}) => void;
	onSystemAudioStatusChange: (status: SystemAudioCaptureStatus) => void;
	onRecoveryStatusChange: (status: TranscriptRecoveryStatus) => void;
	onTranscriptListeningChange: (isListening: boolean) => void;
	onTranscriptUtterance: (utterance: TranscriptUtterance) => void;
	transcriptionLanguage?: string | null;
}) {
	return (
		<div className="flex items-center gap-1">
			<SpeechInput
				variant="outline"
				size="icon-sm"
				autoStartKey={autoStartKey}
				lang={transcriptionLanguage}
				scopeKey={captureScopeKey}
				className="shrink-0 rounded-full border-input/50 !bg-transparent text-muted-foreground shadow-none hover:!bg-muted hover:text-foreground"
				onListeningChange={onTranscriptListeningChange}
				onLiveTranscriptChange={onLiveTranscriptChange}
				onSystemAudioRecordingReady={onSystemAudioRecordingReady}
				onSystemAudioStatusChange={onSystemAudioStatusChange}
				onRecoveryStatusChange={onRecoveryStatusChange}
				onUtterance={onTranscriptUtterance}
			/>

			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="shrink-0 rounded-full bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
				aria-label="Expand speech controls"
				onClick={onToggleTranscript}
			>
				<ChevronUp
					className={cn(
						"size-4 transition-transform duration-200",
						isTranscriptOpen && "rotate-180",
					)}
				/>
			</Button>
		</div>
	);
}

function NoteChatMessages({
	chatError,
	chatMessages,
	chatViewportRef,
	disableAddToNote,
	disablePadding,
	isChatLoading,
	onAddMessageToNote,
	onReactionChange,
	reactionsByMessageId,
}: {
	chatError: Error | undefined;
	chatMessages: UIMessage[];
	chatViewportRef: React.Ref<HTMLDivElement>;
	disableAddToNote: boolean;
	disablePadding: boolean;
	isChatLoading: boolean;
	onAddMessageToNote?: (text: string) => Promise<void> | void;
	onReactionChange: (messageId: string, reaction: "like" | "dislike") => void;
	reactionsByMessageId: Record<string, "like" | "dislike" | undefined>;
}) {
	return (
		<div
			ref={chatViewportRef}
			className={cn(
				"flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2 pb-2",
				disablePadding && "px-2",
			)}
		>
			{chatMessages.map((chatMessage) => {
				const text = getChatText(chatMessage);
				const isStreamingAssistantMessage =
					isChatLoading &&
					chatMessage.role === "assistant" &&
					chatMessage.id === chatMessages[chatMessages.length - 1]?.id;

				if (!text && !isStreamingAssistantMessage) {
					return null;
				}

				return (
					<div
						key={chatMessage.id}
						className={cn(
							"flex w-full",
							chatMessage.role === "user" ? "justify-end" : "justify-start",
						)}
					>
						<div
							className={cn(
								"max-w-[85%] rounded-2xl px-4 py-3 text-sm",
								chatMessage.role === "user"
									? "bg-secondary text-secondary-foreground"
									: "bg-transparent px-0 py-0 text-foreground",
							)}
						>
							{isStreamingAssistantMessage && !text ? (
								<div className="text-sm text-muted-foreground">
									<ShimmerText>Thinking</ShimmerText>
								</div>
							) : (
								<>
									<Streamdown
										className={cn(
											chatMessage.role === "assistant" && "note-streamdown",
										)}
										controls={false}
										caret="block"
										isAnimating={isStreamingAssistantMessage}
										mode={isStreamingAssistantMessage ? "streaming" : "static"}
									>
										{text}
									</Streamdown>
									{chatMessage.role === "assistant" && text ? (
										<div className="mt-2 flex items-center gap-1">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														className="size-7 text-muted-foreground hover:text-foreground"
														aria-label="Copy response"
														onClick={() => {
															void navigator.clipboard
																.writeText(text)
																.then(() => toast.success("Copied"))
																.catch(() => toast.error("Failed to copy"));
														}}
													>
														<Copy className="size-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Copy response</TooltipContent>
											</Tooltip>

											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														className="size-7 text-muted-foreground hover:text-foreground"
														disabled={disableAddToNote}
														aria-label="Add to note"
														onClick={() => {
															if (!onAddMessageToNote) {
																return;
															}

															void Promise.resolve(
																onAddMessageToNote(text),
															).catch(() => toast.error("Failed to add"));
														}}
													>
														<Plus className="size-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Add to note</TooltipContent>
											</Tooltip>

											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														className={cn(
															"size-7 hover:text-foreground",
															reactionsByMessageId[chatMessage.id] === "like"
																? "text-foreground"
																: "text-muted-foreground",
														)}
														aria-label="Like response"
														onClick={() =>
															onReactionChange(chatMessage.id, "like")
														}
													>
														<ThumbsUp className="size-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Like response</TooltipContent>
											</Tooltip>

											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														type="button"
														variant="ghost"
														size="icon-sm"
														className={cn(
															"size-7 hover:text-foreground",
															reactionsByMessageId[chatMessage.id] === "dislike"
																? "text-foreground"
																: "text-muted-foreground",
														)}
														aria-label="Dislike response"
														onClick={() =>
															onReactionChange(chatMessage.id, "dislike")
														}
													>
														<ThumbsDown className="size-3.5" />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Dislike response</TooltipContent>
											</Tooltip>
										</div>
									) : null}
								</>
							)}
						</div>
					</div>
				);
			})}

			{chatError ? (
				<p className="text-sm text-destructive">{chatError.message}</p>
			) : null}
		</div>
	);
}

function NoteChatHeader({
	chatTitle,
	currentChatId,
	groupedNoteChats,
	noteChats,
	onHideChat,
	onNewChat,
	onSelectChat,
	onSelectInlinePresentation,
	onSelectRightPresentation,
	presentationMode,
	sidebarCompact,
}: {
	chatTitle: string;
	currentChatId: string;
	groupedNoteChats: ReturnType<typeof groupChatsForSelector>;
	noteChats: NoteChatSummary[] | undefined;
	onHideChat: () => void;
	onNewChat: () => void;
	onSelectChat: (chatId: string) => void;
	onSelectInlinePresentation: () => void;
	onSelectRightPresentation: (
		mode: Exclude<NoteChatPresentation, "inline">,
	) => void;
	presentationMode: NoteChatPresentation;
	sidebarCompact: boolean;
}) {
	const selectedChatId =
		(noteChats?.some((chat) => chat.chatId === currentChatId) ?? false)
			? currentChatId
			: undefined;

	const chatModeIcon =
		presentationMode === "inline" ? (
			<PanelTopBottomDashed className="size-4" />
		) : presentationMode === "floating" ? (
			<PanelRightDashed className="size-4" />
		) : (
			<PanelRight className="size-4" />
		);

	return (
		<CardHeader
			className={cn(
				"flex items-center justify-between gap-3",
				sidebarCompact ? "px-2 py-2" : "px-4 py-4",
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2">
				<Select value={selectedChatId} onValueChange={onSelectChat}>
					<SelectTrigger
						size="sm"
						title={chatTitle}
						aria-label="Select note chat"
						className={cn(
							"h-8 min-w-0 max-w-full cursor-pointer justify-start gap-0.5 border-transparent !bg-transparent px-2 pr-1.5 text-left shadow-none hover:!bg-accent/50 focus-visible:ring-0 dark:!bg-transparent dark:hover:!bg-accent/50",
							sidebarCompact
								? "max-w-[min(100%,18rem)]"
								: "max-w-[min(100%,36rem)]",
							sidebarCompact ? "-ml-1" : "-ml-2",
						)}
					>
						<span className="min-w-0 truncate text-sm font-medium text-foreground">
							{chatTitle}
						</span>
					</SelectTrigger>
					<SelectContent align="start" className="w-72 max-w-[90vw] p-1">
						{(noteChats?.length ?? 0) === 0 ? (
							<div className="px-2 py-3 text-sm text-muted-foreground">
								Send a message to start a note chat.
							</div>
						) : (
							<>
								{groupedNoteChats.today.length > 0 ? (
									<SelectGroup>
										<SelectLabel>Today</SelectLabel>
										{groupedNoteChats.today.map((chat) => (
											<SelectItem key={chat._id} value={chat.chatId}>
												<span className="truncate">{chat.title}</span>
											</SelectItem>
										))}
									</SelectGroup>
								) : null}
								{groupedNoteChats.previous.length > 0 ? (
									<SelectGroup>
										<SelectLabel>Previous</SelectLabel>
										{groupedNoteChats.previous.map((chat) => (
											<SelectItem key={chat._id} value={chat.chatId}>
												<span className="truncate">{chat.title}</span>
											</SelectItem>
										))}
									</SelectGroup>
								) : null}
							</>
						)}
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={onNewChat}
							aria-label="New chat"
						>
							<Plus className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent align="end">New chat</TooltipContent>
				</Tooltip>

				<DropdownMenu>
					<Tooltip>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className={sidebarCompact ? "-mr-1" : "-mr-2"}
									aria-label="Switch chat mode"
								>
									{chatModeIcon}
								</Button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent align="end">Switch chat mode</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onSelect={onSelectInlinePresentation}
							className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
						>
							<PanelTopBottomDashed className="size-4 text-muted-foreground" />
							<span>Inline</span>
							{presentationMode === "inline" ? (
								<Check className="size-4 text-muted-foreground" />
							) : null}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => onSelectRightPresentation("floating")}
							className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
						>
							<PanelRightDashed className="size-4 text-muted-foreground" />
							<span>Floating</span>
							{presentationMode === "floating" ? (
								<Check className="size-4 text-muted-foreground" />
							) : null}
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => onSelectRightPresentation("sidebar")}
							className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
						>
							<PanelRight className="size-4 text-muted-foreground" />
							<span>Sidebar</span>
							{presentationMode === "sidebar" ? (
								<Check className="size-4 text-muted-foreground" />
							) : null}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				{presentationMode !== "inline" ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								onClick={onHideChat}
								aria-label="Hide chat"
							>
								<Minus className="size-4" />
							</Button>
						</TooltipTrigger>
						<TooltipContent align="end">Hide chat</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		</CardHeader>
	);
}

function InlinePopoverFooterContainer({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className={INLINE_POPOVER_FOOTER_CONTAINER_CLASS}>{children}</div>
	);
}

function ChatInlinePopoverFooter({
	activateInlineOnFocus = false,
	composerPlaceholder,
	handleComposerFocus,
	handleComposerPointerDown,
	handleKeyDown,
	handleTextareaChange,
	hasMessage,
	isChatLoading,
	message,
	speechControls,
	textareaRef,
}: {
	activateInlineOnFocus?: boolean;
	composerPlaceholder: string;
	handleComposerFocus: () => void;
	handleComposerPointerDown: () => void;
	handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	handleTextareaChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
	hasMessage: boolean;
	isChatLoading: boolean;
	message: string;
	speechControls: React.ReactNode;
	textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
	return (
		<InputGroup className="min-h-[96px] overflow-hidden rounded-xl border-border bg-card bg-clip-padding shadow-sm has-disabled:bg-card has-disabled:opacity-100 dark:bg-input/30 dark:has-disabled:bg-input/30 [--radius:1rem]">
			<InputGroupTextarea
				data-slot="input-group-control"
				ref={textareaRef}
				value={message}
				onChange={handleTextareaChange}
				onPointerDown={
					activateInlineOnFocus ? handleComposerPointerDown : undefined
				}
				onFocus={activateInlineOnFocus ? handleComposerFocus : undefined}
				onKeyDown={handleKeyDown}
				placeholder={composerPlaceholder}
				className="min-h-[40px] max-h-52 overflow-y-auto px-4 pt-2 pb-0 text-base font-normal placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
				rows={1}
			/>
			<InputGroupAddon align="block-end" className="gap-1 px-4 pb-2.5">
				{speechControls}
				<InputGroupButton
					type="submit"
					variant="default"
					size="icon-sm"
					className="ml-auto rounded-full"
					aria-label="Send message"
					disabled={!hasMessage || isChatLoading}
				>
					<ArrowUp className="size-4" />
				</InputGroupButton>
			</InputGroupAddon>
		</InputGroup>
	);
}

function TranscriptInlinePopoverFooter({
	isSpeechListening,
	speechControls,
}: {
	isSpeechListening: boolean;
	speechControls: React.ReactNode;
}) {
	return (
		<InlinePopoverFooterContainer>
			<div className="relative">
				{isSpeechListening ? (
					<div className="pointer-events-none absolute inset-x-4 bottom-full z-10 mb-2 rounded-lg bg-muted/70 px-4 py-1 text-center text-[11px] leading-4 text-muted-foreground/90">
						Always get consent when transcribing others.
					</div>
				) : null}

				<InputGroup className="min-h-[96px] overflow-hidden rounded-xl border-border bg-card bg-clip-padding shadow-sm has-disabled:bg-card has-disabled:opacity-100 dark:bg-input/30 dark:has-disabled:bg-input/30 [--radius:1rem]">
					<div
						aria-hidden="true"
						className="h-[46px] w-full shrink-0 px-4 pt-2 pb-0"
					/>
					<InputGroupAddon align="block-end" className="gap-1 px-4 pb-2.5">
						{speechControls}
						<div aria-hidden="true" className="ml-auto size-8 shrink-0" />
					</InputGroupAddon>
				</InputGroup>
			</div>
		</InlinePopoverFooterContainer>
	);
}

export function NoteComposer(props: NoteComposerProps) {
	const controller = useNoteComposerController(props);
	return (
		<div ref={controller.rootRef} className="relative w-full">
			{controller.canGenerateNotes ? (
				<div className="pointer-events-none absolute inset-x-0 bottom-full z-30 mb-3 flex justify-center">
					<Button
						type="button"
						size="sm"
						className="pointer-events-auto px-4 shadow-lg"
						onClick={controller.handleGenerateNotes}
						disabled={
							controller.isGeneratingNotes || controller.isRefiningTranscript
						}
					>
						{controller.isGeneratingNotes ? (
							<LoaderCircle className="size-4 animate-spin" />
						) : (
							<Sparkles className="size-4" />
						)}
						{controller.isGeneratingNotes
							? "Generating..."
							: controller.isRefiningTranscript
								? "Refining transcript..."
								: "Generate notes"}
					</Button>
				</div>
			) : null}
			<NoteComposerPanels
				controller={controller}
				onAddMessageToNote={props.onAddMessageToNote}
			/>
			<NoteComposerDock controller={controller} />
		</div>
	);
}

type NoteComposerController = ReturnType<typeof useNoteComposerController>;

function NoteComposerSpeechControls({
	controller,
}: {
	controller: NoteComposerController;
}) {
	return (
		<NoteSpeechControls
			autoStartKey={controller.autoStartKey}
			captureScopeKey={controller.captureScopeKey}
			isTranscriptOpen={controller.isTranscriptOpen}
			onToggleTranscript={() => {
				controller.closeRightSidebar();
				controller.setPanelMode((currentValue) =>
					currentValue === "transcript" ? null : "transcript",
				);
			}}
			onLiveTranscriptChange={controller.onLiveTranscriptChange}
			onSystemAudioRecordingReady={controller.onSystemAudioRecordingReady}
			onSystemAudioStatusChange={controller.onSystemAudioStatusChange}
			onRecoveryStatusChange={controller.onRecoveryStatusChange}
			onTranscriptListeningChange={controller.onTranscriptListeningChange}
			onTranscriptUtterance={controller.onTranscriptUtterance}
			transcriptionLanguage={controller.transcriptionLanguage}
		/>
	);
}

function ChatComposerForm({
	activateInlineOnFocus = false,
	controller,
	formClassName,
	speechControls,
}: {
	activateInlineOnFocus?: boolean;
	controller: NoteComposerController;
	formClassName?: string;
	speechControls: React.ReactNode;
}) {
	return (
		<form onSubmit={controller.handleSubmit} className={formClassName}>
			<ChatInlinePopoverFooter
				activateInlineOnFocus={activateInlineOnFocus}
				composerPlaceholder={controller.composerPlaceholder}
				handleComposerFocus={controller.handleComposerFocus}
				handleComposerPointerDown={controller.handleComposerPointerDown}
				handleKeyDown={controller.handleKeyDown}
				handleTextareaChange={controller.handleTextareaChange}
				hasMessage={controller.hasMessage}
				isChatLoading={controller.isChatLoading}
				message={controller.message}
				speechControls={speechControls}
				textareaRef={controller.textareaRef}
			/>
		</form>
	);
}

function TranscriptPanelHeader({
	controller,
}: {
	controller: NoteComposerController;
}) {
	return (
		<CardHeader
			className={cn(
				"flex items-center justify-between",
				controller.isSidebarPresentation ? "px-2 py-2" : "px-4 py-4",
			)}
		>
			<div className="text-sm font-medium text-foreground">Live transcript</div>
			<div className="flex items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className={cn(controller.isSidebarPresentation ? "-mr-1" : "-mr-1.5")}
					onClick={async () => {
						if (!controller.fullTranscript) {
							return;
						}

						try {
							await navigator.clipboard.writeText(controller.fullTranscript);
							toast.success("Transcript copied");
						} catch (error) {
							console.error("Failed to copy transcript", error);
							toast.error("Failed to copy transcript");
						}
					}}
				>
					<Copy className="size-4" />
				</Button>
			</div>
		</CardHeader>
	);
}

function TranscriptPanelNoticeStack({
	controller,
	shouldRenderInlineComposer,
}: {
	controller: NoteComposerController;
	shouldRenderInlineComposer: boolean;
}) {
	if (
		!controller.isRefiningTranscript &&
		!controller.transcriptRefinementError &&
		shouldRenderInlineComposer
	) {
		return null;
	}

	return (
		<div
			className={cn(
				controller.isSidebarPresentation
					? "px-2 pb-2"
					: shouldRenderInlineComposer
						? "pb-4"
						: "px-4 pb-4",
			)}
		>
			{controller.isRefiningTranscript ? (
				<div className="mb-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					Refining remote speakers from the recorded system-audio track.
					Generate notes will unlock when this pass finishes.
				</div>
			) : null}
			{controller.transcriptRefinementError ? (
				<div className="mb-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
					System-audio refinement failed. The live transcript was preserved.{" "}
					{controller.transcriptRefinementError}
				</div>
			) : null}
			{shouldRenderInlineComposer || !controller.isSpeechListening ? null : (
				<div className="rounded-md bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
					Always get consent when transcribing others.
				</div>
			)}
		</div>
	);
}

function NoteComposerChatPanelContent({
	controller,
	chatPanelBody,
	chatPanelHeader,
}: {
	controller: NoteComposerController;
	chatPanelBody: React.ReactNode;
	chatPanelHeader: React.ReactNode;
}) {
	const shouldRenderInlineComposer = controller.shouldShowInlinePanel;
	const chatFooter = (
		<ChatComposerForm
			controller={controller}
			speechControls={
				shouldRenderInlineComposer ? null : (
					<div aria-hidden="true" className="h-7 w-[60px] shrink-0" />
				)
			}
		/>
	);

	return (
		<>
			{chatPanelHeader}

			<CardContent
				className={cn(
					"flex flex-1 overflow-hidden",
					controller.isSidebarPresentation ? "px-2 pb-2" : "px-4 pb-4",
				)}
			>
				{chatPanelBody}
			</CardContent>

			{shouldRenderInlineComposer ? (
				<InlinePopoverFooterContainer>
					{chatFooter}
				</InlinePopoverFooterContainer>
			) : (
				<div
					className={cn(
						controller.isSidebarPresentation ? "px-2 pb-2" : "px-4 pb-4",
					)}
				>
					{chatFooter}
				</div>
			)}
		</>
	);
}

function NoteComposerTranscriptPanelContent({
	controller,
}: {
	controller: NoteComposerController;
}) {
	const shouldRenderInlineComposer = controller.shouldShowInlinePanel;

	return (
		<>
			<TranscriptPanelHeader controller={controller} />

			<CardContent
				className={cn(
					"flex flex-1 overflow-hidden",
					controller.isSidebarPresentation ? "px-2 pb-2" : "px-4 pb-4",
				)}
			>
				<NoteTranscriptPanel controller={controller} />
			</CardContent>

			<TranscriptPanelNoticeStack
				controller={controller}
				shouldRenderInlineComposer={shouldRenderInlineComposer}
			/>

			{shouldRenderInlineComposer ? (
				<TranscriptInlinePopoverFooter
					isSpeechListening={controller.isSpeechListening}
					speechControls={
						<NoteComposerSpeechControls controller={controller} />
					}
				/>
			) : null}
		</>
	);
}

function NoteComposerPanels({
	controller,
	onAddMessageToNote,
}: {
	controller: NoteComposerController;
	onAddMessageToNote?: NoteComposerProps["onAddMessageToNote"];
}) {
	const chatPanelHeader = (
		<NoteChatHeader
			chatTitle={controller.chatTitle}
			currentChatId={controller.currentChatId}
			groupedNoteChats={controller.groupedNoteChats}
			noteChats={controller.noteChats}
			onHideChat={controller.handleHideChat}
			onNewChat={controller.openDraftChat}
			onSelectChat={controller.handleSelectChat}
			onSelectInlinePresentation={controller.handleSelectInlinePresentation}
			onSelectRightPresentation={controller.handleSelectRightPresentation}
			presentationMode={controller.presentationMode}
			sidebarCompact={controller.isSidebarPresentation}
		/>
	);
	const chatPanelBody = (
		<NoteChatMessages
			chatError={controller.chatError}
			chatMessages={controller.chatMessages}
			chatViewportRef={controller.chatViewportRef}
			disableAddToNote={!onAddMessageToNote}
			disablePadding={controller.isSidebarPresentation}
			isChatLoading={controller.isChatLoading}
			onAddMessageToNote={onAddMessageToNote}
			onReactionChange={(messageId, reaction) => {
				controller.setReactionsByMessageId((currentValue) => ({
					...currentValue,
					[messageId]:
						currentValue[messageId] === reaction ? undefined : reaction,
				}));
			}}
			reactionsByMessageId={controller.reactionsByMessageId}
		/>
	);
	const panelContent = (
		<NoteComposerPanelContent
			controller={controller}
			chatPanelBody={chatPanelBody}
			chatPanelHeader={chatPanelHeader}
		/>
	);

	if (!controller.panelMode) {
		return null;
	}

	if (controller.shouldShowInlinePanel) {
		return (
			<div
				ref={controller.inlinePanelRef}
				className="absolute inset-x-0 -bottom-4 z-20"
			>
				<div className="relative flex items-end gap-3">
					<Card
						className="pointer-events-auto relative -mx-6 max-h-[calc(100dvh-6rem)] min-h-[20rem] w-[calc(100%+3rem)] gap-0 overflow-hidden py-0"
						style={{
							height: controller.inlinePanelHeight,
							maxHeight: controller.getInlinePanelMaxHeight(),
							minHeight: INLINE_POPOVER_MIN_HEIGHT,
						}}
					>
						<div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-5 items-start justify-center">
							<div
								className="pointer-events-auto mt-1 h-1.5 w-16 cursor-row-resize rounded-full bg-border/80 transition-colors hover:bg-border"
								onPointerDown={controller.handleInlinePanelResizeStart}
							/>
						</div>
						{panelContent}
					</Card>
				</div>
			</div>
		);
	}

	if (!controller.isChatOpen || controller.presentationMode === "inline") {
		return null;
	}

	return (
		<Sidebar
			side="right"
			variant={
				controller.presentationMode === "floating" ? "floating" : "sidebar"
			}
			collapsible="offcanvas"
			style={
				controller.presentationMode === "floating" && !controller.isMobile
					? ({
							"--sidebar-width": NOTE_CHAT_FLOATING_WIDTH,
						} as React.CSSProperties)
					: undefined
			}
			className={cn(
				"flex flex-col",
				controller.presentationMode === "floating"
					? "md:right-2 md:top-auto md:bottom-2 md:h-[min(32rem,calc(100svh-2rem))]"
					: "border-l",
			)}
		>
			<div className="flex h-full flex-col">{panelContent}</div>
		</Sidebar>
	);
}

function NoteComposerPanelContent({
	controller,
	chatPanelBody,
	chatPanelHeader,
}: {
	controller: NoteComposerController;
	chatPanelBody: React.ReactNode;
	chatPanelHeader: React.ReactNode;
}) {
	return controller.isTranscriptOpen ? (
		<NoteComposerTranscriptPanelContent controller={controller} />
	) : (
		<NoteComposerChatPanelContent
			controller={controller}
			chatPanelBody={chatPanelBody}
			chatPanelHeader={chatPanelHeader}
		/>
	);
}

function NoteTranscriptPanel({
	controller,
}: {
	controller: NoteComposerController;
}) {
	if (!controller.fullTranscript) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<p className="text-center text-sm font-medium tracking-tight">
					{controller.isSpeechListening ? "Listening..." : "Transcript paused"}
				</p>
			</div>
		);
	}

	return (
		<div
			ref={controller.transcriptViewportRef}
			className="w-full overflow-y-auto"
		>
			<div className={cn("flex flex-col gap-4 pr-4")}>
				{controller.orderedTranscriptUtterances.map((utterance) => (
					<div
						key={utterance.id}
						className={cn(
							"flex w-full",
							utterance.speaker === "you" ? "justify-end" : "justify-start",
						)}
					>
						<div
							className={cn(
								"max-w-[85%] text-sm leading-6",
								utterance.speaker === "you"
									? "rounded-2xl bg-secondary px-4 py-3 text-right text-secondary-foreground"
									: "text-foreground",
							)}
						>
							<p className="whitespace-pre-wrap">{utterance.text}</p>
						</div>
					</div>
				))}
				{controller.liveTranscriptEntries.map((entry) => (
					<div
						key={`live:${entry.speaker}`}
						className={cn(
							"flex w-full opacity-75",
							entry.speaker === "you" ? "justify-end" : "justify-start",
						)}
					>
						<div
							className={cn(
								"max-w-[85%] text-sm leading-6",
								entry.speaker === "you"
									? "rounded-2xl bg-secondary px-4 py-3 text-right text-secondary-foreground"
									: "text-foreground",
							)}
						>
							<p className="whitespace-pre-wrap">{entry.text}</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function NoteComposerDock({
	controller,
}: {
	controller: NoteComposerController;
}) {
	if (controller.panelMode && controller.shouldShowInlinePanel) {
		return null;
	}

	return (
		<div className="flex items-center gap-3 pt-2">
			<ChatComposerForm
				activateInlineOnFocus
				controller={controller}
				formClassName="group/composer w-full"
				speechControls={<NoteComposerSpeechControls controller={controller} />}
			/>
		</div>
	);
}
