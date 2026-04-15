import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@workspace/ui/components/popover";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Separator } from "@workspace/ui/components/separator";
import {
	SidebarProvider,
	SidebarTrigger,
	useDockedPanelWidths,
	useSidebarShell,
} from "@workspace/ui/components/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
	ArrowDown,
	Copy,
	MessageSquareText,
	MoreHorizontal,
	Plus,
	Redo2,
	Undo2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import {
	ChatPageSurface,
	NotePageSurface,
	preloadChatPageSurface,
	preloadNotePageSurface,
} from "@/app/app-surfaces";
import type { AppUser, AppView, UpcomingCalendarEvent } from "@/app/app-types";
import { HomeView, SharedView } from "@/app/home-shared-views";
import {
	buildCalendarEventNoteDocument,
	buildCalendarEventSearchableText,
	createCalendarEventKey,
	createNoteSearch,
	getAppLocationState,
	getDayWindowFromDayKey,
	getInitialNonSettingsLocation,
	getSettingsPageFromPath,
	getSettingsPath,
	shouldAutoStartNoteCaptureFromUrl,
	toStoredChatMessages,
} from "@/app/location";
import { readDesktopInboxPanelPinnedState } from "@/components/inbox/inbox-panel-state";
import { AppShellInset } from "@/components/layout/app-shell-inset";
import {
	NoteActionsMenu,
	NoteStarButton,
} from "@/components/note/note-actions-menu";
import type { NoteEditorActions } from "@/components/note/note-page";
import { OPEN_NOTE_COMMENTS_EVENT } from "@/components/note/note-page-events";
import { NoteTitleEditInput } from "@/components/note/note-title-edit-input";
import { optimisticRenameNote } from "@/components/note/optimistic-rename-note";
import type { SettingsPage } from "@/components/settings/settings-dialog";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { NoteTemplateSelect } from "@/components/templates/note-template-select";
import {
	ActiveWorkspaceProvider,
	useActiveWorkspaceId,
} from "@/hooks/use-active-workspace";
import { type AuthSession, authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
import {
	DESKTOP_INBOX_PANEL_WIDTH,
	DESKTOP_MAIN_HEADER_CLASS,
	DESKTOP_MAIN_HEADER_CONTENT_CLASS,
	DESKTOP_MAIN_HEADER_LEADING_CLASS,
} from "@/lib/desktop-chrome";
import { getSidebarViewTitle } from "@/lib/navigation";
import { getNoteDisplayTitle } from "@/lib/note-title";
import type { WorkspaceRecord } from "@/lib/workspaces";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

const currentMonthFormatter = new Intl.DateTimeFormat(undefined, {
	month: "long",
});

const currentWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
});

const getDelayUntilNextMinute = (now: Date) => {
	const nextMinute = new Date(now);
	nextMinute.setSeconds(60, 0);

	return nextMinute.getTime() - now.getTime();
};

const useCurrentDate = () => {
	const [currentDate, setCurrentDate] = React.useState(() => new Date());

	React.useEffect(() => {
		let timeoutId: number | undefined;
		let intervalId: number | undefined;

		const updateCurrentDate = () => {
			const now = new Date();
			setCurrentDate(now);
		};

		updateCurrentDate();
		timeoutId = window.setTimeout(() => {
			updateCurrentDate();
			intervalId = window.setInterval(updateCurrentDate, 60 * 1000);
		}, getDelayUntilNextMinute(new Date()));

		return () => {
			if (timeoutId !== undefined) {
				window.clearTimeout(timeoutId);
			}

			if (intervalId !== undefined) {
				window.clearInterval(intervalId);
			}
		};
	}, []);

	return currentDate;
};

const toAppUser = (session: AuthSession): AppUser => ({
	name: session.user.name?.trim() || session.user.email,
	email: session.user.email,
	avatar: session.user.image ?? "",
});

const useAppShellState = ({
	session,
	workspaces,
	initialDesktopMac,
}: {
	session: AuthSession;
	workspaces: Array<WorkspaceRecord>;
	initialDesktopMac: boolean;
}) => {
	const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
	const [currentView, setCurrentView] = React.useState<AppView>(() => {
		if (typeof window === "undefined") {
			return "home";
		}

		const initialView = getAppLocationState(new URL(window.location.href)).view;
		return initialView === "inbox" ? "home" : initialView;
	});
	const [inboxOpen, setInboxOpen] = React.useState(() => {
		if (typeof window === "undefined") {
			return false;
		}

		return getAppLocationState(new URL(window.location.href)).view === "inbox";
	});
	const [isDesktopMac, setIsDesktopMac] = React.useState(initialDesktopMac);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [settingsPage, setSettingsPage] =
		React.useState<SettingsPage>("Profile");
	const [isSigningOut, startSignOut] = React.useTransition();
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState<Id<"workspaces"> | null>(() => workspaces[0]?._id ?? null);
	const resolvedActiveWorkspaceId = React.useMemo(() => {
		if (
			activeWorkspaceId &&
			workspaces.some((workspace) => workspace._id === activeWorkspaceId)
		) {
			return activeWorkspaceId;
		}

		return workspaces[0]?._id ?? null;
	}, [activeWorkspaceId, workspaces]);
	const [currentChatId, setCurrentChatId] = React.useState<string | null>(
		() => {
			if (typeof window === "undefined") {
				return null;
			}

			return getAppLocationState(new URL(window.location.href)).chatId;
		},
	);
	const [chatComposerId, setChatComposerId] = React.useState(() => {
		if (typeof window === "undefined") {
			return crypto.randomUUID();
		}

		return (
			getAppLocationState(new URL(window.location.href)).chatId ??
			crypto.randomUUID()
		);
	});
	const [currentNoteId, setCurrentNoteId] = React.useState<Id<"notes"> | null>(
		null,
	);
	const [currentRouteNoteId, setCurrentRouteNoteId] = React.useState<
		string | null
	>(() => {
		if (typeof window === "undefined") {
			return null;
		}

		return getAppLocationState(new URL(window.location.href)).noteIdString;
	});
	const [shouldAutoStartNoteCapture, setShouldAutoStartNoteCapture] =
		React.useState(() => {
			if (typeof window === "undefined") {
				return false;
			}

			return shouldAutoStartNoteCaptureFromUrl(new URL(window.location.href));
		});
	const [
		shouldStopNoteCaptureWhenMeetingEnds,
		setShouldStopNoteCaptureWhenMeetingEnds,
	] = React.useState(() => {
		if (typeof window === "undefined") {
			return false;
		}

		return getAppLocationState(new URL(window.location.href))
			.shouldStopNoteCaptureWhenMeetingEnds;
	});
	const [scheduledAutoStartNoteCaptureAt, setScheduledAutoStartNoteCaptureAt] =
		React.useState<string | null>(() => {
			if (typeof window === "undefined") {
				return null;
			}

			return getAppLocationState(new URL(window.location.href))
				.scheduledAutoStartNoteCaptureAt;
		});
	const [pendingCalendarEvent, setPendingCalendarEvent] =
		React.useState<UpcomingCalendarEvent | null>(() => {
			if (typeof window === "undefined") {
				return null;
			}

			return getAppLocationState(new URL(window.location.href))
				.pendingCalendarEvent;
		});
	const [currentNoteTitle, setCurrentNoteTitle] = React.useState("");
	const [currentNoteEditorActions, setCurrentNoteEditorActions] =
		React.useState<NoteEditorActions | null>(null);
	const [currentNoteCommentsOpener, setCurrentNoteCommentsOpener] =
		React.useState<(() => void) | null>(null);
	const creatingNoteRef = React.useRef(false);
	const inboxOpenRef = React.useRef(inboxOpen);
	const lastNonSettingsLocationRef = React.useRef(
		getInitialNonSettingsLocation(),
	);
	const user = React.useMemo(() => toAppUser(session), [session]);
	const currentDate = useCurrentDate();
	const currentDayOfMonth = currentDate.getDate();
	const currentMonthLabel = currentMonthFormatter.format(currentDate);
	const currentWeekdayLabel = currentWeekdayFormatter.format(currentDate);
	const currentDayKey = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`;
	const [upcomingCalendarEvents, setUpcomingCalendarEvents] = React.useState<
		UpcomingCalendarEvent[]
	>([]);
	const [upcomingCalendarStatus, setUpcomingCalendarStatus] = React.useState<
		"idle" | "ready" | "not_connected" | "error"
	>("idle");
	const [isLoadingUpcomingCalendarEvents, setIsLoadingUpcomingCalendarEvents] =
		React.useState(false);
	const upcomingCalendarRequestIdRef = React.useRef(0);
	const upcomingCalendarLoadKey = session?.user?.email
		? `${isConvexAuthenticated ? "authenticated" : "unauthenticated"}:${session.user.email}`
		: "anonymous";
	const applyLocationSyncState = React.useCallback(
		(input: {
			chatId: string | null;
			inboxOpen: boolean;
			noteIdString: string | null;
			pendingCalendarEvent: UpcomingCalendarEvent | null;
			scheduledAutoStartNoteCaptureAt: string | null;
			settingsOpen: boolean;
			settingsPage: SettingsPage;
			shouldAutoStartNoteCapture: boolean;
			shouldStopNoteCaptureWhenMeetingEnds: boolean;
			view: AppView;
		}) => {
			setInboxOpen(input.inboxOpen);
			setCurrentView(input.view);
			setCurrentChatId(input.chatId);
			setChatComposerId(
				input.view === "chat"
					? (input.chatId ?? crypto.randomUUID())
					: crypto.randomUUID(),
			);
			setCurrentNoteId(null);
			setCurrentRouteNoteId(input.view === "note" ? input.noteIdString : null);
			setShouldAutoStartNoteCapture(input.shouldAutoStartNoteCapture);
			setShouldStopNoteCaptureWhenMeetingEnds(
				input.shouldStopNoteCaptureWhenMeetingEnds,
			);
			setScheduledAutoStartNoteCaptureAt(input.scheduledAutoStartNoteCaptureAt);
			setPendingCalendarEvent(input.pendingCalendarEvent);
			setCurrentNoteEditorActions(null);
			setCurrentNoteCommentsOpener(null);
			setSettingsPage(input.settingsPage);
			setSettingsOpen(input.settingsOpen);
		},
		[],
	);

	const clearScheduledAutoStart = React.useCallback(() => {
		setScheduledAutoStartNoteCaptureAt(null);
	}, []);

	const triggerScheduledAutoStart = React.useCallback(() => {
		setShouldAutoStartNoteCapture(true);
		setScheduledAutoStartNoteCaptureAt(null);
	}, []);
	const calendarPreferences = useQuery(
		api.calendarPreferences.get,
		isConvexAuthenticated && resolvedActiveWorkspaceId
			? { workspaceId: resolvedActiveWorkspaceId }
			: "skip",
	);
	const notificationPreferences = useQuery(
		api.notificationPreferences.get,
		isConvexAuthenticated && resolvedActiveWorkspaceId
			? { workspaceId: resolvedActiveWorkspaceId }
			: "skip",
	);
	const yandexCalendarConnection = useQuery(
		api.appConnections.getYandexCalendar,
		isConvexAuthenticated && resolvedActiveWorkspaceId
			? { workspaceId: resolvedActiveWorkspaceId }
			: "skip",
	);
	const calendarVisibilityKey = !resolvedActiveWorkspaceId
		? "no-workspace"
		: calendarPreferences
			? `${calendarPreferences.showGoogleCalendar}:${calendarPreferences.showYandexCalendar}`
			: "loading";
	const yandexCalendarConnectionKey = yandexCalendarConnection
		? [
				yandexCalendarConnection.sourceId,
				yandexCalendarConnection.status,
				yandexCalendarConnection.email,
				yandexCalendarConnection.serverAddress,
				yandexCalendarConnection.calendarHomePath,
			].join(":")
		: resolvedActiveWorkspaceId
			? "none"
			: "no-workspace";
	const createNote = useMutation(api.notes.create);
	const createNoteFromCalendarEvent = useMutation(
		api.notes.createFromCalendarEvent,
	);
	const saveNote = useMutation(api.notes.save);
	const createWorkspace = useMutation(api.workspaces.create);
	const listUpcomingGoogleEvents = useAction(
		api.calendar.listUpcomingGoogleEvents,
	);
	const chats = useQuery(
		api.chats.list,
		resolvedActiveWorkspaceId
			? { workspaceId: resolvedActiveWorkspaceId }
			: "skip",
	);
	const notes = useQuery(
		api.notes.list,
		resolvedActiveWorkspaceId
			? { workspaceId: resolvedActiveWorkspaceId }
			: "skip",
	);
	const sharedNotes = useQuery(
		api.notes.listShared,
		resolvedActiveWorkspaceId
			? { workspaceId: resolvedActiveWorkspaceId }
			: "skip",
	);
	const selectedChatMessages = useQuery(
		api.chats.getMessages,
		currentView === "chat" && currentChatId && resolvedActiveWorkspaceId
			? {
					workspaceId: resolvedActiveWorkspaceId,
					chatId: currentChatId,
				}
			: "skip",
	);
	const normalizedRouteNoteId = useQuery(
		api.notes.normalizeId,
		currentView === "note" && currentRouteNoteId && currentNoteId === null
			? {
					id: currentRouteNoteId,
				}
			: "skip",
	);
	const resolvedCurrentNoteId = currentNoteId ?? normalizedRouteNoteId ?? null;
	const isResolvingCurrentNoteRouteId =
		currentView === "note" &&
		currentRouteNoteId !== null &&
		currentNoteId === null &&
		normalizedRouteNoteId === undefined;
	const hasInvalidCurrentNoteRoute =
		currentView === "note" &&
		currentRouteNoteId !== null &&
		currentNoteId === null &&
		normalizedRouteNoteId === null;
	const listedSelectedNote =
		currentView === "note" && resolvedCurrentNoteId
			? (notes?.find((note) => note._id === resolvedCurrentNoteId) ??
				(notes === undefined ? undefined : null))
			: undefined;
	const selectedNote = useQuery(
		api.notes.get,
		currentView === "note" &&
			!hasInvalidCurrentNoteRoute &&
			resolvedCurrentNoteId &&
			resolvedActiveWorkspaceId
			? {
					workspaceId: resolvedActiveWorkspaceId,
					id: resolvedCurrentNoteId,
				}
			: "skip",
	);
	const resolvedSelectedNote = selectedNote ?? listedSelectedNote;
	const isResolvingCurrentNote =
		isResolvingCurrentNoteRouteId ||
		(currentView === "note" &&
			resolvedCurrentNoteId !== null &&
			resolvedSelectedNote === undefined);
	const hasMissingCurrentNote =
		currentView === "note" &&
		resolvedCurrentNoteId !== null &&
		resolvedSelectedNote === null;
	const resolvedCurrentView =
		hasInvalidCurrentNoteRoute || hasMissingCurrentNote
			? "notFound"
			: currentView;

	const refreshUpcomingCalendarEvents = React.useEffectEvent(
		async (
			dayKey: string,
			options?: {
				resetState?: boolean;
			},
		) => {
			const shouldResetState = options?.resetState ?? true;
			const requestId = upcomingCalendarRequestIdRef.current + 1;
			upcomingCalendarRequestIdRef.current = requestId;

			if (
				!resolvedActiveWorkspaceId ||
				!session?.user?.email ||
				!isConvexAuthenticated
			) {
				if (upcomingCalendarRequestIdRef.current !== requestId) {
					return;
				}

				setUpcomingCalendarEvents([]);
				setUpcomingCalendarStatus("not_connected");
				setIsLoadingUpcomingCalendarEvents(false);
				return;
			}

			if (shouldResetState) {
				setUpcomingCalendarEvents([]);
				setUpcomingCalendarStatus("idle");
			}
			setIsLoadingUpcomingCalendarEvents(true);

			try {
				const result = await listUpcomingGoogleEvents({
					workspaceId: resolvedActiveWorkspaceId,
					...getDayWindowFromDayKey(dayKey),
				});

				if (upcomingCalendarRequestIdRef.current !== requestId) {
					return;
				}

				if (result.status === "not_connected") {
					setUpcomingCalendarEvents([]);
					setUpcomingCalendarStatus("not_connected");
					return;
				}

				setUpcomingCalendarEvents(result.events);
				setUpcomingCalendarStatus("ready");
			} catch (error) {
				if (upcomingCalendarRequestIdRef.current !== requestId) {
					return;
				}

				console.error("Failed to load upcoming calendar events", error);
				setUpcomingCalendarEvents([]);
				setUpcomingCalendarStatus("error");
			} finally {
				if (upcomingCalendarRequestIdRef.current === requestId) {
					setIsLoadingUpcomingCalendarEvents(false);
				}
			}
		},
	);

	React.useEffect(() => {
		void calendarVisibilityKey;
		void yandexCalendarConnectionKey;

		if (upcomingCalendarLoadKey === "anonymous") {
			void refreshUpcomingCalendarEvents(currentDayKey);
			return;
		}

		void refreshUpcomingCalendarEvents(currentDayKey);
	}, [
		calendarVisibilityKey,
		currentDayKey,
		upcomingCalendarLoadKey,
		yandexCalendarConnectionKey,
	]);

	React.useEffect(() => {
		if (!window.openGranDesktop) {
			return;
		}

		void window.openGranDesktop.setActiveWorkspaceId(resolvedActiveWorkspaceId);
	}, [resolvedActiveWorkspaceId]);

	React.useEffect(() => {
		if (!window.openGranDesktop) {
			return;
		}

		void window.openGranDesktop.setActiveWorkspaceNotificationPreferences({
			workspaceId: resolvedActiveWorkspaceId,
			notifyForScheduledMeetings:
				notificationPreferences?.notifyForScheduledMeetings ?? false,
			notifyForAutoDetectedMeetings:
				notificationPreferences?.notifyForAutoDetectedMeetings ?? true,
		});
	}, [
		notificationPreferences?.notifyForAutoDetectedMeetings,
		notificationPreferences?.notifyForScheduledMeetings,
		resolvedActiveWorkspaceId,
	]);

	React.useEffect(() => {
		void calendarVisibilityKey;
		void yandexCalendarConnectionKey;

		if (upcomingCalendarLoadKey === "anonymous") {
			return;
		}

		const handleFocus = () => {
			void refreshUpcomingCalendarEvents(currentDayKey, {
				resetState: false,
			});
		};

		window.addEventListener("focus", handleFocus);
		return () => window.removeEventListener("focus", handleFocus);
	}, [
		calendarVisibilityKey,
		currentDayKey,
		upcomingCalendarLoadKey,
		yandexCalendarConnectionKey,
	]);

	React.useEffect(() => {
		if (workspaces.some((workspace) => workspace._id === activeWorkspaceId)) {
			return;
		}

		setActiveWorkspaceId(workspaces[0]?._id ?? null);
	}, [activeWorkspaceId, workspaces]);

	const handleWorkspaceCreate = React.useCallback(
		async (input: { name: string }) => {
			const workspace = await createWorkspace(input);
			setActiveWorkspaceId(workspace._id);
			return workspace;
		},
		[createWorkspace],
	);

	React.useEffect(() => {
		const syncViewFromLocation = () => {
			const url = new URL(window.location.href);
			const nextSettingsPage =
				getSettingsPageFromPath(url.pathname) ??
				(url.hash === "#settings" ? "Profile" : null);
			const nextSettingsOpen = nextSettingsPage !== null;

			if (!nextSettingsOpen) {
				lastNonSettingsLocationRef.current = `${url.pathname}${url.search}${url.hash}`;
			}

			const contentUrl = nextSettingsOpen
				? new URL(lastNonSettingsLocationRef.current, url.origin)
				: url;
			const nextLocationState = getAppLocationState(contentUrl);
			const nextChatId = nextLocationState.chatId;
			const nextInboxOpen =
				nextLocationState.view === "inbox" ||
				(inboxOpenRef.current && readDesktopInboxPanelPinnedState());
			const nextView = nextInboxOpen ? "home" : nextLocationState.view;
			const nextNoteIdString = nextLocationState.noteIdString;
			const nextShouldAutoStartNoteCapture =
				nextLocationState.shouldAutoStartNoteCapture;
			const nextShouldStopNoteCaptureWhenMeetingEnds =
				nextLocationState.shouldStopNoteCaptureWhenMeetingEnds;
			const nextScheduledAutoStartNoteCaptureAt =
				nextLocationState.scheduledAutoStartNoteCaptureAt;

			applyLocationSyncState({
				chatId: nextChatId,
				inboxOpen: nextInboxOpen,
				noteIdString: nextNoteIdString,
				pendingCalendarEvent: nextLocationState.pendingCalendarEvent,
				scheduledAutoStartNoteCaptureAt: nextScheduledAutoStartNoteCaptureAt,
				settingsOpen: nextSettingsOpen,
				settingsPage: nextSettingsPage ?? "Profile",
				shouldAutoStartNoteCapture: nextShouldAutoStartNoteCapture,
				shouldStopNoteCaptureWhenMeetingEnds:
					nextShouldStopNoteCaptureWhenMeetingEnds,
				view: nextView,
			});

			const nextPath = nextSettingsOpen
				? getSettingsPath(nextSettingsPage ?? "Profile")
				: nextInboxOpen
					? "/home"
					: nextLocationState.canonicalPath;
			const nextSearch = nextSettingsOpen
				? ""
				: nextInboxOpen
					? ""
					: nextLocationState.canonicalSearch;
			const nextHash = "";
			if (
				nextPath &&
				(window.location.pathname !== nextPath ||
					window.location.search !== nextSearch ||
					window.location.hash !== nextHash)
			) {
				window.history.replaceState(
					null,
					"",
					`${nextPath}${nextSearch}${nextHash}`,
				);
			}
		};

		syncViewFromLocation();
		window.addEventListener("popstate", syncViewFromLocation);

		return () => {
			window.removeEventListener("popstate", syncViewFromLocation);
		};
	}, [applyLocationSyncState]);

	React.useEffect(() => {
		if (typeof window === "undefined" || !window.openGranDesktop?.onNavigate) {
			return;
		}

		return window.openGranDesktop.onNavigate((navigation) => {
			const nextLocation = `${navigation.pathname}${navigation.search}${navigation.hash}`;

			if (
				window.location.pathname === navigation.pathname &&
				window.location.search === navigation.search &&
				window.location.hash === navigation.hash
			) {
				return;
			}

			window.history.pushState(null, "", nextLocation);
			window.dispatchEvent(new PopStateEvent("popstate"));
		});
	}, []);

	React.useEffect(() => {
		if (resolvedSelectedNote) {
			setCurrentNoteTitle(resolvedSelectedNote.title);
			return;
		}

		if (resolvedCurrentView === "note") {
			setCurrentNoteTitle("");
		}
	}, [resolvedCurrentView, resolvedSelectedNote]);

	React.useEffect(() => {
		void window.openGranDesktop
			?.getMeta()
			.then((meta) => {
				setIsDesktopMac(meta.platform === "darwin");
			})
			.catch(() => {
				setIsDesktopMac(false);
			});
	}, []);

	const shouldKeepPinnedInboxOpen = React.useCallback(
		() => inboxOpen && readDesktopInboxPanelPinnedState(),
		[inboxOpen],
	);

	React.useEffect(() => {
		inboxOpenRef.current = inboxOpen;
	}, [inboxOpen]);

	const openFreshChat = React.useCallback(() => {
		void preloadChatPageSurface();
		setInboxOpen(shouldKeepPinnedInboxOpen());
		setCurrentView("chat");
		setSettingsOpen(false);
		setCurrentChatId(null);
		setChatComposerId(crypto.randomUUID());
		window.history.pushState(null, "", "/chat");
	}, [shouldKeepPinnedInboxOpen]);

	const handleViewChange = React.useCallback(
		(view: AppView) => {
			if (view === "inbox") {
				setInboxOpen(true);
				setSettingsOpen(false);
				return;
			}

			if (view === "chat") {
				openFreshChat();
				return;
			}

			if (view === "note") {
				void preloadNotePageSurface();
			}

			setInboxOpen(shouldKeepPinnedInboxOpen());
			setCurrentView(view);
			setSettingsOpen(false);
			setCurrentNoteEditorActions(null);
			setCurrentNoteCommentsOpener(null);
			const search =
				view === "note" && resolvedCurrentNoteId
					? `?noteId=${resolvedCurrentNoteId}`
					: "";
			window.history.pushState(
				null,
				"",
				view === "note"
					? `/note${search}`
					: view === "shared"
						? "/shared"
						: "/home",
			);
		},
		[openFreshChat, resolvedCurrentNoteId, shouldKeepPinnedInboxOpen],
	);

	const handleInboxOpenChange = React.useCallback((open: boolean) => {
		setInboxOpen(open);
		if (open) {
			setSettingsOpen(false);
		}
	}, []);

	const openNote = React.useCallback(
		(
			noteId: Id<"notes">,
			options?: {
				autoStartCapture?: boolean;
				scheduledAutoStartAt?: string | null;
				stopCaptureWhenMeetingEnds?: boolean;
			},
		) => {
			void preloadNotePageSurface();
			setInboxOpen(shouldKeepPinnedInboxOpen());
			setCurrentView("note");
			setSettingsOpen(false);
			setCurrentNoteId(noteId);
			setCurrentRouteNoteId(noteId);
			setShouldAutoStartNoteCapture(options?.autoStartCapture === true);
			setShouldStopNoteCaptureWhenMeetingEnds(
				options?.stopCaptureWhenMeetingEnds === true,
			);
			setScheduledAutoStartNoteCaptureAt(
				options?.scheduledAutoStartAt?.trim() || null,
			);
			setPendingCalendarEvent(null);
			setCurrentNoteEditorActions(null);
			setCurrentNoteCommentsOpener(null);
			window.history.pushState(
				null,
				"",
				`/note${createNoteSearch({
					autoStartCapture: options?.autoStartCapture === true,
					noteId,
					scheduledAutoStartAt: options?.scheduledAutoStartAt,
					stopCaptureWhenMeetingEnds:
						options?.stopCaptureWhenMeetingEnds === true,
				})}`,
			);
		},
		[shouldKeepPinnedInboxOpen],
	);

	const handleCreateNote = React.useCallback(
		(options?: {
			autoStartCapture?: boolean;
			calendarEvent?: UpcomingCalendarEvent | null;
			stopCaptureWhenMeetingEnds?: boolean;
		}) => {
			if (creatingNoteRef.current) {
				return;
			}

			creatingNoteRef.current = true;
			const shouldStartCapture = options?.autoStartCapture === true;
			const shouldStopCaptureWhenMeetingEnds =
				options?.stopCaptureWhenMeetingEnds === true;
			const calendarEvent = options?.calendarEvent ?? null;
			const scheduledAutoStartAt =
				!shouldStartCapture && calendarEvent ? calendarEvent.startAt : null;

			if (!resolvedActiveWorkspaceId) {
				creatingNoteRef.current = false;
				return;
			}

			const createNotePromise = calendarEvent
				? createNoteFromCalendarEvent({
						workspaceId: resolvedActiveWorkspaceId,
						calendarEventKey: createCalendarEventKey(calendarEvent),
						title: calendarEvent.title.trim(),
						content: buildCalendarEventNoteDocument({
							currentDate,
							event: calendarEvent,
						}),
						searchableText: buildCalendarEventSearchableText({
							currentDate,
							event: calendarEvent,
						}),
					})
				: createNote({ workspaceId: resolvedActiveWorkspaceId });

			void createNotePromise
				.then((noteId) => {
					setCurrentNoteTitle(calendarEvent?.title.trim() || "");
					openNote(noteId, {
						autoStartCapture: shouldStartCapture,
						scheduledAutoStartAt,
						stopCaptureWhenMeetingEnds: shouldStopCaptureWhenMeetingEnds,
					});
				})
				.catch((error) => {
					console.error("Failed to create note", error);
				})
				.finally(() => {
					creatingNoteRef.current = false;
				});
		},
		[
			createNote,
			createNoteFromCalendarEvent,
			currentDate,
			openNote,
			resolvedActiveWorkspaceId,
		],
	);

	const handleQuickNote = React.useCallback(() => {
		void preloadNotePageSurface();
		setCurrentView("note");
		setSettingsOpen(false);
		setCurrentNoteId(null);
		setCurrentRouteNoteId(null);
		setShouldAutoStartNoteCapture(true);
		setShouldStopNoteCaptureWhenMeetingEnds(false);
		setScheduledAutoStartNoteCaptureAt(null);
		setPendingCalendarEvent(null);
		setCurrentNoteEditorActions(null);
		setCurrentNoteCommentsOpener(null);
		window.history.pushState(null, "", "/note?capture=1");
	}, []);

	const handleCreateNoteFromChatResponse = React.useCallback(
		async (title: string, content: string) => {
			if (!resolvedActiveWorkspaceId || creatingNoteRef.current) {
				return undefined;
			}

			creatingNoteRef.current = true;
			const nextTitle = title.trim() || "New note";
			const nextContent = content.trim();

			try {
				const noteId = await saveNote({
					workspaceId: resolvedActiveWorkspaceId,
					title: nextTitle,
					content: nextContent,
					searchableText: nextContent,
				});
				setCurrentNoteTitle(nextTitle);
				openNote(noteId);
				return "created" as const;
			} catch (error) {
				console.error("Failed to create note from chat response", error);
				return undefined;
			} finally {
				creatingNoteRef.current = false;
			}
		},
		[openNote, resolvedActiveWorkspaceId, saveNote],
	);

	const handleAutoStartNoteCaptureHandled = React.useCallback(() => {
		setShouldAutoStartNoteCapture(false);
		setShouldStopNoteCaptureWhenMeetingEnds(false);
		setScheduledAutoStartNoteCaptureAt(null);

		if (resolvedCurrentView !== "note" || !resolvedCurrentNoteId) {
			return;
		}

		window.history.replaceState(
			null,
			"",
			`/note?noteId=${resolvedCurrentNoteId}`,
		);
	}, [resolvedCurrentNoteId, resolvedCurrentView]);

	React.useEffect(() => {
		if (
			resolvedCurrentView === "note" &&
			!resolvedCurrentNoteId &&
			currentRouteNoteId === null
		) {
			handleCreateNote({
				autoStartCapture: shouldAutoStartNoteCapture,
				calendarEvent: pendingCalendarEvent,
				stopCaptureWhenMeetingEnds: shouldStopNoteCaptureWhenMeetingEnds,
			});
		}
	}, [
		currentRouteNoteId,
		handleCreateNote,
		pendingCalendarEvent,
		resolvedCurrentNoteId,
		resolvedCurrentView,
		shouldAutoStartNoteCapture,
		shouldStopNoteCaptureWhenMeetingEnds,
	]);

	React.useEffect(() => {
		if (
			resolvedCurrentView !== "note" ||
			!resolvedCurrentNoteId ||
			shouldAutoStartNoteCapture ||
			!scheduledAutoStartNoteCaptureAt
		) {
			return;
		}

		const scheduledAt = new Date(scheduledAutoStartNoteCaptureAt).getTime();

		if (Number.isNaN(scheduledAt)) {
			clearScheduledAutoStart();
			return;
		}

		if (scheduledAt <= Date.now()) {
			triggerScheduledAutoStart();
			return;
		}

		const timeoutId = window.setTimeout(() => {
			triggerScheduledAutoStart();
		}, scheduledAt - Date.now());

		return () => window.clearTimeout(timeoutId);
	}, [
		clearScheduledAutoStart,
		resolvedCurrentNoteId,
		resolvedCurrentView,
		scheduledAutoStartNoteCaptureAt,
		shouldAutoStartNoteCapture,
		triggerScheduledAutoStart,
	]);

	const handleOpenCalendarEventNote = React.useCallback(
		(
			event: UpcomingCalendarEvent,
			options?: {
				autoStartCapture?: boolean;
				stopCaptureWhenMeetingEnds?: boolean;
			},
		) => {
			handleCreateNote({
				autoStartCapture: options?.autoStartCapture,
				calendarEvent: event,
				stopCaptureWhenMeetingEnds: options?.stopCaptureWhenMeetingEnds ?? true,
			});
		},
		[handleCreateNote],
	);

	const handleSettingsOpenChange = React.useCallback(
		(open: boolean, page: SettingsPage = "Profile") => {
			setSettingsOpen(open);
			if (!open) {
				setSettingsPage("Profile");
				const nextLocation = lastNonSettingsLocationRef.current || "/home";
				window.history.pushState(null, "", nextLocation);
				return;
			}

			setInboxOpen(false);
			const currentUrl = new URL(window.location.href);
			if (getSettingsPageFromPath(currentUrl.pathname) === null) {
				lastNonSettingsLocationRef.current = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
			}

			setSettingsPage(page);
			window.history.pushState(null, "", getSettingsPath(page));
		},
		[],
	);

	React.useEffect(() => {
		if (typeof window === "undefined" || !window.openGranDesktop) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				!(event.metaKey || event.ctrlKey) ||
				event.altKey ||
				event.shiftKey ||
				(event.key !== "," && event.code !== "Comma")
			) {
				return;
			}

			event.preventDefault();
			handleSettingsOpenChange(true, "Profile");
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleSettingsOpenChange]);

	React.useEffect(() => {
		if (typeof window === "undefined" || !window.openGranDesktop) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				!(event.metaKey || event.ctrlKey) ||
				event.altKey ||
				event.shiftKey ||
				!/^[1-9]$/.test(event.key)
			) {
				return;
			}

			const workspace = workspaces[Number(event.key) - 1];
			if (!workspace || workspace._id === resolvedActiveWorkspaceId) {
				return;
			}

			event.preventDefault();
			setActiveWorkspaceId(workspace._id);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [resolvedActiveWorkspaceId, workspaces]);

	const handleOpenCalendarSettings = React.useCallback(() => {
		handleSettingsOpenChange(true, "Calendar");
	}, [handleSettingsOpenChange]);

	const handleSignOut = React.useCallback(() => {
		startSignOut(async () => {
			try {
				await authClient.signOut();
			} catch (error) {
				console.error("Failed to sign out", error);
			}
		});
	}, []);

	const handleNoteTrashed = React.useCallback(
		(noteId: Id<"notes">) => {
			if (noteId !== resolvedCurrentNoteId) {
				return;
			}

			setCurrentNoteId(null);
			setCurrentRouteNoteId(null);
			setCurrentNoteTitle("");
			setCurrentNoteEditorActions(null);
			setCurrentNoteCommentsOpener(null);
			handleViewChange("home");
		},
		[handleViewChange, resolvedCurrentNoteId],
	);
	const handleOpenChat = React.useCallback(
		(chatId: string) => {
			void preloadChatPageSurface();
			setInboxOpen(shouldKeepPinnedInboxOpen());
			setCurrentView("chat");
			setSettingsOpen(false);
			setCurrentChatId(chatId);
			setChatComposerId(chatId);
			window.history.pushState(
				null,
				"",
				`/chat?chatId=${encodeURIComponent(chatId)}`,
			);
		},
		[shouldKeepPinnedInboxOpen],
	);

	const handleNewChat = React.useCallback(() => {
		openFreshChat();
	}, [openFreshChat]);

	const handleChatPersisted = React.useCallback(
		(chatId: string) => {
			if (currentChatId === chatId) {
				return;
			}

			setCurrentChatId(chatId);
			window.history.replaceState(
				null,
				"",
				`/chat?chatId=${encodeURIComponent(chatId)}`,
			);
		},
		[currentChatId],
	);
	const handleChatRemoved = React.useCallback(
		(chatId: string) => {
			if (currentChatId !== chatId) {
				return;
			}

			const nextChatId = crypto.randomUUID();
			setCurrentChatId(null);
			setChatComposerId(nextChatId);
			window.history.replaceState(null, "", "/chat");
		},
		[currentChatId],
	);
	const currentChatTitle =
		chats?.find((chat) => getChatId(chat) === currentChatId)?.title || "Chat";
	const isSharedNote =
		resolvedCurrentView === "note" &&
		(resolvedSelectedNote?.visibility === "public" ||
			sharedNotes?.some((note) => note._id === resolvedCurrentNoteId) === true);
	const initialChatMessages = React.useMemo(
		() => toStoredChatMessages(selectedChatMessages ?? []),
		[selectedChatMessages],
	);

	return {
		activeWorkspaceId: resolvedActiveWorkspaceId,
		breadcrumbDetailLabel:
			resolvedCurrentView === "notFound"
				? null
				: resolvedCurrentView === "note" && !isResolvingCurrentNote
					? getNoteDisplayTitle(currentNoteTitle)
					: resolvedCurrentView === "chat" && currentChatId
						? currentChatTitle
						: null,
		breadcrumbSectionLabel:
			resolvedCurrentView === "notFound"
				? "Page Not Found"
				: resolvedCurrentView === "chat"
					? getSidebarViewTitle("chat")
					: resolvedCurrentView === "shared" || isSharedNote
						? getSidebarViewTitle("shared")
						: getSidebarViewTitle("home"),
		chats,
		chatComposerId,
		currentChatId,
		currentChatTitle,
		currentDate,
		currentDayOfMonth,
		currentMonthLabel,
		currentNoteCommentsOpener,
		currentNoteEditorActions,
		currentNoteId: resolvedCurrentNoteId,
		currentNoteTemplateSlug: resolvedSelectedNote?.templateSlug ?? null,
		currentNoteTitle,
		currentView: resolvedCurrentView,
		currentWeekdayLabel,
		handleAutoStartNoteCaptureHandled,
		handleBreadcrumbSectionClick: () => {
			if (resolvedCurrentView === "notFound") {
				handleViewChange("home");
				return;
			}

			if (resolvedCurrentView === "chat") {
				openFreshChat();
				return;
			}

			handleViewChange(
				resolvedCurrentView === "shared" || isSharedNote ? "shared" : "home",
			);
		},
		handleChatPersisted,
		handleChatRemoved,
		handleCreateNote,
		handleCreateNoteFromChatResponse,
		handleInboxOpenChange,
		handleNewChat,
		handleNoteTrashed,
		handleOpenCalendarEventNote,
		handleOpenCalendarSettings,
		handleOpenChat,
		handleQuickNote,
		handleSettingsOpenChange,
		handleSignOut,
		handleViewChange,
		handleWorkspaceCreate,
		inboxOpen,
		initialChatMessages,
		isDesktopMac,
		isLoadingUpcomingCalendarEvents,
		isResolvingCurrentNoteRoute: isResolvingCurrentNote,
		isSharedNote,
		isSigningOut,
		notes,
		openNote,
		selectedNote: resolvedSelectedNote,
		settingsOpen,
		settingsPage,
		setActiveWorkspaceId,
		setCurrentNoteCommentsOpener,
		setCurrentNoteEditorActions,
		setCurrentNoteTitle,
		sharedNotes,
		shouldAutoStartNoteCapture,
		shouldStopNoteCaptureWhenMeetingEnds,
		upcomingCalendarEvents,
		upcomingCalendarStatus,
		user,
		workspaces,
	};
};

type AppShellHeaderProps = {
	isDesktopMac: boolean;
	inboxOpen: boolean;
	breadcrumbSectionLabel: string;
	breadcrumbDetailLabel: string | null;
	onBreadcrumbSectionClick: () => void;
	currentView: AppView;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle: string;
	currentNoteTemplateSlug: string | null;
	currentNoteEditorActions: NoteEditorActions | null;
	currentNoteCommentsOpener: (() => void) | null;
	onCreateNote: () => void;
	onNoteTitleChange: (title: string) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
	onNewChat: () => void;
};

function AppShellHeader({
	isDesktopMac,
	inboxOpen,
	breadcrumbSectionLabel,
	breadcrumbDetailLabel,
	onBreadcrumbSectionClick,
	currentView,
	currentNoteId,
	currentNoteTitle,
	currentNoteTemplateSlug,
	currentNoteEditorActions,
	currentNoteCommentsOpener,
	onCreateNote,
	onNoteTitleChange,
	onNoteTrashed,
	onNewChat,
}: AppShellHeaderProps) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const { state: sidebarState } = useSidebarShell();
	const { leftInsetPanelWidth, leftOverlayPanelWidth } = useDockedPanelWidths();
	const breadcrumbRenameInitialTitleRef = React.useRef(currentNoteTitle);
	const breadcrumbRenameSavedTitleRef = React.useRef(currentNoteTitle);
	const [titleEditOpen, setTitleEditOpen] = React.useState(false);
	const [titleValue, setTitleValue] = React.useState("");
	const [isRenamingNote, setIsRenamingNote] = React.useState(false);
	const renameNote = useMutation(api.notes.rename).withOptimisticUpdate(
		(localStore, args) => {
			optimisticRenameNote(localStore, args.workspaceId, args.id, args.title);
		},
	);
	const canRenameCurrentNote = currentView === "note" && currentNoteId !== null;

	React.useEffect(() => {
		if (titleEditOpen) {
			return;
		}

		breadcrumbRenameSavedTitleRef.current = currentNoteTitle;
		setTitleValue(currentNoteTitle);
	}, [currentNoteTitle, titleEditOpen]);

	const commitBreadcrumbRename = React.useCallback(async () => {
		if (
			!canRenameCurrentNote ||
			!currentNoteId ||
			!activeWorkspaceId ||
			isRenamingNote
		) {
			return;
		}

		const nextTitle = titleValue.trim();
		const currentTitle = breadcrumbRenameSavedTitleRef.current.trim();

		if (nextTitle === currentTitle) {
			setTitleEditOpen(false);
			setTitleValue(nextTitle);
			return;
		}

		setIsRenamingNote(true);

		try {
			await renameNote({
				workspaceId: activeWorkspaceId,
				id: currentNoteId,
				title: nextTitle,
			});
			breadcrumbRenameInitialTitleRef.current = nextTitle;
			breadcrumbRenameSavedTitleRef.current = nextTitle;
			setTitleEditOpen(false);
			setTitleValue(nextTitle);
			toast.success("Note renamed");
		} catch (error) {
			console.error("Failed to rename note", error);
			toast.error("Failed to rename note");
		} finally {
			setIsRenamingNote(false);
		}
	}, [
		activeWorkspaceId,
		canRenameCurrentNote,
		currentNoteId,
		isRenamingNote,
		renameNote,
		titleValue,
	]);

	const handleBreadcrumbTitleEditOpenChange = React.useCallback(
		(open: boolean) => {
			if (open) {
				breadcrumbRenameInitialTitleRef.current = currentNoteTitle;
				breadcrumbRenameSavedTitleRef.current = currentNoteTitle;
				setTitleEditOpen(true);
				return;
			}

			void commitBreadcrumbRename();
		},
		[commitBreadcrumbRename, currentNoteTitle],
	);

	const openBreadcrumbTitleEditor = React.useCallback(() => {
		breadcrumbRenameInitialTitleRef.current = currentNoteTitle;
		breadcrumbRenameSavedTitleRef.current = currentNoteTitle;
		setTitleEditOpen(true);
	}, [currentNoteTitle]);

	return (
		<header
			className={cn(
				"sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6 relative",
				isDesktopMac && DESKTOP_MAIN_HEADER_CLASS,
			)}
		>
			{isDesktopMac ? (
				<div
					aria-hidden="true"
					data-app-region="drag"
					className="absolute inset-y-0 right-0"
					style={{
						left:
							!inboxOpen || leftInsetPanelWidth
								? 0
								: (leftOverlayPanelWidth ?? DESKTOP_INBOX_PANEL_WIDTH),
					}}
				/>
			) : null}
			<div
				className={cn(
					"relative z-10 flex min-w-0 flex-1 items-center gap-2 pr-4",
					isDesktopMac && DESKTOP_MAIN_HEADER_CONTENT_CLASS,
					isDesktopMac &&
						sidebarState === "collapsed" &&
						DESKTOP_MAIN_HEADER_LEADING_CLASS,
				)}
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<SidebarTrigger
							data-app-region={isDesktopMac ? "no-drag" : undefined}
						/>
					</TooltipTrigger>
					<TooltipContent side="bottom" align="start" sideOffset={8}>
						<div className="flex items-center gap-2">
							<span>Toggle sidebar</span>
							<kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
								<span className="text-xs">⌘</span>B
							</kbd>
						</div>
					</TooltipContent>
				</Tooltip>
				<Separator
					orientation="vertical"
					className="mr-2 data-[orientation=vertical]:h-4"
				/>
				<AppShellBreadcrumbs
					breadcrumbSectionLabel={breadcrumbSectionLabel}
					breadcrumbDetailLabel={breadcrumbDetailLabel}
					isDesktopMac={isDesktopMac}
					onBreadcrumbSectionClick={onBreadcrumbSectionClick}
					canRenameCurrentNote={canRenameCurrentNote}
					titleEditOpen={titleEditOpen}
					onTitleEditOpenChange={handleBreadcrumbTitleEditOpenChange}
					onOpenTitleEditor={openBreadcrumbTitleEditor}
					titleValue={titleValue}
					onTitleValueChange={(value) => {
						setTitleValue(value);
						onNoteTitleChange(value);
					}}
					onCommitTitleRename={() => {
						void commitBreadcrumbRename();
					}}
					onCancelTitleRename={() => {
						setTitleEditOpen(false);
						onNoteTitleChange(breadcrumbRenameInitialTitleRef.current);
						setTitleValue(breadcrumbRenameInitialTitleRef.current);
					}}
				/>
			</div>
			<div
				className={cn(
					"relative z-10 ml-auto shrink-0",
					isDesktopMac && DESKTOP_MAIN_HEADER_CONTENT_CLASS,
				)}
			>
				<AppShellHeaderActions
					currentView={currentView}
					currentNoteId={currentNoteId}
					currentNoteTitle={currentNoteTitle}
					currentNoteTemplateSlug={currentNoteTemplateSlug}
					currentNoteEditorActions={currentNoteEditorActions}
					currentNoteCommentsOpener={currentNoteCommentsOpener}
					isDesktopMac={isDesktopMac}
					onCreateNote={onCreateNote}
					onNoteTrashed={onNoteTrashed}
					onNewChat={onNewChat}
				/>
			</div>
		</header>
	);
}

function AppShellBreadcrumbs({
	breadcrumbSectionLabel,
	breadcrumbDetailLabel,
	isDesktopMac,
	onBreadcrumbSectionClick,
	canRenameCurrentNote,
	titleEditOpen,
	onTitleEditOpenChange,
	onOpenTitleEditor,
	titleValue,
	onTitleValueChange,
	onCommitTitleRename,
	onCancelTitleRename,
}: {
	breadcrumbSectionLabel: string;
	breadcrumbDetailLabel: string | null;
	isDesktopMac: boolean;
	onBreadcrumbSectionClick: () => void;
	canRenameCurrentNote: boolean;
	titleEditOpen: boolean;
	onTitleEditOpenChange: (open: boolean) => void;
	onOpenTitleEditor: () => void;
	titleValue: string;
	onTitleValueChange: (value: string) => void;
	onCommitTitleRename: () => void;
	onCancelTitleRename: () => void;
}) {
	return (
		<Breadcrumb className="min-w-0 flex-1">
			<BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
				{breadcrumbDetailLabel ? (
					<>
						<BreadcrumbItem className="hidden shrink-0 md:inline-flex">
							<BreadcrumbLink asChild>
								<button
									type="button"
									data-app-region={isDesktopMac ? "no-drag" : undefined}
									className="cursor-pointer truncate"
									onClick={onBreadcrumbSectionClick}
								>
									{breadcrumbSectionLabel}
								</button>
							</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden shrink-0 md:block" />
						<BreadcrumbItem className="min-w-0 flex-1 overflow-hidden">
							{canRenameCurrentNote ? (
								<Popover
									open={titleEditOpen}
									onOpenChange={onTitleEditOpenChange}
								>
									<Tooltip>
										<TooltipTrigger asChild>
											<PopoverAnchor asChild>
												<button
													type="button"
													aria-current="page"
													data-app-region={isDesktopMac ? "no-drag" : undefined}
													className="line-clamp-1 -mx-1 -my-0.5 cursor-pointer rounded px-1 py-0.5 text-left"
													onClick={onOpenTitleEditor}
												>
													<BreadcrumbPage className="block truncate">
														{breadcrumbDetailLabel}
													</BreadcrumbPage>
												</button>
											</PopoverAnchor>
										</TooltipTrigger>
										<TooltipContent>Rename note</TooltipContent>
									</Tooltip>
									<PopoverContent
										align="start"
										side="bottom"
										sideOffset={6}
										className="w-[340px] rounded-lg border-sidebar-border/70 bg-sidebar p-1.5 shadow-2xl ring-1 ring-border/60"
									>
										<div className="flex items-center gap-2">
											<NoteTitleEditInput
												focusOnMount
												commitOnBlur={false}
												value={titleValue}
												onValueChange={onTitleValueChange}
												onCommit={onCommitTitleRename}
												onCancel={onCancelTitleRename}
											/>
										</div>
									</PopoverContent>
								</Popover>
							) : (
								<BreadcrumbPage className="block truncate">
									{breadcrumbDetailLabel}
								</BreadcrumbPage>
							)}
						</BreadcrumbItem>
					</>
				) : (
					<BreadcrumbItem className="min-w-0 flex-1 overflow-hidden">
						<BreadcrumbPage className="block truncate">
							{breadcrumbSectionLabel}
						</BreadcrumbPage>
					</BreadcrumbItem>
				)}
			</BreadcrumbList>
		</Breadcrumb>
	);
}

function AppShellHeaderActions({
	currentView,
	currentNoteId,
	currentNoteTitle,
	currentNoteTemplateSlug,
	currentNoteEditorActions,
	currentNoteCommentsOpener,
	isDesktopMac,
	onCreateNote,
	onNoteTrashed,
	onNewChat,
}: Pick<
	AppShellHeaderProps,
	| "currentView"
	| "currentNoteId"
	| "currentNoteTitle"
	| "currentNoteTemplateSlug"
	| "currentNoteEditorActions"
	| "currentNoteCommentsOpener"
	| "isDesktopMac"
	| "onCreateNote"
	| "onNoteTrashed"
	| "onNewChat"
>) {
	if (currentView === "home") {
		return (
			<Button
				variant="outline"
				data-app-region={isDesktopMac ? "no-drag" : undefined}
				onClick={onCreateNote}
			>
				<Plus />
				Quick note
			</Button>
		);
	}

	if (currentView === "chat") {
		return (
			<Button
				variant="outline"
				data-app-region={isDesktopMac ? "no-drag" : undefined}
				onClick={onNewChat}
			>
				<Plus />
				New chat
			</Button>
		);
	}

	if (currentView === "inbox") {
		return null;
	}

	if (currentView !== "note" || !currentNoteId) {
		return null;
	}

	return (
		<div
			className="flex items-center gap-2"
			data-app-region={isDesktopMac ? "no-drag" : undefined}
		>
			{currentNoteEditorActions?.canShowTemplateSelect ? (
				<NoteTemplateSelect
					disabled={!currentNoteEditorActions}
					selectedSlug={currentNoteTemplateSlug}
					onTemplateSelect={async (template) =>
						(await currentNoteEditorActions?.applyTemplate(template)) ?? false
					}
				/>
			) : null}
			<NoteStarButton noteId={currentNoteId} className="size-7" />
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						data-app-region={isDesktopMac ? "no-drag" : undefined}
						aria-label="Open comments"
						onClick={() => {
							if (currentNoteCommentsOpener) {
								currentNoteCommentsOpener();
								return;
							}

							window.dispatchEvent(new Event(OPEN_NOTE_COMMENTS_EVENT));
						}}
					>
						<MessageSquareText className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Open comments</TooltipContent>
			</Tooltip>
			<NoteHeaderActionsMenu
				noteId={currentNoteId}
				noteTitle={currentNoteTitle}
				noteEditorActions={currentNoteEditorActions}
				onNoteTrashed={onNoteTrashed}
			/>
		</div>
	);
}

function NoteHeaderActionsMenu({
	noteId,
	noteTitle,
	noteEditorActions,
	onNoteTrashed,
}: {
	noteId: Id<"notes">;
	noteTitle: string;
	noteEditorActions: NoteEditorActions | null;
	onNoteTrashed: (noteId: Id<"notes">) => void;
}) {
	return (
		<NoteActionsMenu
			noteId={noteId}
			onMoveToTrash={onNoteTrashed}
			align="end"
			triggerTooltip="More actions"
			showRename={false}
			itemsBeforeDefaults={
				noteEditorActions ? (
					<DropdownMenuItem
						className="cursor-pointer"
						disabled={!noteEditorActions.canCopyMarkdown}
						onSelect={(event) => {
							event.preventDefault();
							noteEditorActions.copyMarkdown();
						}}
					>
						<Copy />
						Copy note content
					</DropdownMenuItem>
				) : null
			}
			itemsAfterDefaults={
				noteEditorActions ? (
					<>
						<DropdownMenuItem
							className="cursor-pointer"
							disabled={!noteEditorActions.canUndo}
							onSelect={(event) => {
								event.preventDefault();
								noteEditorActions.undo();
							}}
						>
							<Undo2 />
							Undo
						</DropdownMenuItem>
						<DropdownMenuItem
							className="cursor-pointer"
							disabled={!noteEditorActions.canRedo}
							onSelect={(event) => {
								event.preventDefault();
								noteEditorActions.redo();
							}}
						>
							<Redo2 />
							Redo
						</DropdownMenuItem>
						<DropdownMenuItem
							className="cursor-pointer"
							disabled={!noteEditorActions.canCopyMarkdown}
							onSelect={(event) => {
								event.preventDefault();
								noteEditorActions.exportMarkdown();
							}}
						>
							<ArrowDown />
							Export
						</DropdownMenuItem>
					</>
				) : null
			}
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className="text-muted-foreground hover:text-foreground"
				aria-label={`Open actions for ${noteTitle || "note"}`}
			>
				<MoreHorizontal className="size-4" />
			</Button>
		</NoteActionsMenu>
	);
}

const AppShellContent = React.memo(function AppShellContent({
	isDesktopMac,
	currentView,
	currentDate,
	currentDayOfMonth,
	currentMonthLabel,
	currentWeekdayLabel,
	upcomingCalendarEvents,
	upcomingCalendarStatus,
	isLoadingUpcomingCalendarEvents,
	notes,
	sharedNotes,
	currentNoteId,
	currentNoteTitle,
	selectedNote,
	user,
	onOpenNote,
	onNoteTrashed,
	onCreateNote,
	onOpenCalendarEventNote,
	onOpenCalendarSettings,
	chatComposerId,
	initialChatMessages,
	chats,
	currentChatId,
	activeWorkspace,
	onChatPersisted,
	onOpenChat,
	onChatRemoved,
	onOpenConnectionsSettings,
	onCreateNoteFromChatResponse,
	onNoteTitleChange,
	onNoteEditorActionsChange,
	onNoteCommentsOpenChange,
	onAutoStartNoteCaptureHandled,
	shouldAutoStartNoteCapture,
	shouldStopNoteCaptureWhenMeetingEnds,
	onGoHome,
}: {
	isDesktopMac: boolean;
	currentView: AppView;
	currentDate: Date;
	currentDayOfMonth: number;
	currentMonthLabel: string;
	currentWeekdayLabel: string;
	upcomingCalendarEvents: UpcomingCalendarEvent[];
	upcomingCalendarStatus: "idle" | "ready" | "not_connected" | "error";
	isLoadingUpcomingCalendarEvents: boolean;
	notes: Array<Doc<"notes">> | undefined;
	sharedNotes: Array<Doc<"notes">> | undefined;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle: string;
	selectedNote: Doc<"notes"> | null | undefined;
	user: AppUser;
	onOpenNote: (noteId: Id<"notes">) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
	onCreateNote: () => void;
	onOpenCalendarEventNote: (
		event: UpcomingCalendarEvent,
		options?: {
			autoStartCapture?: boolean;
			stopCaptureWhenMeetingEnds?: boolean;
		},
	) => Promise<void> | void;
	onOpenCalendarSettings: () => void;
	chatComposerId: string;
	initialChatMessages: UIMessage[];
	chats: Array<Doc<"chats">> | undefined;
	currentChatId: string | null;
	activeWorkspace: WorkspaceRecord | null;
	onChatPersisted?: (chatId: string) => void;
	onOpenChat: (chatId: string) => void;
	onChatRemoved: (chatId: string) => void;
	onOpenConnectionsSettings: () => void;
	onCreateNoteFromChatResponse: (
		title: string,
		content: string,
	) => Promise<"created" | undefined> | "created" | undefined;
	onNoteTitleChange: (title: string) => void;
	onNoteEditorActionsChange: (actions: NoteEditorActions | null) => void;
	onNoteCommentsOpenChange: (opener: (() => void) | null) => void;
	onAutoStartNoteCaptureHandled: () => void;
	shouldAutoStartNoteCapture: boolean;
	shouldStopNoteCaptureWhenMeetingEnds: boolean;
	onGoHome: () => void;
}) {
	const noteViewScrollRef = React.useRef<HTMLDivElement | null>(null);
	const noteScrollResetKey =
		currentView === "note" ? (currentNoteId ?? "new") : null;

	React.useEffect(() => {
		if (noteScrollResetKey === null) {
			return;
		}

		noteViewScrollRef.current?.scrollTo({
			top: 0,
			behavior: "auto",
		});
	}, [noteScrollResetKey]);

	if (currentView === "notFound") {
		return <NotFoundView onGoHome={onGoHome} />;
	}

	if (currentView === "home") {
		return (
			<ScrollArea
				className="min-h-0 flex-1"
				viewportClassName="overscroll-contain"
			>
				<HomeView
					currentDate={currentDate}
					currentDayOfMonth={currentDayOfMonth}
					currentMonthLabel={currentMonthLabel}
					currentWeekdayLabel={currentWeekdayLabel}
					upcomingCalendarEvents={upcomingCalendarEvents}
					upcomingCalendarStatus={upcomingCalendarStatus}
					isLoadingUpcomingCalendarEvents={isLoadingUpcomingCalendarEvents}
					notes={notes}
					currentNoteId={currentNoteId}
					currentNoteTitle={currentNoteTitle}
					currentUser={user}
					onOpenNote={onOpenNote}
					onNoteTrashed={onNoteTrashed}
					onCreateNote={onCreateNote}
					onOpenCalendarEventNote={onOpenCalendarEventNote}
					onOpenCalendarSettings={onOpenCalendarSettings}
				/>
			</ScrollArea>
		);
	}

	if (currentView === "shared") {
		return (
			<ScrollArea
				className="min-h-0 flex-1"
				viewportClassName="overscroll-contain"
			>
				<SharedView
					sharedNotes={sharedNotes}
					currentNoteId={currentNoteId}
					currentNoteTitle={currentNoteTitle}
					currentUser={user}
					onOpenNote={onOpenNote}
					onNoteTrashed={onNoteTrashed}
				/>
			</ScrollArea>
		);
	}

	if (currentView === "note") {
		return (
			<ScrollArea
				className="min-h-0 flex-1"
				viewportClassName="overscroll-contain"
				viewportRef={noteViewScrollRef}
			>
				<React.Suspense fallback={null}>
					<NotePageSurface
						key={currentNoteId ?? "new"}
						autoStartTranscription={shouldAutoStartNoteCapture}
						currentUser={user}
						isDesktopMac={isDesktopMac}
						noteId={currentNoteId}
						note={selectedNote}
						externalTitle={currentNoteTitle}
						onAutoStartTranscriptionHandled={onAutoStartNoteCaptureHandled}
						onCommentsOpenChange={onNoteCommentsOpenChange}
						onTitleChange={onNoteTitleChange}
						onEditorActionsChange={onNoteEditorActionsChange}
						scrollParentRef={noteViewScrollRef}
						stopTranscriptionWhenMeetingEnds={
							shouldStopNoteCaptureWhenMeetingEnds
						}
					/>
				</React.Suspense>
			</ScrollArea>
		);
	}

	return (
		<React.Suspense fallback={<div className="flex-1 bg-background" />}>
			<ChatPageSurface
				key={chatComposerId}
				chatId={chatComposerId}
				initialMessages={initialChatMessages}
				onChatPersisted={onChatPersisted}
				chats={chats ?? []}
				isChatsLoading={chats === undefined}
				activeChatId={currentChatId}
				onOpenChat={onOpenChat}
				onChatRemoved={onChatRemoved}
				activeWorkspace={activeWorkspace}
				onOpenConnectionsSettings={onOpenConnectionsSettings}
				onCreateNoteFromResponse={onCreateNoteFromChatResponse}
			/>
		</React.Suspense>
	);
});

function NotFoundView({ onGoHome }: { onGoHome: () => void }) {
	return (
		<div className="flex flex-1 items-center justify-center px-8 py-10">
			<Empty className="max-w-lg border-none">
				<EmptyHeader>
					<EmptyTitle>404 - Not Found</EmptyTitle>
					<EmptyDescription>
						The page you&apos;re looking for doesn&apos;t exist. Use the sidebar
						to search or go back home.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button onClick={onGoHome} size="sm">
						Go to Home
					</Button>
				</EmptyContent>
			</Empty>
		</div>
	);
}

export function AuthenticatedAppShell({
	session,
	workspaces,
	initialDesktopMac,
}: {
	session: AuthSession;
	workspaces: Array<WorkspaceRecord>;
	initialDesktopMac: boolean;
}) {
	const controller = useAppShellState({
		session,
		workspaces,
		initialDesktopMac,
	});
	const activeWorkspace = React.useMemo(
		() =>
			controller.workspaces.find(
				(workspace) => workspace._id === controller.activeWorkspaceId,
			) ?? null,
		[controller.activeWorkspaceId, controller.workspaces],
	);
	const handleOpenConnectionsSettings = React.useCallback(
		() => controller.handleSettingsOpenChange(true, "Connections"),
		[controller.handleSettingsOpenChange],
	);
	const handleNoteCommentsOpenChange = React.useCallback(
		(opener: (() => void) | null) => {
			controller.setCurrentNoteCommentsOpener(() => opener);
		},
		[controller.setCurrentNoteCommentsOpener],
	);
	const handleGoHome = React.useCallback(
		() => controller.handleViewChange("home"),
		[controller.handleViewChange],
	);

	return (
		<ActiveWorkspaceProvider workspaceId={controller.activeWorkspaceId}>
			<SidebarProvider className="h-svh overflow-hidden">
				<AppSidebar
					workspaces={controller.workspaces}
					activeWorkspaceId={controller.activeWorkspaceId}
					currentView={controller.currentView}
					inboxOpen={controller.inboxOpen}
					user={controller.user}
					chats={controller.chats}
					notes={controller.notes}
					sharedNotes={controller.sharedNotes}
					onWorkspaceSelect={controller.setActiveWorkspaceId}
					onWorkspaceCreate={controller.handleWorkspaceCreate}
					onViewChange={controller.handleViewChange}
					onInboxOpenChange={controller.handleInboxOpenChange}
					settingsOpen={controller.settingsOpen}
					settingsPage={controller.settingsPage}
					onSettingsOpenChange={controller.handleSettingsOpenChange}
					onSignOut={controller.handleSignOut}
					signingOut={controller.isSigningOut}
					desktopSafeTop={controller.isDesktopMac}
					currentNoteId={controller.currentNoteId}
					currentNoteTitle={controller.currentNoteTitle}
					onChatSelect={controller.handleOpenChat}
					onNoteSelect={controller.openNote}
					onNoteTitleChange={controller.setCurrentNoteTitle}
					onNoteTrashed={controller.handleNoteTrashed}
					onCreateNote={controller.handleQuickNote}
				/>
				<AppShellInset reserveRightSidebar={controller.currentView === "note"}>
					<AppShellHeader
						isDesktopMac={controller.isDesktopMac}
						inboxOpen={controller.inboxOpen}
						breadcrumbSectionLabel={controller.breadcrumbSectionLabel}
						breadcrumbDetailLabel={controller.breadcrumbDetailLabel}
						onBreadcrumbSectionClick={controller.handleBreadcrumbSectionClick}
						currentView={controller.currentView}
						currentNoteId={controller.currentNoteId}
						currentNoteTitle={controller.currentNoteTitle}
						currentNoteTemplateSlug={controller.currentNoteTemplateSlug}
						currentNoteEditorActions={controller.currentNoteEditorActions}
						currentNoteCommentsOpener={controller.currentNoteCommentsOpener}
						onCreateNote={controller.handleQuickNote}
						onNoteTitleChange={controller.setCurrentNoteTitle}
						onNoteTrashed={controller.handleNoteTrashed}
						onNewChat={controller.handleNewChat}
					/>
					<AppShellContent
						isDesktopMac={controller.isDesktopMac}
						currentView={controller.currentView}
						currentDate={controller.currentDate}
						currentDayOfMonth={controller.currentDayOfMonth}
						currentMonthLabel={controller.currentMonthLabel}
						currentWeekdayLabel={controller.currentWeekdayLabel}
						upcomingCalendarEvents={controller.upcomingCalendarEvents}
						upcomingCalendarStatus={controller.upcomingCalendarStatus}
						isLoadingUpcomingCalendarEvents={
							controller.isLoadingUpcomingCalendarEvents
						}
						notes={controller.notes}
						sharedNotes={controller.sharedNotes}
						currentNoteId={controller.currentNoteId}
						currentNoteTitle={controller.currentNoteTitle}
						selectedNote={controller.selectedNote}
						user={controller.user}
						onOpenNote={controller.openNote}
						onNoteTrashed={controller.handleNoteTrashed}
						onCreateNote={controller.handleQuickNote}
						onOpenCalendarEventNote={controller.handleOpenCalendarEventNote}
						onOpenCalendarSettings={controller.handleOpenCalendarSettings}
						chatComposerId={controller.chatComposerId}
						initialChatMessages={controller.initialChatMessages}
						chats={controller.chats}
						currentChatId={controller.currentChatId}
						activeWorkspace={activeWorkspace}
						onChatPersisted={controller.handleChatPersisted}
						onOpenChat={controller.handleOpenChat}
						onChatRemoved={controller.handleChatRemoved}
						onOpenConnectionsSettings={handleOpenConnectionsSettings}
						onCreateNoteFromChatResponse={
							controller.handleCreateNoteFromChatResponse
						}
						onNoteTitleChange={controller.setCurrentNoteTitle}
						onNoteEditorActionsChange={controller.setCurrentNoteEditorActions}
						onNoteCommentsOpenChange={handleNoteCommentsOpenChange}
						onAutoStartNoteCaptureHandled={
							controller.handleAutoStartNoteCaptureHandled
						}
						shouldAutoStartNoteCapture={controller.shouldAutoStartNoteCapture}
						shouldStopNoteCaptureWhenMeetingEnds={
							controller.shouldStopNoteCaptureWhenMeetingEnds
						}
						onGoHome={handleGoHome}
					/>
				</AppShellInset>
			</SidebarProvider>
		</ActiveWorkspaceProvider>
	);
}
