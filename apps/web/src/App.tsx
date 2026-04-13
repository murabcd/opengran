import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Checkbox } from "@workspace/ui/components/checkbox";
import { DropdownMenuItem } from "@workspace/ui/components/dropdown-menu";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@workspace/ui/components/empty";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Icons } from "@workspace/ui/components/icons";
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
	useSidebar,
} from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	ArrowDown,
	CalendarClock,
	Check,
	Copy,
	ExternalLink,
	FileText,
	LoaderCircle,
	MessageSquareText,
	Mic,
	MoreHorizontal,
	Plus,
	Redo2,
	TriangleAlert,
	Undo2,
	Volume2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ChatPage } from "@/components/chat/chat-page";
import { AppShellInset } from "@/components/layout/app-shell-inset";
import {
	NoteActionsMenu,
	NoteStarButton,
} from "@/components/note/note-actions-menu";
import {
	type NoteEditorActions,
	NotePage,
	OPEN_NOTE_COMMENTS_EVENT,
} from "@/components/note/note-page";
import { NoteTitleEditInput } from "@/components/note/note-title-edit-input";
import { optimisticRenameNote } from "@/components/note/optimistic-rename-note";
import { SharedNotePage } from "@/components/note/shared-note-page";
import type { SettingsPage } from "@/components/settings/settings-dialog";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import { NoteTemplateSelect } from "@/components/templates/note-template-select";
import { OpenGranMark } from "@/components/ui/open-gran-mark";
import { WorkspaceComposer } from "@/components/workspaces/workspace-composer";
import {
	ActiveWorkspaceProvider,
	useActiveWorkspaceId,
} from "@/hooks/use-active-workspace";
import { type AuthSession, authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
import {
	DESKTOP_AUTH_SAFE_TOP_CLASS,
	DESKTOP_INBOX_PANEL_WIDTH,
	DESKTOP_MAIN_HEADER_CLASS,
	DESKTOP_MAIN_HEADER_CONTENT_CLASS,
	DESKTOP_MAIN_HEADER_LEADING_CLASS,
} from "@/lib/desktop-chrome";
import { getSidebarViewTitle } from "@/lib/navigation";
import { getNoteDisplayTitle } from "@/lib/note-title";
import {
	getSuggestedWorkspaceName,
	type WorkspaceRecord,
} from "@/lib/workspaces";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type AppUser = {
	name: string;
	email: string;
	avatar: string;
};

type AppView = "home" | "chat" | "inbox" | "shared" | "note" | "notFound";
type AppLocationState = {
	view: AppView;
	chatId: string | null;
	noteIdString: string | null;
	shouldAutoStartNoteCapture: boolean;
	shouldStopNoteCaptureWhenMeetingEnds: boolean;
	scheduledAutoStartNoteCaptureAt: string | null;
	pendingCalendarEvent: UpcomingCalendarEvent | null;
	canonicalPath: "/home" | "/chat" | "/inbox" | "/shared" | "/note" | null;
	canonicalSearch: string;
};
type SocialAuthProvider = "github" | "google";

const SETTINGS_PAGE_BY_SLUG = {
	profile: "Profile",
	appearance: "Appearance",
	preferences: "Preferences",
	notifications: "Notifications",
	workspace: "Workspace",
	calendar: "Calendar",
	connections: "Connections",
	"data-controls": "Data controls",
} as const satisfies Record<string, SettingsPage>;

const SETTINGS_SLUG_BY_PAGE: Record<SettingsPage, string> = {
	Profile: "profile",
	Appearance: "appearance",
	Preferences: "preferences",
	Notifications: "notifications",
	Workspace: "workspace",
	Calendar: "calendar",
	Connections: "connections",
	"Data controls": "data-controls",
};

type DesktopPermissionRow = {
	id: DesktopPermissionId;
	description: string;
	label: string;
	state: DesktopPermissionState;
	required: boolean;
	canRequest: boolean;
	canOpenSystemSettings: boolean;
};

const isMissingDesktopPermissionHandlerError = (error: unknown) =>
	error instanceof Error &&
	error.message.includes(
		"No handler registered for 'app:get-permissions-status'",
	);

const HOME_NOTE_SKELETON_IDS = [
	"home-note-skeleton-1",
	"home-note-skeleton-2",
	"home-note-skeleton-3",
] as const;
const WELCOME_FIREWORK_COLOR_VARIABLES = [
	"--chart-1",
	"--chart-2",
	"--chart-3",
	"--chart-4",
	"--chart-5",
] as const;

function getThemeFireworkColors() {
	if (typeof window === "undefined") {
		return ["#afabff", "#8f88ff", "#7166ff", "#564dff", "#4138d9"];
	}

	const styles = window.getComputedStyle(document.documentElement);
	return WELCOME_FIREWORK_COLOR_VARIABLES.map((variableName) =>
		styles.getPropertyValue(variableName).trim(),
	).filter(Boolean);
}
const DESKTOP_PERMISSION_LABELS: Record<DesktopPermissionId, string> = {
	microphone: "Transcribe me",
	systemAudio: "Transcribe others",
};

const DESKTOP_PERMISSION_BUTTON_LABELS: Record<DesktopPermissionId, string> = {
	microphone: "Enable",
	systemAudio: "Enable",
};

type GroupedItems<T> = {
	today: T[];
	yesterday: T[];
	lastWeek: T[];
	lastMonth: T[];
	older: T[];
};

type UpcomingCalendarEvent = {
	id: string;
	calendarId: string;
	calendarName: string;
	title: string;
	startAt: string;
	endAt: string;
	isAllDay: boolean;
	isMeeting: boolean;
	htmlLink?: string;
	meetingUrl?: string;
	location?: string;
};

const createCalendarEventKey = (event: UpcomingCalendarEvent) =>
	[event.calendarId, event.id, event.startAt].join("::");

const GOOGLE_CALENDAR_SCOPES = [
	"openid",
	"email",
	"profile",
	"https://www.googleapis.com/auth/calendar.readonly",
] as const;

const currentMonthFormatter = new Intl.DateTimeFormat(undefined, {
	month: "long",
});

const currentWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
});

const upcomingEventDateFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
	weekday: "short",
});

const upcomingEventTimeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});
const noteCreatedTimeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

const isSameCalendarDay = (left: Date, right: Date) =>
	left.getFullYear() === right.getFullYear() &&
	left.getMonth() === right.getMonth() &&
	left.getDate() === right.getDate();

const getNoteAuthorDisplayName = (note: Doc<"notes">, currentUser: AppUser) =>
	note.authorName?.trim() || currentUser.name;

const formatNoteCreatedTime = (note: Doc<"notes">) =>
	noteCreatedTimeFormatter.format(
		new Date(note.createdAt || note._creationTime),
	);

const getCurrentDayWindow = (currentDate: Date) => {
	const timeMin = new Date(currentDate);
	timeMin.setHours(0, 0, 0, 0);

	const timeMax = new Date(currentDate);
	timeMax.setHours(23, 59, 59, 999);

	return {
		timeMin: timeMin.toISOString(),
		timeMax: timeMax.toISOString(),
	};
};

const getDayWindowFromDayKey = (dayKey: string) => {
	const [year, month, day] = dayKey.split("-").map((value) => Number(value));
	return getCurrentDayWindow(new Date(year, month - 1, day));
};

const isUpcomingEventLive = (
	event: UpcomingCalendarEvent,
	currentDate: Date,
) => {
	const startAt = new Date(event.startAt).getTime();
	const endAt = new Date(event.endAt).getTime();
	const now = currentDate.getTime();
	const liveWindowStart = startAt - 5 * 60 * 1000;

	return now >= liveWindowStart && now <= endAt;
};

const getUpcomingCalendarIndicator = ({
	hasLiveMeeting,
	status,
}: {
	hasLiveMeeting: boolean;
	status: "idle" | "ready" | "not_connected" | "error";
}) => {
	if (hasLiveMeeting) {
		return {
			label: "Live now",
			dotClassName: "bg-status-live",
		};
	}

	if (status === "idle") {
		return {
			label: "Checking",
			dotClassName: "bg-warning-foreground",
		};
	}

	if (status === "ready") {
		return {
			label: "Connected",
			dotClassName: "bg-chart-1",
		};
	}

	if (status === "error") {
		return {
			label: "Sync issue",
			dotClassName: "bg-destructive",
		};
	}

	return {
		label: "Not connected",
		dotClassName: "bg-muted-foreground/60",
	};
};

const formatUpcomingEventMeta = (
	event: UpcomingCalendarEvent,
	currentDate: Date,
) => {
	const startAt = new Date(event.startAt);
	const endAt = new Date(event.endAt);

	if (event.isAllDay) {
		return isSameCalendarDay(startAt, currentDate)
			? "Today · All day"
			: `${upcomingEventDateFormatter.format(startAt)} · All day`;
	}

	const timeRange = `${upcomingEventTimeFormatter.format(startAt)} - ${upcomingEventTimeFormatter.format(endAt)}`;

	if (isUpcomingEventLive(event, currentDate)) {
		return `Now · ${timeRange}`;
	}

	return isSameCalendarDay(startAt, currentDate)
		? timeRange
		: `${upcomingEventDateFormatter.format(startAt)} · ${timeRange}`;
};

const isUpcomingEventToday = (
	event: UpcomingCalendarEvent,
	currentDate: Date,
) => {
	const startAt = new Date(event.startAt);
	const endAt = new Date(event.endAt).getTime();

	return (
		isSameCalendarDay(startAt, currentDate) && endAt >= currentDate.getTime()
	);
};

const buildCalendarEventNoteDocument = ({
	currentDate,
	event,
}: {
	currentDate: Date;
	event: UpcomingCalendarEvent;
}) => {
	const details = [
		`When: ${formatUpcomingEventMeta(event, currentDate)}`,
		`Calendar: ${event.calendarName}`,
		event.location?.trim() ? `Location: ${event.location.trim()}` : null,
		event.meetingUrl?.trim() ? `Join link: ${event.meetingUrl.trim()}` : null,
	].filter((value): value is string => Boolean(value));

	return JSON.stringify({
		type: "doc",
		content: details.map((detail) => ({
			type: "paragraph",
			content: [{ type: "text", text: detail }],
		})),
	});
};

const buildCalendarEventSearchableText = ({
	currentDate,
	event,
}: {
	currentDate: Date;
	event: UpcomingCalendarEvent;
}) =>
	[
		event.title.trim(),
		`When: ${formatUpcomingEventMeta(event, currentDate)}`,
		`Calendar: ${event.calendarName}`,
		event.location?.trim() ? `Location: ${event.location.trim()}` : null,
		event.meetingUrl?.trim() ? `Join link: ${event.meetingUrl.trim()}` : null,
	]
		.filter((value): value is string => Boolean(value))
		.join("\n");

const appendCalendarEventSearchParams = ({
	event,
	searchParams,
}: {
	event: UpcomingCalendarEvent;
	searchParams: URLSearchParams;
}) => {
	searchParams.set("calendarEventId", event.id);
	searchParams.set("calendarId", event.calendarId);
	searchParams.set("calendarName", event.calendarName);
	searchParams.set("eventTitle", event.title);
	searchParams.set("startAt", event.startAt);
	searchParams.set("endAt", event.endAt);
	searchParams.set("isAllDay", event.isAllDay ? "1" : "0");

	if (event.meetingUrl?.trim()) {
		searchParams.set("meetingUrl", event.meetingUrl);
	}

	if (event.location?.trim()) {
		searchParams.set("location", event.location);
	}

	if (event.htmlLink?.trim()) {
		searchParams.set("htmlLink", event.htmlLink);
	}
};

const getPendingCalendarEventFromUrl = (
	url: URL,
): UpcomingCalendarEvent | null => {
	const id = url.searchParams.get("calendarEventId")?.trim();
	const calendarId = url.searchParams.get("calendarId")?.trim();
	const calendarName = url.searchParams.get("calendarName")?.trim();
	const title = url.searchParams.get("eventTitle")?.trim();
	const startAt = url.searchParams.get("startAt")?.trim();
	const endAt = url.searchParams.get("endAt")?.trim();

	if (!id || !calendarId || !calendarName || !title || !startAt || !endAt) {
		return null;
	}

	return {
		id,
		calendarId,
		calendarName,
		title,
		startAt,
		endAt,
		isAllDay: url.searchParams.get("isAllDay") === "1",
		isMeeting: true,
		htmlLink: url.searchParams.get("htmlLink")?.trim() || undefined,
		location: url.searchParams.get("location")?.trim() || undefined,
		meetingUrl: url.searchParams.get("meetingUrl")?.trim() || undefined,
	};
};

const getScheduledAutoStartNoteCaptureAt = (url: URL): string | null => {
	const captureAt = url.searchParams.get("captureAt")?.trim();

	if (!captureAt) {
		return null;
	}

	return Number.isNaN(new Date(captureAt).getTime()) ? null : captureAt;
};

const createNoteSearch = ({
	autoStartCapture = false,
	calendarEvent,
	noteId,
	scheduledAutoStartAt,
	stopCaptureWhenMeetingEnds = false,
}: {
	autoStartCapture?: boolean;
	calendarEvent?: UpcomingCalendarEvent | null;
	noteId?: string | null;
	scheduledAutoStartAt?: string | null;
	stopCaptureWhenMeetingEnds?: boolean;
}) => {
	const searchParams = new URLSearchParams();

	if (noteId?.trim()) {
		searchParams.set("noteId", noteId);
	}

	if (autoStartCapture) {
		searchParams.set("capture", "1");
	}

	if (stopCaptureWhenMeetingEnds) {
		searchParams.set("meeting", "1");
	}

	if (scheduledAutoStartAt?.trim()) {
		searchParams.set("captureAt", scheduledAutoStartAt);
	}

	if (calendarEvent && !noteId) {
		appendCalendarEventSearchParams({
			event: calendarEvent,
			searchParams,
		});
	}

	const search = searchParams.toString();
	return search ? `?${search}` : "";
};

const getSettingsPageFromPath = (pathname: string): SettingsPage | null => {
	const normalizedPath = pathname.replace(/\/+$/, "") || "/";

	if (normalizedPath === "/settings") {
		return "Profile";
	}

	if (!normalizedPath.startsWith("/settings/")) {
		return null;
	}

	const slug = normalizedPath.slice("/settings/".length);
	return (
		SETTINGS_PAGE_BY_SLUG[slug as keyof typeof SETTINGS_PAGE_BY_SLUG] ??
		"Profile"
	);
};

const getSettingsPath = (page: SettingsPage) =>
	`/settings/${SETTINGS_SLUG_BY_PAGE[page]}`;

const normalizePathname = (pathname: string) => {
	const normalizedPath = pathname.replace(/\/+$/, "");
	return normalizedPath === "" ? "/" : normalizedPath;
};

const getNoteIdStringFromUrl = (url: URL) => {
	const nextValue = url.searchParams.get("noteId")?.trim();

	return nextValue ? nextValue : null;
};

const getAppLocationState = (url: URL): AppLocationState => {
	const pathname = normalizePathname(url.pathname);
	const noteIdString = getNoteIdStringFromUrl(url);
	const chatId = getChatIdFromUrl(url);
	const hashView =
		pathname === "/" || pathname === "/home"
			? url.hash === "#note"
				? "note"
				: url.hash === "#chat"
					? "chat"
					: url.hash === "#inbox"
						? "inbox"
						: url.hash === "#shared"
							? "shared"
							: null
			: null;
	const pathView =
		pathname === "/"
			? "home"
			: pathname === "/home"
				? "home"
				: pathname === "/note"
					? "note"
					: pathname === "/chat"
						? "chat"
						: pathname === "/inbox"
							? "inbox"
							: pathname === "/shared"
								? "shared"
								: null;
	const view = hashView ?? pathView;

	if (view === null) {
		return {
			view: "notFound",
			chatId: null,
			noteIdString: null,
			shouldAutoStartNoteCapture: false,
			shouldStopNoteCaptureWhenMeetingEnds: false,
			scheduledAutoStartNoteCaptureAt: null,
			pendingCalendarEvent: null,
			canonicalPath: null,
			canonicalSearch: "",
		};
	}

	const shouldAutoStartNoteCapture =
		view === "note" && url.searchParams.get("capture") === "1";
	const shouldStopNoteCaptureWhenMeetingEnds =
		view === "note" && url.searchParams.get("meeting") === "1";
	const scheduledAutoStartNoteCaptureAt =
		view === "note" ? getScheduledAutoStartNoteCaptureAt(url) : null;
	const pendingCalendarEvent =
		view === "note" && noteIdString === null
			? getPendingCalendarEventFromUrl(url)
			: null;

	return {
		view,
		chatId: view === "chat" ? chatId : null,
		noteIdString: view === "note" ? noteIdString : null,
		shouldAutoStartNoteCapture,
		shouldStopNoteCaptureWhenMeetingEnds,
		scheduledAutoStartNoteCaptureAt,
		pendingCalendarEvent,
		canonicalPath:
			view === "home"
				? "/home"
				: view === "chat"
					? "/chat"
					: view === "inbox"
						? "/inbox"
						: view === "shared"
							? "/shared"
							: "/note",
		canonicalSearch:
			view === "note"
				? createNoteSearch({
						autoStartCapture: shouldAutoStartNoteCapture,
						calendarEvent: pendingCalendarEvent,
						noteId: noteIdString,
						scheduledAutoStartAt: scheduledAutoStartNoteCaptureAt,
						stopCaptureWhenMeetingEnds: shouldStopNoteCaptureWhenMeetingEnds,
					})
				: view === "chat" && chatId
					? `?chatId=${encodeURIComponent(chatId)}`
					: "",
	};
};

const shouldAutoStartNoteCaptureFromUrl = (url: URL) =>
	getAppLocationState(url).shouldAutoStartNoteCapture;

const getInitialNonSettingsLocation = () => {
	if (typeof window === "undefined") {
		return "/home";
	}

	const url = new URL(window.location.href);
	const settingsPage = getSettingsPageFromPath(url.pathname);

	if (settingsPage || url.hash === "#settings") {
		return "/home";
	}

	return `${url.pathname}${url.search}${url.hash}`;
};

const getDelayUntilNextMinute = (now: Date) => {
	const nextMinute = new Date(now);
	nextMinute.setSeconds(60, 0);

	return nextMinute.getTime() - now.getTime();
};

const groupItemsByDate = <
	T extends {
		_creationTime: number;
		createdAt?: number;
		updatedAt?: number;
	},
>(
	items: T[],
): GroupedItems<T> => {
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
	const oneMonthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

	return items.reduce<GroupedItems<T>>(
		(groups, item) => {
			const noteDate = new Date(
				item.updatedAt || item.createdAt || item._creationTime,
			);

			if (isSameCalendarDay(noteDate, now)) {
				groups.today.push(item);
			} else if (isSameCalendarDay(noteDate, yesterday)) {
				groups.yesterday.push(item);
			} else if (noteDate.getTime() > oneWeekAgo) {
				groups.lastWeek.push(item);
			} else if (noteDate.getTime() > oneMonthAgo) {
				groups.lastMonth.push(item);
			} else {
				groups.older.push(item);
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

const getSharedNoteShareId = (pathname: string) => {
	const sharedPrefix = "/shared/";

	if (!pathname.startsWith(sharedPrefix)) {
		return null;
	}

	const nextValue = pathname.slice(sharedPrefix.length).trim();
	return nextValue ? decodeURIComponent(nextValue) : null;
};

const getChatIdFromUrl = (url: URL) => {
	const nextValue = url.searchParams.get("chatId")?.trim();

	return nextValue ? nextValue : null;
};

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

const useAppBootstrapState = () => {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
	const [authError, setAuthError] = React.useState<string | null>(null);
	const [authenticatingProvider, setAuthenticatingProvider] =
		React.useState<SocialAuthProvider | null>(null);
	const [isCreatingWorkspace, startWorkspaceCreation] = React.useTransition();
	const [isDesktopMac, setIsDesktopMac] = React.useState(false);
	const [desktopPlatform, setDesktopPlatform] =
		React.useState<DesktopPlatform>("darwin");
	const [workspaceName, setWorkspaceName] = React.useState("");
	const [workspaceError, setWorkspaceError] = React.useState<string | null>(
		null,
	);
	const [desktopPermissionsError, setDesktopPermissionsError] = React.useState<
		string | null
	>(null);
	const [desktopPermissionsStatus, setDesktopPermissionsStatus] =
		React.useState<DesktopPermissionsStatus | null>(null);
	const [isRefreshingDesktopPermissions, startDesktopPermissionsRefresh] =
		React.useTransition();
	const [activeDesktopPermissionId, setActiveDesktopPermissionId] =
		React.useState<DesktopPermissionId | null>(null);
	const [isCompletingDesktopPermissions, startDesktopPermissionsCompletion] =
		React.useTransition();
	const workspaceNameSeededForRef = React.useRef<string | null>(null);
	const [sharedNoteShareId, setSharedNoteShareId] = React.useState<
		string | null
	>(() => {
		if (typeof window === "undefined") {
			return null;
		}

		return getSharedNoteShareId(window.location.pathname);
	});
	const sharedNote = useQuery(
		api.notes.getShared,
		sharedNoteShareId
			? {
					shareId: sharedNoteShareId,
				}
			: "skip",
	);
	const workspaces = useQuery(
		api.workspaces.list,
		session?.user && isConvexAuthenticated ? {} : "skip",
	);
	const onboardingStatus = useQuery(
		api.onboarding.getStatus,
		session?.user && isConvexAuthenticated ? {} : "skip",
	);
	const createWorkspace = useMutation(api.workspaces.create);
	const markWelcomeCelebrationSeen = useMutation(
		api.onboarding.markWelcomeCelebrationSeen,
	);
	const markDesktopPermissionsCompleted = useMutation(
		api.onboarding.markDesktopPermissionsCompleted,
	);
	const isDesktopApp =
		typeof window !== "undefined" && Boolean(window.openGranDesktop);

	const applyDesktopMeta = React.useCallback((platform: DesktopPlatform) => {
		setIsDesktopMac(platform === "darwin");
		setDesktopPlatform(platform);
	}, []);

	const resetDesktopPermissionsState = React.useCallback(() => {
		setDesktopPermissionsError(null);
		setDesktopPermissionsStatus(null);
	}, []);

	const applyDesktopPermissionsError = React.useCallback((message: string) => {
		setDesktopPermissionsError(message);
	}, []);

	const applyDesktopPermissionsStatus = React.useCallback(
		(status: DesktopPermissionsStatus | null) => {
			setDesktopPermissionsStatus(status);
		},
		[],
	);

	const applyLegacyDesktopPermissionsFallback = React.useCallback(
		(platform: DesktopPlatform) => {
			applyDesktopPermissionsStatus({
				isDesktop: true,
				platform,
				permissions: [
					{
						id: "microphone",
						description:
							"During your meetings, OpenGran transcribes your microphone.",
						required: true,
						state: "unknown",
						canRequest: false,
						canOpenSystemSettings: false,
					},
					{
						id: "systemAudio",
						description:
							"During your meetings, OpenGran transcribes your system audio output.",
						required: false,
						state: "unknown",
						canRequest: false,
						canOpenSystemSettings: false,
					},
				],
			});
			applyDesktopPermissionsError(
				"Desktop permissions are unavailable because the Electron shell is still running an older build. Restart the desktop app, then try again.",
			);
		},
		[applyDesktopPermissionsError, applyDesktopPermissionsStatus],
	);

	React.useEffect(() => {
		void window.openGranDesktop
			?.getMeta()
			.then((meta) => {
				applyDesktopMeta(meta.platform);
			})
			.catch(() => {
				setIsDesktopMac(false);
			});
	}, [applyDesktopMeta]);

	React.useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const url = new URL(window.location.href);
		const authErrorParam = url.searchParams.get("authError");
		if (!authErrorParam) {
			return;
		}

		const authErrorDescription = url.searchParams.get("authErrorDescription");
		const message = authErrorDescription
			? `${authErrorParam}: ${authErrorDescription}`
			: authErrorParam.replaceAll("_", " ");

		setAuthError(message);
		url.searchParams.delete("authError");
		url.searchParams.delete("authErrorDescription");
		window.history.replaceState({}, "", url);
	}, []);

	React.useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const syncSharedNoteRoute = () => {
			setSharedNoteShareId(getSharedNoteShareId(window.location.pathname));
		};

		syncSharedNoteRoute();
		window.addEventListener("popstate", syncSharedNoteRoute);

		return () => {
			window.removeEventListener("popstate", syncSharedNoteRoute);
		};
	}, []);

	const syncDesktopPermissions = React.useCallback(async () => {
		if (!window.openGranDesktop) {
			applyDesktopPermissionsStatus(null);
			return null;
		}

		const status = await window.openGranDesktop.getPermissionsStatus();
		applyDesktopPermissionsStatus(status);
		return status;
	}, [applyDesktopPermissionsStatus]);

	const isAuthenticating = authenticatingProvider !== null;

	const handleSocialSignIn = React.useCallback(
		async (provider: SocialAuthProvider) => {
			if (authenticatingProvider) {
				return;
			}

			setAuthenticatingProvider(provider);

			try {
				setAuthError(null);
				const scopes =
					provider === "google" ? [...GOOGLE_CALENDAR_SCOPES] : undefined;
				const callbackURL = window.openGranDesktop
					? (await window.openGranDesktop.getAuthCallbackUrl()).url
					: window.location.href;

				await authClient.signIn.social({
					provider,
					callbackURL,
					errorCallbackURL: callbackURL,
					disableRedirect: Boolean(window.openGranDesktop),
					scopes,
				});
			} catch (error) {
				setAuthError(
					error instanceof Error
						? error.message
						: `${provider === "google" ? "Google" : "GitHub"} sign-in failed. Check your Better Auth setup.`,
				);
			} finally {
				setAuthenticatingProvider(null);
			}
		},
		[authenticatingProvider],
	);

	const handleGitHubSignIn = React.useCallback(() => {
		handleSocialSignIn("github");
	}, [handleSocialSignIn]);

	const handleGoogleSignIn = React.useCallback(() => {
		handleSocialSignIn("google");
	}, [handleSocialSignIn]);

	const handleOpenOwnedSharedNote = React.useCallback((noteId: Id<"notes">) => {
		setSharedNoteShareId(null);
		window.history.pushState(null, "", `/note?noteId=${noteId}`);
	}, []);

	React.useEffect(() => {
		const userEmail = session?.user?.email ?? null;
		const userName = session?.user?.name ?? null;

		if (!userEmail || !userName) {
			workspaceNameSeededForRef.current = null;
			return;
		}

		if (workspaceNameSeededForRef.current === userEmail) {
			return;
		}

		workspaceNameSeededForRef.current = userEmail;
		setWorkspaceName((currentName) =>
			currentName.trim() ? currentName : getSuggestedWorkspaceName(userName),
		);
	}, [session?.user?.email, session?.user?.name]);

	const handleCreateWorkspace = React.useCallback(() => {
		startWorkspaceCreation(async () => {
			try {
				setWorkspaceError(null);
				await createWorkspace({
					name: workspaceName,
				});
			} catch (error) {
				setWorkspaceError(
					error instanceof Error
						? error.message
						: "Failed to create workspace.",
				);
			}
		});
	}, [createWorkspace, workspaceName]);
	const handleContinueFromWelcomeCelebration = React.useCallback(() => {
		startWorkspaceCreation(async () => {
			try {
				await markWelcomeCelebrationSeen({});
			} catch (error) {
				setWorkspaceError(
					error instanceof Error
						? error.message
						: "Failed to continue onboarding.",
				);
			}
		});
	}, [markWelcomeCelebrationSeen]);

	const shouldLoadDesktopPermissions =
		isDesktopApp &&
		Boolean(session?.user) &&
		isConvexAuthenticated &&
		workspaces !== undefined &&
		workspaces.length > 0 &&
		onboardingStatus !== undefined &&
		!onboardingStatus.hasCompletedDesktopPermissions;

	React.useEffect(() => {
		if (!shouldLoadDesktopPermissions) {
			resetDesktopPermissionsState();
			return;
		}

		void syncDesktopPermissions().catch((error) => {
			if (isMissingDesktopPermissionHandlerError(error)) {
				applyLegacyDesktopPermissionsFallback(desktopPlatform);
				return;
			}

			applyDesktopPermissionsError(
				error instanceof Error
					? error.message
					: "Failed to load desktop permissions.",
			);
		});
	}, [
		applyDesktopPermissionsError,
		applyLegacyDesktopPermissionsFallback,
		desktopPlatform,
		resetDesktopPermissionsState,
		shouldLoadDesktopPermissions,
		syncDesktopPermissions,
	]);

	React.useEffect(() => {
		if (!shouldLoadDesktopPermissions) {
			return;
		}

		const refreshPermissions = () => {
			void syncDesktopPermissions().catch(() => {});
		};

		window.addEventListener("focus", refreshPermissions);

		return () => {
			window.removeEventListener("focus", refreshPermissions);
		};
	}, [shouldLoadDesktopPermissions, syncDesktopPermissions]);

	const handleRequestDesktopPermission = React.useCallback(
		(permissionId: DesktopPermissionId) => {
			setActiveDesktopPermissionId(permissionId);
			startDesktopPermissionsRefresh(async () => {
				try {
					setDesktopPermissionsError(null);

					if (!window.openGranDesktop) {
						throw new Error("Desktop permissions are unavailable.");
					}

					const status =
						await window.openGranDesktop.requestPermission(permissionId);
					setDesktopPermissionsStatus(status);
				} catch (error) {
					setDesktopPermissionsError(
						error instanceof Error
							? error.message
							: "Failed to request desktop permission.",
					);
				} finally {
					setActiveDesktopPermissionId(null);
				}
			});
		},
		[],
	);

	const handleOpenDesktopPermissionSettings = React.useCallback(
		(permissionId: DesktopPermissionId) => {
			setActiveDesktopPermissionId(permissionId);
			startDesktopPermissionsRefresh(async () => {
				try {
					setDesktopPermissionsError(null);

					if (!window.openGranDesktop) {
						throw new Error("Desktop permissions are unavailable.");
					}

					await window.openGranDesktop.openPermissionSettings(permissionId);
					await syncDesktopPermissions();
				} catch (error) {
					setDesktopPermissionsError(
						error instanceof Error
							? error.message
							: "Failed to open system settings.",
					);
				} finally {
					setActiveDesktopPermissionId(null);
				}
			});
		},
		[syncDesktopPermissions],
	);

	const handleCompleteDesktopPermissions = React.useCallback(() => {
		startDesktopPermissionsCompletion(async () => {
			try {
				setDesktopPermissionsError(null);
				await markDesktopPermissionsCompleted({});
			} catch (error) {
				setDesktopPermissionsError(
					error instanceof Error
						? error.message
						: "Failed to finish desktop onboarding.",
				);
			}
		});
	}, [markDesktopPermissionsCompleted]);

	const desktopPermissionRows: DesktopPermissionRow[] = (
		desktopPermissionsStatus?.permissions ?? []
	).map((permission) => ({
		...permission,
		label: DESKTOP_PERMISSION_LABELS[permission.id],
	}));
	const shouldShowDesktopPermissionsScreen =
		shouldLoadDesktopPermissions && desktopPermissionRows.length > 0;
	const requiredDesktopPermissionRows = desktopPermissionRows.filter(
		(permission) => permission.required,
	);
	const systemAudioPermissionRow = desktopPermissionRows.find(
		(permission) => permission.id === "systemAudio",
	);
	const areDesktopPermissionsReady =
		requiredDesktopPermissionRows.length > 0 &&
		requiredDesktopPermissionRows.every(
			(permission) => permission.state === "granted",
		) &&
		(!isDesktopMac ||
			!systemAudioPermissionRow ||
			systemAudioPermissionRow.state === "granted" ||
			systemAudioPermissionRow.state === "unsupported");

	return {
		activeDesktopPermissionId,
		areDesktopPermissionsReady,
		authError,
		authenticatingProvider,
		desktopPermissionRows,
		desktopPermissionsError,
		desktopPermissionsStatus,
		handleCompleteDesktopPermissions,
		handleContinueFromWelcomeCelebration,
		handleCreateWorkspace,
		handleGitHubSignIn,
		handleGoogleSignIn,
		handleOpenDesktopPermissionSettings,
		handleOpenOwnedSharedNote,
		handleRequestDesktopPermission,
		isAuthenticating,
		isCompletingDesktopPermissions,
		isConvexAuthenticated,
		isCreatingWorkspace,
		isDesktopMac,
		isRefreshingDesktopPermissions,
		isSessionPending,
		onboardingStatus,
		session,
		sharedNote,
		sharedNoteShareId,
		shouldLoadDesktopPermissions,
		shouldShowDesktopPermissionsScreen,
		workspaceError,
		workspaceName,
		workspaces,
		setWorkspaceName,
	};
};

function MainApp() {
	const controller = useAppBootstrapState();

	if (controller.sharedNoteShareId) {
		return (
			<SharedNotePage
				note={controller.sharedNote}
				onOpenNote={controller.handleOpenOwnedSharedNote}
			/>
		);
	}

	if (
		controller.isSessionPending ||
		(controller.session?.user && !controller.isConvexAuthenticated)
	) {
		return <AuthBootstrapScreen isDesktopMac={controller.isDesktopMac} />;
	}

	if (!controller.session?.user) {
		return (
			<AuthScreen
				error={controller.authError}
				isAuthenticating={controller.isAuthenticating}
				authenticatingProvider={controller.authenticatingProvider}
				isDesktopMac={controller.isDesktopMac}
				onGitHubSignIn={controller.handleGitHubSignIn}
				onGoogleSignIn={controller.handleGoogleSignIn}
			/>
		);
	}

	if (controller.workspaces === undefined) {
		return <AuthBootstrapScreen isDesktopMac={controller.isDesktopMac} />;
	}

	if (controller.onboardingStatus === undefined) {
		return <AuthBootstrapScreen isDesktopMac={controller.isDesktopMac} />;
	}

	if (controller.workspaces.length === 0) {
		if (!controller.onboardingStatus.hasSeenWelcomeCelebration) {
			return (
				<WelcomeCelebrationScreen
					isDesktopMac={controller.isDesktopMac}
					isSubmitting={controller.isCreatingWorkspace}
					onContinue={controller.handleContinueFromWelcomeCelebration}
				/>
			);
		}

		return (
			<WorkspaceOnboardingScreen
				error={controller.workspaceError}
				isDesktopMac={controller.isDesktopMac}
				isSubmitting={controller.isCreatingWorkspace}
				name={controller.workspaceName}
				onNameChange={controller.setWorkspaceName}
				onSubmit={controller.handleCreateWorkspace}
			/>
		);
	}

	if (
		controller.shouldLoadDesktopPermissions &&
		controller.desktopPermissionsStatus === null
	) {
		return <AuthBootstrapScreen isDesktopMac={controller.isDesktopMac} />;
	}

	if (controller.shouldShowDesktopPermissionsScreen) {
		return (
			<DesktopPermissionsOnboardingScreen
				error={controller.desktopPermissionsError}
				isDesktopMac={controller.isDesktopMac}
				activePermissionId={controller.activeDesktopPermissionId}
				isRefreshing={controller.isRefreshingDesktopPermissions}
				isSubmitting={controller.isCompletingDesktopPermissions}
				permissions={controller.desktopPermissionRows}
				canContinue={controller.areDesktopPermissionsReady}
				onContinue={controller.handleCompleteDesktopPermissions}
				onOpenSettings={controller.handleOpenDesktopPermissionSettings}
				onRequestPermission={controller.handleRequestDesktopPermission}
			/>
		);
	}

	return (
		<AppGate
			sharedNoteShareId={controller.sharedNoteShareId}
			sharedNote={controller.sharedNote}
			isSessionPending={controller.isSessionPending}
			session={controller.session}
			isConvexAuthenticated={controller.isConvexAuthenticated}
			authError={controller.authError}
			isAuthenticating={controller.isAuthenticating}
			authenticatingProvider={controller.authenticatingProvider}
			isDesktopMac={controller.isDesktopMac}
			onGitHubSignIn={controller.handleGitHubSignIn}
			onGoogleSignIn={controller.handleGoogleSignIn}
			workspaces={controller.workspaces}
			onboardingStatus={controller.onboardingStatus}
			isCreatingWorkspace={controller.isCreatingWorkspace}
			onContinueFromWelcomeCelebration={
				controller.handleContinueFromWelcomeCelebration
			}
			workspaceError={controller.workspaceError}
			workspaceName={controller.workspaceName}
			onWorkspaceNameChange={controller.setWorkspaceName}
			onCreateWorkspace={controller.handleCreateWorkspace}
			shouldLoadDesktopPermissions={controller.shouldLoadDesktopPermissions}
			desktopPermissionsStatus={controller.desktopPermissionsStatus}
			shouldShowDesktopPermissionsScreen={
				controller.shouldShowDesktopPermissionsScreen
			}
			desktopPermissionsError={controller.desktopPermissionsError}
			activeDesktopPermissionId={controller.activeDesktopPermissionId}
			isRefreshingDesktopPermissions={controller.isRefreshingDesktopPermissions}
			isCompletingDesktopPermissions={controller.isCompletingDesktopPermissions}
			desktopPermissionRows={controller.desktopPermissionRows}
			areDesktopPermissionsReady={controller.areDesktopPermissionsReady}
			onCompleteDesktopPermissions={controller.handleCompleteDesktopPermissions}
			onOpenDesktopPermissionSettings={
				controller.handleOpenDesktopPermissionSettings
			}
			onRequestDesktopPermission={controller.handleRequestDesktopPermission}
			onOpenOwnedSharedNote={controller.handleOpenOwnedSharedNote}
		/>
	);
}

function App() {
	return <MainApp />;
}

function AppGate({
	sharedNoteShareId,
	sharedNote,
	isSessionPending,
	session,
	isConvexAuthenticated,
	authError,
	isAuthenticating,
	authenticatingProvider,
	isDesktopMac,
	onGitHubSignIn,
	onGoogleSignIn,
	workspaces,
	onboardingStatus,
	isCreatingWorkspace,
	onContinueFromWelcomeCelebration,
	workspaceError,
	workspaceName,
	onWorkspaceNameChange,
	onCreateWorkspace,
	shouldLoadDesktopPermissions,
	desktopPermissionsStatus,
	shouldShowDesktopPermissionsScreen,
	desktopPermissionsError,
	activeDesktopPermissionId,
	isRefreshingDesktopPermissions,
	isCompletingDesktopPermissions,
	desktopPermissionRows,
	areDesktopPermissionsReady,
	onCompleteDesktopPermissions,
	onOpenDesktopPermissionSettings,
	onRequestDesktopPermission,
	onOpenOwnedSharedNote,
}: {
	sharedNoteShareId: string | null;
	sharedNote: Doc<"notes"> | null | undefined;
	isSessionPending: boolean;
	session: AuthSession | null | undefined;
	isConvexAuthenticated: boolean;
	authError: string | null;
	isAuthenticating: boolean;
	authenticatingProvider: SocialAuthProvider | null;
	isDesktopMac: boolean;
	onGitHubSignIn: () => void;
	onGoogleSignIn: () => void;
	workspaces: Array<WorkspaceRecord> | undefined;
	onboardingStatus:
		| {
				hasSeenWelcomeCelebration: boolean;
				hasCompletedDesktopPermissions: boolean;
		  }
		| null
		| undefined;
	isCreatingWorkspace: boolean;
	onContinueFromWelcomeCelebration: () => void;
	workspaceError: string | null;
	workspaceName: string;
	onWorkspaceNameChange: (value: string) => void;
	onCreateWorkspace: () => void;
	shouldLoadDesktopPermissions: boolean;
	desktopPermissionsStatus: DesktopPermissionsStatus | null;
	shouldShowDesktopPermissionsScreen: boolean;
	desktopPermissionsError: string | null;
	activeDesktopPermissionId: DesktopPermissionId | null;
	isRefreshingDesktopPermissions: boolean;
	isCompletingDesktopPermissions: boolean;
	desktopPermissionRows: DesktopPermissionRow[];
	areDesktopPermissionsReady: boolean;
	onCompleteDesktopPermissions: () => void;
	onOpenDesktopPermissionSettings: (permissionId: DesktopPermissionId) => void;
	onRequestDesktopPermission: (permissionId: DesktopPermissionId) => void;
	onOpenOwnedSharedNote: (noteId: Id<"notes">) => void;
}) {
	if (sharedNoteShareId) {
		return (
			<SharedNotePage note={sharedNote} onOpenNote={onOpenOwnedSharedNote} />
		);
	}

	if (isSessionPending || (session?.user && !isConvexAuthenticated)) {
		return <AuthBootstrapScreen isDesktopMac={isDesktopMac} />;
	}

	if (!session?.user) {
		return (
			<AuthScreen
				error={authError}
				isAuthenticating={isAuthenticating}
				authenticatingProvider={authenticatingProvider}
				isDesktopMac={isDesktopMac}
				onGitHubSignIn={onGitHubSignIn}
				onGoogleSignIn={onGoogleSignIn}
			/>
		);
	}

	if (workspaces === undefined || onboardingStatus == null) {
		return <AuthBootstrapScreen isDesktopMac={isDesktopMac} />;
	}

	if (workspaces.length === 0) {
		if (!onboardingStatus.hasSeenWelcomeCelebration) {
			return (
				<WelcomeCelebrationScreen
					isDesktopMac={isDesktopMac}
					isSubmitting={isCreatingWorkspace}
					onContinue={onContinueFromWelcomeCelebration}
				/>
			);
		}

		return (
			<WorkspaceOnboardingScreen
				error={workspaceError}
				isDesktopMac={isDesktopMac}
				isSubmitting={isCreatingWorkspace}
				name={workspaceName}
				onNameChange={onWorkspaceNameChange}
				onSubmit={onCreateWorkspace}
			/>
		);
	}

	if (shouldLoadDesktopPermissions && desktopPermissionsStatus === null) {
		return <AuthBootstrapScreen isDesktopMac={isDesktopMac} />;
	}

	if (shouldShowDesktopPermissionsScreen) {
		return (
			<DesktopPermissionsOnboardingScreen
				error={desktopPermissionsError}
				isDesktopMac={isDesktopMac}
				activePermissionId={activeDesktopPermissionId}
				isRefreshing={isRefreshingDesktopPermissions}
				isSubmitting={isCompletingDesktopPermissions}
				permissions={desktopPermissionRows}
				canContinue={areDesktopPermissionsReady}
				onContinue={onCompleteDesktopPermissions}
				onOpenSettings={onOpenDesktopPermissionSettings}
				onRequestPermission={onRequestDesktopPermission}
			/>
		);
	}

	return (
		<AppShell
			session={session}
			workspaces={workspaces}
			initialDesktopMac={isDesktopMac}
		/>
	);
}

function OnboardingStepBrand() {
	return (
		<div className="flex items-center gap-2 self-center font-medium">
			<div className="flex size-6 items-center justify-center rounded-md border bg-card text-foreground">
				<OpenGranMark className="size-4" />
			</div>
			OpenGran
		</div>
	);
}

function OnboardingStepLayout({
	background,
	children,
	className,
	contentClassName,
	isDesktopMac,
}: React.PropsWithChildren<{
	background?: React.ReactNode;
	className?: string;
	contentClassName?: string;
	isDesktopMac: boolean;
}>) {
	return (
		<div
			data-app-region={isDesktopMac ? "drag" : undefined}
			className={cn(
				"flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10",
				isDesktopMac && DESKTOP_AUTH_SAFE_TOP_CLASS,
				className,
			)}
		>
			{background}
			<div
				data-app-region={isDesktopMac ? "no-drag" : undefined}
				className={cn("flex w-full max-w-sm flex-col gap-6", contentClassName)}
			>
				<OnboardingStepBrand />
				{children}
			</div>
		</div>
	);
}

function OnboardingStepCard({
	children,
	contentClassName,
	description,
	title,
}: React.PropsWithChildren<{
	contentClassName?: string;
	description: React.ReactNode;
	title: React.ReactNode;
}>) {
	return (
		<Card>
			<CardHeader className="text-center">
				<CardTitle className="text-xl">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className={contentClassName}>{children}</CardContent>
		</Card>
	);
}

function WelcomeCelebrationScreen({
	isDesktopMac,
	isSubmitting,
	onContinue,
}: {
	isDesktopMac: boolean;
	isSubmitting: boolean;
	onContinue: () => void;
}) {
	const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

	React.useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return;
		}

		let isCancelled = false;
		let cleanupFireworks: (() => void) | undefined;
		let timeoutId: number | undefined;

		const launchFireworks = async () => {
			const { default: confetti } = await import("canvas-confetti");

			if (isCancelled) {
				return;
			}

			const fire = confetti.create(canvas, {
				resize: true,
				useWorker: true,
			});
			const endTime = Date.now() + 500;

			const burst = () => {
				if (isCancelled) {
					return;
				}

				const originY = 0.15 + Math.random() * 0.25;
				fire({
					angle: 60,
					colors: getThemeFireworkColors(),
					disableForReducedMotion: true,
					gravity: 0.95,
					origin: { x: 0.1 + Math.random() * 0.25, y: originY },
					particleCount: 20,
					scalar: 1.05,
					spread: 55,
					startVelocity: 52,
				});
				fire({
					angle: 120,
					colors: getThemeFireworkColors(),
					disableForReducedMotion: true,
					gravity: 0.95,
					origin: { x: 0.65 + Math.random() * 0.2, y: originY + 0.05 },
					particleCount: 20,
					scalar: 1.05,
					spread: 55,
					startVelocity: 52,
				});
				fire({
					colors: getThemeFireworkColors(),
					disableForReducedMotion: true,
					gravity: 1.1,
					origin: { x: 0.35 + Math.random() * 0.3, y: originY - 0.05 },
					particleCount: 28,
					scalar: 0.9,
					spread: 90,
					startVelocity: 38,
				});

				if (Date.now() >= endTime) {
					return;
				}

				timeoutId = window.setTimeout(burst, 260 + Math.random() * 180);
			};

			burst();
			cleanupFireworks = () => {
				fire.reset();
			};
		};

		void launchFireworks();

		return () => {
			isCancelled = true;
			if (timeoutId !== undefined) {
				window.clearTimeout(timeoutId);
			}
			cleanupFireworks?.();
		};
	}, []);

	return (
		<OnboardingStepLayout
			isDesktopMac={isDesktopMac}
			className="relative overflow-hidden"
			contentClassName="relative z-10"
			background={
				<canvas ref={canvasRef} className="onboarding-confetti-canvas" />
			}
		>
			<OnboardingStepCard
				title="You&apos;re in"
				description="Your account is ready. Let&apos;s set up your first workspace."
			>
				<Button className="w-full" onClick={onContinue} disabled={isSubmitting}>
					{isSubmitting ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : null}
					Set up workspace
				</Button>
			</OnboardingStepCard>
		</OnboardingStepLayout>
	);
}

function AuthBootstrapScreen({ isDesktopMac }: { isDesktopMac: boolean }) {
	return (
		<div
			data-app-region={isDesktopMac ? "drag" : undefined}
			className={cn(
				"min-h-svh bg-background",
				isDesktopMac && DESKTOP_AUTH_SAFE_TOP_CLASS,
			)}
		/>
	);
}

const getDesktopPermissionTone = (state: DesktopPermissionState) => {
	if (state === "granted") {
		return "border-transparent bg-muted text-foreground";
	}

	return "border-border bg-muted/40 text-muted-foreground";
};

const getDesktopPermissionIcon = (permissionId: DesktopPermissionId) =>
	permissionId === "microphone" ? Mic : Volume2;

const getDesktopPermissionActionLabel = (permissionId: DesktopPermissionId) =>
	DESKTOP_PERMISSION_BUTTON_LABELS[permissionId];

const getDesktopPermissionStateLabel = (permission: DesktopPermissionRow) => {
	if (permission.state === "granted") {
		return permission.id === "systemAudio" && !permission.canRequest
			? "Ready"
			: "Enabled";
	}

	if (permission.state === "unsupported") {
		return "Unavailable";
	}

	if (permission.state === "blocked") {
		return "Blocked";
	}

	if (permission.state === "prompt") {
		return "Needs access";
	}

	return "Unknown";
};

function DesktopPermissionsOnboardingScreen({
	error,
	isDesktopMac,
	activePermissionId,
	isRefreshing,
	isSubmitting,
	permissions,
	canContinue,
	onContinue,
	onOpenSettings,
	onRequestPermission,
}: {
	error: string | null;
	isDesktopMac: boolean;
	activePermissionId: DesktopPermissionId | null;
	isRefreshing: boolean;
	isSubmitting: boolean;
	permissions: DesktopPermissionRow[];
	canContinue: boolean;
	onContinue: () => void;
	onOpenSettings: (permissionId: DesktopPermissionId) => void;
	onRequestPermission: (permissionId: DesktopPermissionId) => void;
}) {
	if (permissions.length === 0) {
		return null;
	}

	const isMicrophoneGranted = permissions.some(
		(permission) =>
			permission.id === "microphone" && permission.state === "granted",
	);

	return (
		<OnboardingStepLayout isDesktopMac={isDesktopMac}>
			<OnboardingStepCard
				title="Transcription permissions"
				description="When you turn it on, OpenGran transcribes meetings using your computer's audio."
				contentClassName="flex flex-col gap-5"
			>
				<div>
					{permissions.map((permission) => {
						const Icon = getDesktopPermissionIcon(permission.id);
						const isRequestBlockedByDependency =
							permission.id === "systemAudio" && !isMicrophoneGranted;
						const isActionPending =
							isRefreshing && activePermissionId === permission.id;

						return (
							<React.Fragment key={permission.id}>
								<div className="flex items-center gap-3 p-4">
									<div
										className={cn(
											"flex size-10 shrink-0 items-center justify-center rounded-full border",
											getDesktopPermissionTone(permission.state),
										)}
									>
										<Icon className="size-4" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="font-medium whitespace-nowrap">
											{permission.label}
										</p>
									</div>
									{permission.state === "granted" ? (
										<div className="inline-flex size-9 items-center justify-center rounded-full border border-border/70">
											<Check className="size-4" />
										</div>
									) : permission.canRequest ? (
										<Button
											type="button"
											size="sm"
											className="shrink-0 rounded-full px-4 whitespace-nowrap"
											onClick={() => onRequestPermission(permission.id)}
											disabled={
												isRefreshing ||
												isSubmitting ||
												isRequestBlockedByDependency
											}
										>
											{isActionPending ? (
												<LoaderCircle className="size-4 animate-spin" />
											) : (
												<Icon className="size-4" />
											)}
											{getDesktopPermissionActionLabel(permission.id)}
										</Button>
									) : permission.canOpenSystemSettings ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="shrink-0 rounded-full px-4 whitespace-nowrap"
											onClick={() => onOpenSettings(permission.id)}
											disabled={isRefreshing || isSubmitting}
										>
											{isActionPending ? (
												<LoaderCircle className="size-4 animate-spin" />
											) : (
												<ExternalLink className="size-4" />
											)}
											Open settings
										</Button>
									) : (
										<div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
											<TriangleAlert className="size-4" />
											{getDesktopPermissionStateLabel(permission)}
										</div>
									)}
								</div>
							</React.Fragment>
						);
					})}
				</div>
				{error ? (
					<div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
						<TriangleAlert className="mt-0.5 size-4 shrink-0" />
						<p>{error}</p>
					</div>
				) : null}
				<Button
					type="button"
					onClick={onContinue}
					className="w-full"
					disabled={!canContinue || isSubmitting}
				>
					Continue
				</Button>
			</OnboardingStepCard>
		</OnboardingStepLayout>
	);
}

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
			const nextInboxOpen = nextLocationState.view === "inbox";
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

	const openFreshChat = React.useCallback(() => {
		setInboxOpen(false);
		setCurrentView("chat");
		setSettingsOpen(false);
		setCurrentChatId(null);
		setChatComposerId(crypto.randomUUID());
		window.history.pushState(null, "", "/chat");
	}, []);

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

			setInboxOpen(false);
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
		[openFreshChat, resolvedCurrentNoteId],
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
			setInboxOpen(false);
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
		[],
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
		resolvedCurrentNoteId,
		resolvedCurrentView,
		scheduledAutoStartNoteCaptureAt,
		shouldAutoStartNoteCapture,
		clearScheduledAutoStart,
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
	const handleOpenChat = React.useCallback((chatId: string) => {
		setInboxOpen(false);
		setCurrentView("chat");
		setSettingsOpen(false);
		setCurrentChatId(chatId);
		setChatComposerId(chatId);
		window.history.pushState(
			null,
			"",
			`/chat?chatId=${encodeURIComponent(chatId)}`,
		);
	}, []);

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
		chats,
		chatComposerId,
		currentChatId,
		currentChatTitle,
		currentDate,
		currentDayOfMonth,
		currentMonthLabel,
		currentNoteEditorActions,
		currentNoteCommentsOpener,
		currentNoteId: resolvedCurrentNoteId,
		currentNoteTitle,
		currentView: resolvedCurrentView,
		currentWeekdayLabel,
		inboxOpen,
		handleAutoStartNoteCaptureHandled,
		handleChatPersisted,
		handleChatRemoved,
		handleCreateNote,
		handleCreateNoteFromChatResponse,
		handleQuickNote,
		handleNewChat,
		handleNoteTrashed,
		handleInboxOpenChange,
		handleOpenCalendarEventNote,
		handleOpenCalendarSettings,
		handleOpenChat,
		handleSettingsOpenChange,
		handleSignOut,
		handleViewChange,
		initialChatMessages,
		isDesktopMac,
		isLoadingUpcomingCalendarEvents,
		isSharedNote,
		isSigningOut,
		notes,
		openNote,
		selectedNote: resolvedSelectedNote,
		settingsOpen,
		settingsPage,
		setActiveWorkspaceId,
		setCurrentNoteEditorActions,
		setCurrentNoteCommentsOpener,
		setCurrentNoteTitle,
		shouldAutoStartNoteCapture,
		shouldStopNoteCaptureWhenMeetingEnds,
		sharedNotes,
		upcomingCalendarEvents,
		upcomingCalendarStatus,
		user,
		workspaces,
		isResolvingCurrentNoteRoute: isResolvingCurrentNote,
		currentNoteTemplateSlug: resolvedSelectedNote?.templateSlug ?? null,
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
		handleWorkspaceCreate,
	};
};

function AppShell({
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
						activeWorkspace={
							controller.workspaces.find(
								(workspace) => workspace._id === controller.activeWorkspaceId,
							) ?? null
						}
						onChatPersisted={controller.handleChatPersisted}
						onOpenChat={controller.handleOpenChat}
						onChatRemoved={controller.handleChatRemoved}
						onOpenConnectionsSettings={() =>
							controller.handleSettingsOpenChange(true, "Connections")
						}
						onCreateNoteFromChatResponse={
							controller.handleCreateNoteFromChatResponse
						}
						onNoteTitleChange={controller.setCurrentNoteTitle}
						onNoteEditorActionsChange={controller.setCurrentNoteEditorActions}
						onNoteCommentsOpenChange={(opener) => {
							controller.setCurrentNoteCommentsOpener(() => opener);
						}}
						onAutoStartNoteCaptureHandled={
							controller.handleAutoStartNoteCaptureHandled
						}
						shouldAutoStartNoteCapture={controller.shouldAutoStartNoteCapture}
						shouldStopNoteCaptureWhenMeetingEnds={
							controller.shouldStopNoteCaptureWhenMeetingEnds
						}
						onGoHome={() => controller.handleViewChange("home")}
					/>
				</AppShellInset>
			</SidebarProvider>
		</ActiveWorkspaceProvider>
	);
}

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
	const {
		leftInsetPanelWidth,
		leftOverlayPanelWidth,
		state: sidebarState,
	} = useSidebar();
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

function AppShellContent({
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
				<NotePage
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
			</ScrollArea>
		);
	}

	return (
		<ChatPage
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
	);
}

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

function HomeView({
	currentDate,
	currentDayOfMonth,
	currentMonthLabel,
	currentWeekdayLabel,
	upcomingCalendarEvents,
	upcomingCalendarStatus,
	isLoadingUpcomingCalendarEvents,
	notes,
	currentNoteId,
	currentNoteTitle,
	currentUser,
	onOpenNote,
	onNoteTrashed,
	onCreateNote,
	onOpenCalendarEventNote,
	onOpenCalendarSettings,
}: {
	currentDate: Date;
	currentDayOfMonth: number;
	currentMonthLabel: string;
	currentWeekdayLabel: string;
	upcomingCalendarEvents: UpcomingCalendarEvent[];
	upcomingCalendarStatus: "idle" | "ready" | "not_connected" | "error";
	isLoadingUpcomingCalendarEvents: boolean;
	notes: Array<Doc<"notes">> | undefined;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle: string;
	currentUser: AppUser;
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
}) {
	const visibleUpcomingEvents = upcomingCalendarEvents
		.filter((event) => event.isMeeting)
		.filter((event) => isUpcomingEventToday(event, currentDate))
		.slice(0, 5);
	const shouldShowUpcomingCalendarSkeleton =
		isLoadingUpcomingCalendarEvents &&
		upcomingCalendarStatus === "idle" &&
		visibleUpcomingEvents.length === 0;
	const hasLiveUpcomingMeeting = visibleUpcomingEvents.some((event) =>
		isUpcomingEventLive(event, currentDate),
	);
	const upcomingCalendarIndicator = getUpcomingCalendarIndicator({
		hasLiveMeeting: hasLiveUpcomingMeeting,
		status: upcomingCalendarStatus,
	});

	const openMeetingLink = React.useCallback(async (url: string) => {
		if (window.openGranDesktop) {
			await window.openGranDesktop.openExternalUrl(url);
			return;
		}

		window.open(url, "_blank", "noopener,noreferrer");
	}, []);
	const hasUpcomingEventStarted = React.useCallback(
		(event: UpcomingCalendarEvent) =>
			new Date(event.startAt).getTime() <= currentDate.getTime(),
		[currentDate],
	);

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-col gap-6 pt-2 md:pt-4">
				<section className="mx-auto w-full max-w-xl space-y-6">
					<h1 className="text-lg md:text-xl">Coming up</h1>
					<Card className="overflow-hidden rounded-lg border-border py-0 shadow-sm">
						<CardContent className="p-0">
							<div className="grid min-h-[152px] md:grid-cols-[184px_minmax(0,1fr)]">
								<div className="flex items-start border-b border-border/60 px-5 py-4 md:border-b-0 md:border-r">
									<div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
										<div className="row-span-2 text-5xl leading-none tracking-tight tabular-nums">
											{currentDayOfMonth}
										</div>
										<div className="flex min-w-0 items-center gap-2 pt-1 text-base leading-none">
											<span>{currentMonthLabel}</span>
											<span
												role="status"
												aria-label={`Calendar status: ${upcomingCalendarIndicator.label}`}
												className="inline-flex"
											>
												<span
													className={cn(
														"size-2 rounded-full",
														upcomingCalendarIndicator.dotClassName,
													)}
												/>
											</span>
										</div>
										<p className="text-base leading-none text-muted-foreground">
											{currentWeekdayLabel}
										</p>
									</div>
								</div>
								<div className="flex min-h-[152px] w-full items-start justify-center p-3">
									{shouldShowUpcomingCalendarSkeleton ? (
										<Empty className="h-full rounded-none border-0 px-4 py-4">
											<EmptyHeader>
												<Skeleton className="mb-2 size-8 rounded-lg" />
												<Skeleton className="h-5 w-40 max-w-full" />
												<Skeleton className="h-4 w-56 max-w-full" />
											</EmptyHeader>
											<EmptyContent>
												<Skeleton className="h-9 w-36 rounded-md" />
											</EmptyContent>
										</Empty>
									) : visibleUpcomingEvents.length > 0 ? (
										<div className="w-full px-1 py-1">
											<div className="space-y-1.5">
												{visibleUpcomingEvents.map((event) => {
													const isLive = isUpcomingEventLive(
														event,
														currentDate,
													);
													const hasStarted = hasUpcomingEventStarted(event);

													return (
														<div
															key={`${event.id}:${event.startAt}`}
															className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/40"
														>
															<div
																className={cn(
																	"h-8 w-1 shrink-0 rounded-full bg-status-planned",
																	isLive && "bg-status-live",
																)}
															/>
															<div className="min-w-0 flex-1">
																<div className="flex items-center justify-between gap-4">
																	<div className="min-w-0">
																		<p className="truncate text-sm font-medium text-foreground">
																			{event.title}
																		</p>
																		<p
																			className={cn(
																				"mt-0.5 text-xs text-muted-foreground",
																				isLive && "text-status-live",
																			)}
																		>
																			{formatUpcomingEventMeta(
																				event,
																				currentDate,
																			)}
																		</p>
																	</div>
																	<Button
																		type="button"
																		variant="default"
																		size="sm"
																		className="shrink-0"
																		onClick={() => {
																			void onOpenCalendarEventNote(event, {
																				autoStartCapture: hasStarted,
																				stopCaptureWhenMeetingEnds: true,
																			});
																			if (event.meetingUrl) {
																				void openMeetingLink(event.meetingUrl);
																			}
																		}}
																	>
																		{event.meetingUrl
																			? "Start now"
																			: "Open note"}
																	</Button>
																</div>
															</div>
														</div>
													);
												})}
											</div>
										</div>
									) : (
										<Empty className="h-full rounded-none border-0 px-4 py-4">
											<EmptyHeader>
												<EmptyMedia variant="icon">
													<CalendarClock className="size-4" />
												</EmptyMedia>
												<EmptyTitle>
													{upcomingCalendarStatus === "not_connected"
														? "Connect a calendar"
														: upcomingCalendarStatus === "error"
															? "Couldn’t load calendar"
															: "No upcoming events today"}
												</EmptyTitle>
												<EmptyDescription>
													{upcomingCalendarStatus === "not_connected"
														? "Link your calendar in settings to see upcoming meetings."
														: upcomingCalendarStatus === "error"
															? "Try reconnecting your calendars or refresh the app."
															: "Check your visible calendars for today"}
												</EmptyDescription>
											</EmptyHeader>
											<EmptyContent>
												<Button
													variant="outline"
													onClick={onOpenCalendarSettings}
												>
													Calendar settings
												</Button>
											</EmptyContent>
										</Empty>
									)}
								</div>
							</div>
						</CardContent>
					</Card>
				</section>

				<section className="flex justify-center py-8">
					{notes === undefined ? (
						<HomeNotesSkeleton />
					) : notes.length > 0 ? (
						<HomeNotesList
							notes={notes}
							activeNoteId={currentNoteId}
							activeNoteTitle={currentNoteTitle}
							currentUser={currentUser}
							onOpenNote={onOpenNote}
							onNoteTrashed={onNoteTrashed}
						/>
					) : (
						<Empty className="max-w-xl">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FileText className="size-4" />
								</EmptyMedia>
								<EmptyTitle>Take your first note</EmptyTitle>
								<EmptyDescription>
									Your meeting notes will appear here
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button onClick={onCreateNote}>Quick note</Button>
							</EmptyContent>
						</Empty>
					)}
				</section>
			</div>
		</div>
	);
}

function SharedView({
	sharedNotes,
	currentNoteId,
	currentNoteTitle,
	currentUser,
	onOpenNote,
	onNoteTrashed,
}: {
	sharedNotes: Array<Doc<"notes">> | undefined;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle: string;
	currentUser: AppUser;
	onOpenNote: (noteId: Id<"notes">) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
}) {
	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-col gap-6 pt-2 md:pt-4">
				<section className="mx-auto w-full max-w-xl space-y-6">
					<h1 className="text-lg md:text-xl">Shared with others</h1>
					<Card className="overflow-hidden rounded-lg border-border py-0 shadow-sm">
						<CardContent className="flex items-start justify-between gap-4 p-5">
							<div>
								<p className="text-5xl leading-none tracking-tight tabular-nums">
									{sharedNotes?.length ?? 0}
								</p>
							</div>
						</CardContent>
					</Card>
				</section>
				<section className="flex justify-center py-4">
					{sharedNotes === undefined ? (
						<SharedNotesSkeleton />
					) : sharedNotes.length > 0 ? (
						<div className="w-full max-w-xl">
							<SharedNotesList
								notes={sharedNotes}
								activeNoteId={currentNoteId}
								activeNoteTitle={currentNoteTitle}
								currentUser={currentUser}
								onOpenNote={onOpenNote}
								onNoteTrashed={onNoteTrashed}
							/>
						</div>
					) : (
						<Empty className="max-w-xl">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FileText className="size-4" />
								</EmptyMedia>
								<EmptyTitle>No shared notes yet</EmptyTitle>
								<EmptyDescription>
									Share a note with someone else
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					)}
				</section>
			</div>
		</div>
	);
}

function WorkspaceOnboardingScreen({
	error,
	isDesktopMac,
	isSubmitting,
	name,
	onNameChange,
	onSubmit,
}: {
	error: string | null;
	isDesktopMac: boolean;
	isSubmitting: boolean;
	name: string;
	onNameChange: (value: string) => void;
	onSubmit: () => void;
}) {
	return (
		<OnboardingStepLayout isDesktopMac={isDesktopMac}>
			<OnboardingStepCard
				title="Create workspace"
				description="Set up your first workspace to continue."
			>
				<form>
					<div className="flex flex-col gap-5">
						<WorkspaceComposer
							name={name}
							onNameChange={onNameChange}
							error={error}
							nameInputId="onboarding-workspace-name"
						/>
						<Field>
							<Button
								className="w-full"
								onClick={onSubmit}
								disabled={isSubmitting || name.trim().length < 2}
							>
								Continue
							</Button>
						</Field>
					</div>
				</form>
			</OnboardingStepCard>
		</OnboardingStepLayout>
	);
}

function HomeNotesSkeleton() {
	return (
		<div className="w-full max-w-xl space-y-3">
			<div className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-foreground/70">
				Today
			</div>
			<div className="space-y-2">
				{HOME_NOTE_SKELETON_IDS.map((id) => (
					<div key={id} className="flex items-center gap-3 rounded-lg p-1">
						<Skeleton className="size-8 rounded-lg" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function SharedNotesSkeleton() {
	return (
		<div className="w-full max-w-xl space-y-3">
			<div className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-foreground/70">
				Today
			</div>
			<div className="space-y-2">
				{HOME_NOTE_SKELETON_IDS.map((id) => (
					<div key={id} className="flex items-center gap-3 rounded-lg p-1">
						<Skeleton className="size-8 rounded-lg" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-48" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function SharedNotesList({
	notes,
	activeNoteId,
	activeNoteTitle,
	currentUser,
	onOpenNote,
	onNoteTrashed,
}: {
	notes: Array<Doc<"notes">>;
	activeNoteId: Id<"notes"> | null;
	activeNoteTitle: string;
	currentUser: AppUser;
	onOpenNote: (noteId: Id<"notes">) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
}) {
	const groupedNotes = groupItemsByDate(notes);
	const sections = [
		{ key: "today", label: "Today", notes: groupedNotes.today },
		{ key: "yesterday", label: "Yesterday", notes: groupedNotes.yesterday },
		{ key: "lastWeek", label: "Last 7 days", notes: groupedNotes.lastWeek },
		{
			key: "lastMonth",
			label: "Last 30 days",
			notes: groupedNotes.lastMonth,
		},
		{ key: "older", label: "Older", notes: groupedNotes.older },
	] as const;

	return (
		<div className="w-full max-w-xl space-y-1">
			{sections.map((section) => {
				if (section.notes.length === 0) {
					return null;
				}

				return (
					<div key={section.key} className="space-y-2">
						<div className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-foreground/70">
							{section.label}
						</div>
						<div className="space-y-2">
							{section.notes.map((note) => {
								const isActive = note._id === activeNoteId;
								const title = getNoteDisplayTitle(
									isActive && activeNoteTitle.trim()
										? activeNoteTitle
										: note.title,
								);
								const authorDisplayName = getNoteAuthorDisplayName(
									note,
									currentUser,
								);
								const createdTime = formatNoteCreatedTime(note);

								return (
									<div
										key={note._id}
										className={cn(
											"group flex items-center rounded-lg p-1 transition-colors hover:bg-card/50 has-[[data-note-actions]:focus-visible]:bg-transparent has-[[data-note-actions]:hover]:bg-transparent",
											isActive ? "bg-transparent" : "bg-transparent",
										)}
									>
										<button
											type="button"
											onClick={() => onOpenNote(note._id)}
											className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1 text-left"
										>
											<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
												<FileText className="size-4" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium">
													{title}
												</div>
												<div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
													<span className="truncate">{authorDisplayName}</span>
													<span aria-hidden="true">·</span>
													<time
														dateTime={new Date(note.createdAt).toISOString()}
														className="shrink-0 tabular-nums"
													>
														{createdTime}
													</time>
												</div>
											</div>
										</button>
										<NoteActionsMenu
											noteId={note._id}
											onMoveToTrash={onNoteTrashed}
											align="end"
										>
											<button
												type="button"
												data-note-actions
												className="flex aspect-square size-5 cursor-pointer items-center justify-center rounded-md p-0 text-muted-foreground opacity-0 outline-hidden transition-[color,opacity] group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
												aria-label={`Open actions for ${title}`}
												onClick={(event) => event.stopPropagation()}
											>
												<MoreHorizontal className="size-4" />
											</button>
										</NoteActionsMenu>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function HomeNotesList({
	notes,
	activeNoteId,
	activeNoteTitle,
	currentUser,
	onOpenNote,
	onNoteTrashed,
}: {
	notes: Array<Doc<"notes">>;
	activeNoteId: Id<"notes"> | null;
	activeNoteTitle: string;
	currentUser: AppUser;
	onOpenNote: (noteId: Id<"notes">) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
}) {
	const groupedNotes = groupItemsByDate(notes);
	const sections = [
		{ key: "today", label: "Today", notes: groupedNotes.today },
		{ key: "yesterday", label: "Yesterday", notes: groupedNotes.yesterday },
		{ key: "lastWeek", label: "Last 7 days", notes: groupedNotes.lastWeek },
		{
			key: "lastMonth",
			label: "Last 30 days",
			notes: groupedNotes.lastMonth,
		},
		{ key: "older", label: "Older", notes: groupedNotes.older },
	] as const;

	return (
		<div className="w-full max-w-xl space-y-1">
			{sections.map((section) => {
				if (section.notes.length === 0) {
					return null;
				}

				return (
					<div key={section.key} className="space-y-2">
						<div className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-foreground/70">
							{section.label}
						</div>
						<div className="space-y-2">
							{section.notes.map((note) => {
								const isActive = note._id === activeNoteId;
								const title = getNoteDisplayTitle(
									isActive && activeNoteTitle.trim()
										? activeNoteTitle
										: note.title,
								);
								const authorDisplayName = getNoteAuthorDisplayName(
									note,
									currentUser,
								);
								const createdTime = formatNoteCreatedTime(note);

								return (
									<div
										key={note._id}
										className={cn(
											"group flex items-center rounded-lg p-1 transition-colors hover:bg-card/50 has-[[data-note-actions]:focus-visible]:bg-transparent has-[[data-note-actions]:hover]:bg-transparent",
											isActive ? "bg-transparent" : "bg-transparent",
										)}
									>
										<button
											type="button"
											onClick={() => onOpenNote(note._id)}
											className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1 text-left"
										>
											<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
												<FileText className="size-4" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate text-sm font-medium">
													{title}
												</div>
												<div className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
													<span className="truncate">{authorDisplayName}</span>
													<span aria-hidden="true">·</span>
													<time
														dateTime={new Date(note.createdAt).toISOString()}
														className="shrink-0 tabular-nums"
													>
														{createdTime}
													</time>
												</div>
											</div>
										</button>
										<NoteActionsMenu
											noteId={note._id}
											onMoveToTrash={onNoteTrashed}
											align="end"
										>
											<button
												type="button"
												data-note-actions
												className="flex aspect-square size-5 cursor-pointer items-center justify-center rounded-md p-0 text-muted-foreground opacity-0 outline-hidden transition-[color,opacity] group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
												aria-label={`Open actions for ${title}`}
												onClick={(event) => event.stopPropagation()}
											>
												<MoreHorizontal className="size-4" />
											</button>
										</NoteActionsMenu>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
		</div>
	);
}

function AuthScreen({
	error,
	isAuthenticating,
	authenticatingProvider,
	isDesktopMac,
	onGitHubSignIn,
	onGoogleSignIn,
}: {
	error: string | null;
	isAuthenticating: boolean;
	authenticatingProvider: SocialAuthProvider | null;
	isDesktopMac: boolean;
	onGitHubSignIn: () => void;
	onGoogleSignIn: () => void;
}) {
	return (
		<div
			data-app-region={isDesktopMac ? "drag" : undefined}
			className={cn(
				"flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10",
				isDesktopMac && DESKTOP_AUTH_SAFE_TOP_CLASS,
			)}
		>
			<LoginForm
				error={error}
				isAuthenticating={isAuthenticating}
				authenticatingProvider={authenticatingProvider}
				isDesktopMac={isDesktopMac}
				onGitHubSignIn={onGitHubSignIn}
				onGoogleSignIn={onGoogleSignIn}
			/>
		</div>
	);
}

function LoginForm({
	className,
	error,
	isAuthenticating,
	authenticatingProvider,
	isDesktopMac,
	onGitHubSignIn,
	onGoogleSignIn,
	...props
}: React.ComponentProps<"div"> & {
	error: string | null;
	isAuthenticating: boolean;
	authenticatingProvider: SocialAuthProvider | null;
	isDesktopMac: boolean;
	onGitHubSignIn: () => void;
	onGoogleSignIn: () => void;
}) {
	const [hasAcceptedTerms, setHasAcceptedTerms] = React.useState(false);

	return (
		<div
			data-app-region={isDesktopMac ? "no-drag" : undefined}
			className={cn("flex w-full max-w-sm flex-col gap-6", className)}
			{...props}
		>
			<div className="flex items-center gap-2 self-center font-medium">
				<div className="flex size-6 items-center justify-center rounded-md border bg-card text-foreground">
					<OpenGranMark className="size-4" />
				</div>
				OpenGran
			</div>
			<Card>
				<CardHeader className="text-center">
					<CardTitle className="text-xl">Welcome back</CardTitle>
					<CardDescription>
						Login with your GitHub or Google account
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form>
						<FieldGroup>
							<Field>
								<Button
									variant="outline"
									type="button"
									className="w-full"
									onClick={onGoogleSignIn}
									disabled={isAuthenticating || !hasAcceptedTerms}
								>
									{authenticatingProvider === "google" ? (
										<LoaderCircle className="animate-spin" />
									) : (
										<Icons.googleLogo className="size-4" />
									)}
									Login with Google
								</Button>
							</Field>
							<Field>
								<Button
									variant="outline"
									type="button"
									className="w-full"
									onClick={onGitHubSignIn}
									disabled={isAuthenticating || !hasAcceptedTerms}
								>
									{authenticatingProvider === "github" ? (
										<LoaderCircle className="animate-spin" />
									) : (
										<Icons.githubLogo />
									)}
									Login with GitHub
								</Button>
							</Field>
							{error ? (
								<Field>
									<FieldDescription className="flex items-center justify-center gap-2 text-center text-destructive">
										<AlertCircle className="size-4 shrink-0" />
										<span>{error}</span>
									</FieldDescription>
								</Field>
							) : null}
							<Field orientation="horizontal">
								<Checkbox
									id="terms"
									checked={hasAcceptedTerms}
									onCheckedChange={(checked) =>
										setHasAcceptedTerms(checked === true)
									}
								/>
								<FieldLabel
									htmlFor="terms"
									className="text-xs leading-none font-normal whitespace-nowrap text-muted-foreground"
								>
									I agree to the{" "}
									<a
										href="https://openmeet.app/terms"
										className="underline underline-offset-4"
									>
										Terms of Service
									</a>{" "}
									and{" "}
									<a
										href="https://openmeet.app/privacy"
										className="underline underline-offset-4"
									>
										Privacy Policy
									</a>
									.
								</FieldLabel>
							</Field>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

function toAppUser(session: AuthSession): AppUser {
	return {
		name: session.user.name?.trim() || session.user.email,
		email: session.user.email,
		avatar: session.user.image ?? "",
	};
}

export default App;
