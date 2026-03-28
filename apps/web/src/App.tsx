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
import { Separator } from "@workspace/ui/components/separator";
import {
	SidebarProvider,
	SidebarTrigger,
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
	Mic,
	MoreHorizontal,
	Plus,
	Redo2,
	TriangleAlert,
	Undo2,
	Volume2,
} from "lucide-react";
import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPage } from "@/components/chat/chat-page";
import { AppShellInset } from "@/components/layout/app-shell-inset";
import { NoteActionsMenu } from "@/components/note/note-actions-menu";
import { type NoteEditorActions, NotePage } from "@/components/note/note-page";
import { SharedNotePage } from "@/components/note/shared-note-page";
import type { SettingsPage } from "@/components/settings/settings-dialog";
import { NoteTemplateSelect } from "@/components/templates/note-template-select";
import { OpenGranMark } from "@/components/ui/open-gran-mark";
import { WorkspaceComposer } from "@/components/workspaces/workspace-composer";
import { type AuthSession, authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
import { getSuggestedWorkspaceName } from "@/lib/workspaces";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type AppUser = {
	name: string;
	email: string;
	avatar: string;
};

type AppView = "home" | "chat" | "shared" | "note";
type SocialAuthProvider = "github" | "google";

const SETTINGS_PAGE_BY_SLUG = {
	profile: "Profile",
	calendar: "Calendar",
	"data-controls": "Data controls",
} as const satisfies Record<string, SettingsPage>;

const SETTINGS_SLUG_BY_PAGE: Record<SettingsPage, string> = {
	Profile: "profile",
	Calendar: "calendar",
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
const WELCOME_FIREWORK_COLORS = [
	"#ffd44d",
	"#4cd964",
	"#ff9f43",
	"#7bed9f",
	"#a3e635",
] as const;
const DESKTOP_PERMISSION_LABELS: Record<DesktopPermissionId, string> = {
	microphone: "Transcribe me",
	systemAudio: "Transcribe others",
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
	htmlLink?: string;
	meetingUrl?: string;
	location?: string;
};

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

const isSameCalendarDay = (left: Date, right: Date) =>
	left.getFullYear() === right.getFullYear() &&
	left.getMonth() === right.getMonth() &&
	left.getDate() === right.getDate();

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

const getAppViewFromUrl = (url: URL): AppView =>
	url.pathname === "/note" || url.hash === "#note"
		? "note"
		: url.pathname === "/chat" || url.hash === "#chat"
			? "chat"
			: url.pathname === "/shared" || url.hash === "#shared"
				? "shared"
				: "home";

const shouldAutoStartNoteCaptureFromUrl = (url: URL) =>
	getAppViewFromUrl(url) === "note" &&
	url.searchParams.get("capture") === "1" &&
	!url.searchParams.get("noteId");

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

const getDelayUntilNextMidnight = (now: Date) => {
	const nextMidnight = new Date(now);
	nextMidnight.setHours(24, 0, 0, 0);

	return nextMidnight.getTime() - now.getTime();
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

		const scheduleNextUpdate = () => {
			const now = new Date();
			setCurrentDate(now);
			timeoutId = window.setTimeout(
				scheduleNextUpdate,
				getDelayUntilNextMidnight(now),
			);
		};

		scheduleNextUpdate();

		return () => {
			if (timeoutId !== undefined) {
				window.clearTimeout(timeoutId);
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

	React.useEffect(() => {
		void window.openGranDesktop
			?.getMeta()
			.then((meta) => {
				setIsDesktopMac(meta.platform === "darwin");
				setDesktopPlatform(meta.platform);
			})
			.catch(() => {
				setIsDesktopMac(false);
			});
	}, []);

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
			setDesktopPermissionsStatus(null);
			return null;
		}

		const status = await window.openGranDesktop.getPermissionsStatus();
		setDesktopPermissionsStatus(status);
		return status;
	}, []);

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
			setDesktopPermissionsError(null);
			setDesktopPermissionsStatus(null);
			return;
		}

		void syncDesktopPermissions().catch((error) => {
			if (isMissingDesktopPermissionHandlerError(error)) {
				setDesktopPermissionsStatus({
					isDesktop: true,
					platform: desktopPlatform,
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
				setDesktopPermissionsError(
					"Desktop permissions are unavailable because the Electron shell is still running an older build. Restart the desktop app, then try again.",
				);
				return;
			}

			setDesktopPermissionsError(
				error instanceof Error
					? error.message
					: "Failed to load desktop permissions.",
			);
		});
	}, [desktopPlatform, shouldLoadDesktopPermissions, syncDesktopPermissions]);

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
				}
			});
		},
		[],
	);

	const handleOpenDesktopPermissionSettings = React.useCallback(
		(permissionId: DesktopPermissionId) => {
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
	workspaces: Array<Doc<"workspaces">> | undefined;
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
				isDesktopMac && "pt-20 md:pt-24",
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
					colors: [...WELCOME_FIREWORK_COLORS],
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
					colors: [...WELCOME_FIREWORK_COLORS],
					disableForReducedMotion: true,
					gravity: 0.95,
					origin: { x: 0.65 + Math.random() * 0.2, y: originY + 0.05 },
					particleCount: 20,
					scalar: 1.05,
					spread: 55,
					startVelocity: 52,
				});
				fire({
					colors: [...WELCOME_FIREWORK_COLORS],
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
				isDesktopMac && "pt-20 md:pt-24",
			)}
		/>
	);
}

const getDesktopPermissionTone = (state: DesktopPermissionState) => {
	if (state === "granted") {
		return "border-transparent bg-muted text-foreground";
	}

	if (state === "blocked") {
		return "border-amber-200 bg-amber-50 text-amber-700";
	}

	return "border-border bg-muted/40 text-muted-foreground";
};

const getDesktopPermissionIcon = (permissionId: DesktopPermissionId) =>
	permissionId === "microphone" ? Mic : Volume2;

const getDesktopPermissionActionLabel = (permissionId: DesktopPermissionId) =>
	permissionId === "microphone" ? "Enable Microphone" : "Enable System Audio";

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
				<div className="overflow-hidden rounded-xl border">
					{permissions.map((permission, index) => {
						const Icon = getDesktopPermissionIcon(permission.id);
						const isRequestBlockedByDependency =
							permission.id === "systemAudio" && !isMicrophoneGranted;

						return (
							<React.Fragment key={permission.id}>
								{index > 0 ? <Separator /> : null}
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
										<p className="font-medium">{permission.label}</p>
									</div>
									{permission.state === "granted" ? (
										<div className="inline-flex size-9 items-center justify-center rounded-full border border-border/70">
											<Check className="size-4" />
										</div>
									) : permission.canRequest ? (
										<Button
											type="button"
											size="sm"
											className="shrink-0 rounded-full px-4"
											onClick={() => onRequestPermission(permission.id)}
											disabled={
												isRefreshing ||
												isSubmitting ||
												isRequestBlockedByDependency
											}
										>
											{isRefreshing ? (
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
											className="shrink-0 rounded-full px-4"
											onClick={() => onOpenSettings(permission.id)}
											disabled={isRefreshing || isSubmitting}
										>
											<ExternalLink className="size-4" />
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
					<div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
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
	workspaces: Array<Doc<"workspaces">>;
	initialDesktopMac: boolean;
}) => {
	const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
	const [currentView, setCurrentView] = React.useState<AppView>(() => {
		if (typeof window === "undefined") {
			return "home";
		}

		return getAppViewFromUrl(new URL(window.location.href));
	});
	const [isDesktopMac, setIsDesktopMac] = React.useState(initialDesktopMac);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [settingsPage, setSettingsPage] =
		React.useState<SettingsPage>("Profile");
	const [isSigningOut, startSignOut] = React.useTransition();
	const [activeWorkspaceId, setActiveWorkspaceId] =
		React.useState<Id<"workspaces"> | null>(() => workspaces[0]?._id ?? null);
	const [currentChatId, setCurrentChatId] = React.useState<string | null>(
		() => {
			if (typeof window === "undefined") {
				return null;
			}

			return getChatIdFromUrl(new URL(window.location.href));
		},
	);
	const [chatComposerId, setChatComposerId] = React.useState(() => {
		if (typeof window === "undefined") {
			return crypto.randomUUID();
		}

		return (
			getChatIdFromUrl(new URL(window.location.href)) ?? crypto.randomUUID()
		);
	});
	const [currentNoteId, setCurrentNoteId] = React.useState<Id<"notes"> | null>(
		() => {
			if (typeof window === "undefined") {
				return null;
			}

			return (
				(new URL(window.location.href).searchParams.get(
					"noteId",
				) as Id<"notes"> | null) ?? null
			);
		},
	);
	const [shouldAutoStartNoteCapture, setShouldAutoStartNoteCapture] =
		React.useState(() => {
			if (typeof window === "undefined") {
				return false;
			}

			return shouldAutoStartNoteCaptureFromUrl(new URL(window.location.href));
		});
	const [currentNoteTitle, setCurrentNoteTitle] = React.useState("New note");
	const [currentNoteEditorActions, setCurrentNoteEditorActions] =
		React.useState<NoteEditorActions | null>(null);
	const creatingNoteRef = React.useRef(false);
	const lastNonSettingsLocationRef = React.useRef(
		getInitialNonSettingsLocation(),
	);
	const user = React.useMemo(() => toAppUser(session), [session]);
	const currentDate = useCurrentDate();
	const currentDayOfMonth = currentDate.getDate();
	const currentMonthLabel = currentMonthFormatter.format(currentDate);
	const currentWeekdayLabel = currentWeekdayFormatter.format(currentDate);
	const [upcomingCalendarEvents, setUpcomingCalendarEvents] = React.useState<
		UpcomingCalendarEvent[]
	>([]);
	const [upcomingCalendarStatus, setUpcomingCalendarStatus] = React.useState<
		"idle" | "ready" | "not_connected" | "error"
	>("idle");
	const [isLoadingUpcomingCalendarEvents, setIsLoadingUpcomingCalendarEvents] =
		React.useState(false);
	const upcomingCalendarLoadKey = session?.user?.email
		? `${isConvexAuthenticated ? "authenticated" : "unauthenticated"}:${session.user.email}`
		: "anonymous";
	const createNote = useMutation(api.notes.create);
	const createWorkspace = useMutation(api.workspaces.create);
	const listUpcomingGoogleEvents = useAction(
		api.calendar.listUpcomingGoogleEvents,
	);
	const chats = useQuery(api.chats.list, {});
	const notes = useQuery(api.notes.list, {});
	const sharedNotes = useQuery(api.notes.listShared, {});
	const selectedChatMessages = useQuery(
		api.chats.getMessages,
		currentView === "chat" && currentChatId
			? {
					chatId: currentChatId,
				}
			: "skip",
	);
	const selectedNote = useQuery(
		api.notes.get,
		currentNoteId
			? {
					id: currentNoteId,
				}
			: "skip",
	);

	const refreshUpcomingCalendarEvents = React.useEffectEvent(async () => {
		if (!session?.user?.email || !isConvexAuthenticated) {
			setUpcomingCalendarEvents([]);
			setUpcomingCalendarStatus("not_connected");
			return;
		}

		setIsLoadingUpcomingCalendarEvents(true);

		try {
			const result = await listUpcomingGoogleEvents({});

			if (result.status === "not_connected") {
				setUpcomingCalendarEvents([]);
				setUpcomingCalendarStatus("not_connected");
				return;
			}

			setUpcomingCalendarEvents(result.events);
			setUpcomingCalendarStatus("ready");
		} catch (error) {
			console.error("Failed to load upcoming calendar events", error);
			setUpcomingCalendarEvents([]);
			setUpcomingCalendarStatus("error");
		} finally {
			setIsLoadingUpcomingCalendarEvents(false);
		}
	});

	React.useEffect(() => {
		if (upcomingCalendarLoadKey === "anonymous") {
			void refreshUpcomingCalendarEvents();
			return;
		}

		void refreshUpcomingCalendarEvents();
	}, [upcomingCalendarLoadKey]);

	React.useEffect(() => {
		if (upcomingCalendarLoadKey === "anonymous") {
			return;
		}

		const handleFocus = () => {
			void refreshUpcomingCalendarEvents();
		};

		window.addEventListener("focus", handleFocus);
		return () => window.removeEventListener("focus", handleFocus);
	}, [upcomingCalendarLoadKey]);

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
			const nextChatId = getChatIdFromUrl(contentUrl);
			const nextView = getAppViewFromUrl(contentUrl);
			const nextNoteId =
				(contentUrl.searchParams.get("noteId") as Id<"notes"> | null) ?? null;
			const nextShouldAutoStartNoteCapture =
				shouldAutoStartNoteCaptureFromUrl(contentUrl);

			setCurrentView(nextView);
			setCurrentChatId(nextChatId);
			setChatComposerId(nextChatId ?? crypto.randomUUID());
			setCurrentNoteId(nextNoteId);
			setShouldAutoStartNoteCapture(nextShouldAutoStartNoteCapture);
			setCurrentNoteEditorActions(null);
			setSettingsPage(nextSettingsPage ?? "Profile");

			const nextPath = nextSettingsOpen
				? getSettingsPath(nextSettingsPage ?? "Profile")
				: nextView === "note"
					? "/note"
					: nextView === "chat"
						? "/chat"
						: nextView === "shared"
							? "/shared"
							: "/home";
			const nextSearch = nextSettingsOpen
				? ""
				: nextView === "note" && nextNoteId
					? `?noteId=${nextNoteId}${nextShouldAutoStartNoteCapture ? "&capture=1" : ""}`
					: nextView === "note" && nextShouldAutoStartNoteCapture
						? "?capture=1"
						: nextView === "chat" && nextChatId
							? `?chatId=${encodeURIComponent(nextChatId)}`
							: "";
			const nextHash = "";
			const nextLocation = `${nextPath}${nextSearch}${nextHash}`;
			if (
				window.location.pathname !== nextPath ||
				window.location.search !== nextSearch ||
				window.location.hash !== nextHash
			) {
				window.history.replaceState(null, "", nextLocation);
			}

			setSettingsOpen(nextSettingsOpen);
		};

		syncViewFromLocation();
		window.addEventListener("popstate", syncViewFromLocation);

		return () => {
			window.removeEventListener("popstate", syncViewFromLocation);
		};
	}, []);

	React.useEffect(() => {
		if (selectedNote?.title) {
			setCurrentNoteTitle(selectedNote.title);
			return;
		}

		if (currentView === "note") {
			setCurrentNoteTitle("New note");
		}
	}, [currentView, selectedNote?.title]);

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
		setCurrentView("chat");
		setSettingsOpen(false);
		setCurrentChatId(null);
		setChatComposerId(crypto.randomUUID());
		window.history.pushState(null, "", "/chat");
	}, []);

	const handleViewChange = React.useCallback(
		(view: AppView) => {
			if (view === "chat") {
				openFreshChat();
				return;
			}

			setCurrentView(view);
			setSettingsOpen(false);
			setCurrentNoteEditorActions(null);
			const search =
				view === "note" && currentNoteId ? `?noteId=${currentNoteId}` : "";
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
		[currentNoteId, openFreshChat],
	);

	const openNote = React.useCallback(
		(
			noteId: Id<"notes">,
			options?: {
				autoStartCapture?: boolean;
			},
		) => {
			setCurrentView("note");
			setSettingsOpen(false);
			setCurrentNoteId(noteId);
			setShouldAutoStartNoteCapture(options?.autoStartCapture === true);
			setCurrentNoteEditorActions(null);
			window.history.pushState(
				null,
				"",
				`/note?noteId=${noteId}${options?.autoStartCapture ? "&capture=1" : ""}`,
			);
		},
		[],
	);

	const handleCreateNote = React.useCallback(
		(options?: { autoStartCapture?: boolean }) => {
			if (creatingNoteRef.current) {
				return;
			}

			creatingNoteRef.current = true;
			const shouldStartCapture = options?.autoStartCapture === true;

			void createNote()
				.then((noteId) => {
					setCurrentNoteTitle("New note");
					openNote(noteId, {
						autoStartCapture: shouldStartCapture,
					});
				})
				.catch((error) => {
					console.error("Failed to create note", error);
				})
				.finally(() => {
					creatingNoteRef.current = false;
				});
		},
		[createNote, openNote],
	);

	const handleQuickNote = React.useCallback(() => {
		setCurrentView("note");
		setSettingsOpen(false);
		setCurrentNoteId(null);
		setShouldAutoStartNoteCapture(true);
		setCurrentNoteEditorActions(null);
		window.history.pushState(null, "", "/note?capture=1");
	}, []);

	const handleAutoStartNoteCaptureHandled = React.useCallback(() => {
		setShouldAutoStartNoteCapture(false);

		if (currentView !== "note" || !currentNoteId) {
			return;
		}

		window.history.replaceState(null, "", `/note?noteId=${currentNoteId}`);
	}, [currentNoteId, currentView]);

	React.useEffect(() => {
		if (currentView === "note" && !currentNoteId) {
			handleCreateNote({
				autoStartCapture: shouldAutoStartNoteCapture,
			});
		}
	}, [
		currentNoteId,
		currentView,
		handleCreateNote,
		shouldAutoStartNoteCapture,
	]);

	const handleSettingsOpenChange = React.useCallback(
		(open: boolean, page: SettingsPage = "Profile") => {
			setSettingsOpen(open);
			if (!open) {
				setSettingsPage("Profile");
				const nextLocation = lastNonSettingsLocationRef.current || "/home";
				window.history.pushState(null, "", nextLocation);
				return;
			}

			const currentUrl = new URL(window.location.href);
			if (getSettingsPageFromPath(currentUrl.pathname) === null) {
				lastNonSettingsLocationRef.current = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
			}

			setSettingsPage(page);
			window.history.pushState(null, "", getSettingsPath(page));
		},
		[],
	);

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
			if (noteId !== currentNoteId) {
				return;
			}

			setCurrentNoteId(null);
			setCurrentNoteTitle("New note");
			setCurrentNoteEditorActions(null);
			handleViewChange("home");
		},
		[currentNoteId, handleViewChange],
	);
	const handleOpenChat = React.useCallback((chatId: string) => {
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
		currentView === "note" &&
		(selectedNote?.visibility === "public" ||
			sharedNotes?.some((note) => note._id === currentNoteId) === true);
	const initialChatMessages = React.useMemo(
		() => toStoredChatMessages(selectedChatMessages ?? []),
		[selectedChatMessages],
	);

	return {
		activeWorkspaceId,
		chats,
		chatComposerId,
		currentChatId,
		currentChatTitle,
		currentDate,
		currentDayOfMonth,
		currentMonthLabel,
		currentNoteEditorActions,
		currentNoteId,
		currentNoteTitle,
		currentView,
		currentWeekdayLabel,
		handleAutoStartNoteCaptureHandled,
		handleChatPersisted,
		handleChatRemoved,
		handleCreateNote,
		handleQuickNote,
		handleNewChat,
		handleNoteTrashed,
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
		selectedNote,
		settingsOpen,
		settingsPage,
		setActiveWorkspaceId,
		setCurrentNoteEditorActions,
		setCurrentNoteTitle,
		shouldAutoStartNoteCapture,
		sharedNotes,
		upcomingCalendarEvents,
		upcomingCalendarStatus,
		user,
		workspaces,
		currentNoteTemplateSlug: selectedNote?.templateSlug ?? null,
		breadcrumbDetailLabel:
			currentView === "note"
				? currentNoteTitle
				: currentView === "chat" && currentChatId
					? currentChatTitle
					: null,
		breadcrumbSectionLabel:
			currentView === "chat"
				? "Chat"
				: currentView === "shared" || isSharedNote
					? "Shared"
					: "Home",
		handleBreadcrumbSectionClick: () => {
			if (currentView === "chat") {
				openFreshChat();
				return;
			}

			handleViewChange(
				currentView === "shared" || isSharedNote ? "shared" : "home",
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
	workspaces: Array<Doc<"workspaces">>;
	initialDesktopMac: boolean;
}) {
	const controller = useAppShellState({
		session,
		workspaces,
		initialDesktopMac,
	});

	return (
		<SidebarProvider className="h-svh overflow-hidden">
			<AppSidebar
				workspaces={controller.workspaces}
				activeWorkspaceId={controller.activeWorkspaceId}
				currentView={controller.currentView}
				user={controller.user}
				notes={controller.notes}
				onWorkspaceSelect={controller.setActiveWorkspaceId}
				onWorkspaceCreate={controller.handleWorkspaceCreate}
				onViewChange={controller.handleViewChange}
				settingsOpen={controller.settingsOpen}
				settingsPage={controller.settingsPage}
				onSettingsOpenChange={controller.handleSettingsOpenChange}
				onSignOut={controller.handleSignOut}
				signingOut={controller.isSigningOut}
				desktopSafeTop={controller.isDesktopMac}
				currentNoteId={controller.currentNoteId}
				currentNoteTitle={controller.currentNoteTitle}
				onNoteSelect={controller.openNote}
				onNoteTrashed={controller.handleNoteTrashed}
			/>
			<AppShellInset reserveRightSidebar={controller.currentView === "note"}>
				<AppShellHeader
					isDesktopMac={controller.isDesktopMac}
					breadcrumbSectionLabel={controller.breadcrumbSectionLabel}
					breadcrumbDetailLabel={controller.breadcrumbDetailLabel}
					onBreadcrumbSectionClick={controller.handleBreadcrumbSectionClick}
					currentView={controller.currentView}
					currentNoteId={controller.currentNoteId}
					currentNoteTitle={controller.currentNoteTitle}
					currentNoteTemplateSlug={controller.currentNoteTemplateSlug}
					currentNoteEditorActions={controller.currentNoteEditorActions}
					onCreateNote={controller.handleQuickNote}
					onNoteTrashed={controller.handleNoteTrashed}
					onNewChat={controller.handleNewChat}
				/>
				<AppShellContent
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
					userName={controller.user.name}
					onOpenNote={controller.openNote}
					onNoteTrashed={controller.handleNoteTrashed}
					onCreateNote={controller.handleQuickNote}
					onOpenCalendarSettings={controller.handleOpenCalendarSettings}
					chatComposerId={controller.chatComposerId}
					initialChatMessages={controller.initialChatMessages}
					chats={controller.chats}
					currentChatId={controller.currentChatId}
					onChatPersisted={controller.handleChatPersisted}
					onOpenChat={controller.handleOpenChat}
					onChatRemoved={controller.handleChatRemoved}
					onNoteTitleChange={controller.setCurrentNoteTitle}
					onNoteEditorActionsChange={controller.setCurrentNoteEditorActions}
					onAutoStartNoteCaptureHandled={
						controller.handleAutoStartNoteCaptureHandled
					}
					shouldAutoStartNoteCapture={controller.shouldAutoStartNoteCapture}
				/>
			</AppShellInset>
		</SidebarProvider>
	);
}

function AppShellHeader({
	isDesktopMac,
	breadcrumbSectionLabel,
	breadcrumbDetailLabel,
	onBreadcrumbSectionClick,
	currentView,
	currentNoteId,
	currentNoteTitle,
	currentNoteTemplateSlug,
	currentNoteEditorActions,
	onCreateNote,
	onNoteTrashed,
	onNewChat,
}: {
	isDesktopMac: boolean;
	breadcrumbSectionLabel: string;
	breadcrumbDetailLabel: string | null;
	onBreadcrumbSectionClick: () => void;
	currentView: AppView;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle: string;
	currentNoteTemplateSlug: string | null;
	currentNoteEditorActions: NoteEditorActions | null;
	onCreateNote: () => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
	onNewChat: () => void;
}) {
	return (
		<header
			data-app-region={isDesktopMac ? "drag" : undefined}
			className={cn(
				"sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6",
				isDesktopMac && "h-20 pt-8",
			)}
		>
			<div
				data-app-region={isDesktopMac ? "no-drag" : undefined}
				className="flex min-w-0 flex-1 items-center gap-2 pr-4"
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<SidebarTrigger className="-ml-1" />
					</TooltipTrigger>
					<TooltipContent align="start">
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
				<Breadcrumb className="min-w-0 flex-1">
					<BreadcrumbList className="min-w-0 flex-nowrap overflow-hidden">
						{breadcrumbDetailLabel ? (
							<>
								<BreadcrumbItem className="hidden shrink-0 md:inline-flex">
									<BreadcrumbLink asChild>
										<button
											type="button"
											className="cursor-pointer truncate"
											onClick={onBreadcrumbSectionClick}
										>
											{breadcrumbSectionLabel}
										</button>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden shrink-0 md:block" />
								<BreadcrumbItem className="min-w-0 flex-1 overflow-hidden">
									<BreadcrumbPage className="block truncate">
										{breadcrumbDetailLabel}
									</BreadcrumbPage>
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
			</div>
			<div
				data-app-region={isDesktopMac ? "no-drag" : undefined}
				className="ml-auto shrink-0"
			>
				{currentView === "home" ? (
					<Button variant="outline" onClick={onCreateNote}>
						<Plus />
						Quick note
					</Button>
				) : currentView === "note" && currentNoteId ? (
					<div className="flex items-center gap-2">
						<NoteTemplateSelect
							disabled={!currentNoteEditorActions}
							selectedSlug={currentNoteTemplateSlug}
							onTemplateSelect={async (template) =>
								(await currentNoteEditorActions?.applyTemplate(template)) ??
								false
							}
						/>
						<NoteActionsMenu
							noteId={currentNoteId}
							onMoveToTrash={onNoteTrashed}
							align="end"
							itemsBeforeDefaults={
								currentNoteEditorActions ? (
									<DropdownMenuItem
										className="cursor-pointer"
										disabled={!currentNoteEditorActions.canCopyText}
										onSelect={(event) => {
											event.preventDefault();
											currentNoteEditorActions.copyText();
										}}
									>
										<Copy />
										Copy text
									</DropdownMenuItem>
								) : null
							}
							itemsAfterDefaults={
								currentNoteEditorActions ? (
									<>
										<DropdownMenuItem
											className="cursor-pointer"
											disabled={!currentNoteEditorActions.canUndo}
											onSelect={(event) => {
												event.preventDefault();
												currentNoteEditorActions.undo();
											}}
										>
											<Undo2 />
											Undo
										</DropdownMenuItem>
										<DropdownMenuItem
											className="cursor-pointer"
											disabled={!currentNoteEditorActions.canRedo}
											onSelect={(event) => {
												event.preventDefault();
												currentNoteEditorActions.redo();
											}}
										>
											<Redo2 />
											Redo
										</DropdownMenuItem>
										<DropdownMenuItem
											className="cursor-pointer"
											disabled={!currentNoteEditorActions.canCopyText}
											onSelect={(event) => {
												event.preventDefault();
												currentNoteEditorActions.exportNote();
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
								size="icon"
								className="text-muted-foreground hover:text-foreground"
								aria-label={`Open actions for ${currentNoteTitle || "note"}`}
							>
								<MoreHorizontal className="size-4" />
							</Button>
						</NoteActionsMenu>
					</div>
				) : currentView === "chat" ? (
					<Button variant="outline" onClick={onNewChat}>
						<Plus />
						New chat
					</Button>
				) : null}
			</div>
		</header>
	);
}

function AppShellContent({
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
	userName,
	onOpenNote,
	onNoteTrashed,
	onCreateNote,
	onOpenCalendarSettings,
	chatComposerId,
	initialChatMessages,
	chats,
	currentChatId,
	onChatPersisted,
	onOpenChat,
	onChatRemoved,
	onNoteTitleChange,
	onNoteEditorActionsChange,
	onAutoStartNoteCaptureHandled,
	shouldAutoStartNoteCapture,
}: {
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
	userName: string;
	onOpenNote: (noteId: Id<"notes">) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
	onCreateNote: () => void;
	onOpenCalendarSettings: () => void;
	chatComposerId: string;
	initialChatMessages: UIMessage[];
	chats: Array<Doc<"chats">> | undefined;
	currentChatId: string | null;
	onChatPersisted?: (chatId: string) => void;
	onOpenChat: (chatId: string) => void;
	onChatRemoved: (chatId: string) => void;
	onNoteTitleChange: (title: string) => void;
	onNoteEditorActionsChange: (actions: NoteEditorActions | null) => void;
	onAutoStartNoteCaptureHandled: () => void;
	shouldAutoStartNoteCapture: boolean;
}) {
	if (currentView === "home") {
		return (
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
					currentUserName={userName}
					onOpenNote={onOpenNote}
					onNoteTrashed={onNoteTrashed}
					onCreateNote={onCreateNote}
					onOpenCalendarSettings={onOpenCalendarSettings}
				/>
			</div>
		);
	}

	if (currentView === "shared") {
		return (
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<SharedView
					sharedNotes={sharedNotes}
					currentNoteId={currentNoteId}
					currentNoteTitle={currentNoteTitle}
					currentUserName={userName}
					onOpenNote={onOpenNote}
					onNoteTrashed={onNoteTrashed}
				/>
			</div>
		);
	}

	if (currentView === "note") {
		return (
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<NotePage
					autoStartTranscription={shouldAutoStartNoteCapture}
					noteId={currentNoteId}
					onAutoStartTranscriptionHandled={onAutoStartNoteCaptureHandled}
					onTitleChange={onNoteTitleChange}
					onEditorActionsChange={onNoteEditorActionsChange}
				/>
			</div>
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
		/>
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
	currentUserName,
	onOpenNote,
	onNoteTrashed,
	onCreateNote,
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
	currentUserName: string;
	onOpenNote: (noteId: Id<"notes">) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
	onCreateNote: () => void;
	onOpenCalendarSettings: () => void;
}) {
	const visibleUpcomingEvents = upcomingCalendarEvents
		.filter((event) => isUpcomingEventToday(event, currentDate))
		.slice(0, 5);
	const shouldShowUpcomingCalendarSkeleton =
		isLoadingUpcomingCalendarEvents &&
		upcomingCalendarStatus === "idle" &&
		visibleUpcomingEvents.length === 0;

	const openMeetingLink = React.useCallback(async (url: string) => {
		if (window.openGranDesktop) {
			await window.openGranDesktop.openExternalUrl(url);
			return;
		}

		window.open(url, "_blank", "noopener,noreferrer");
	}, []);

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-col gap-6 pt-2 md:pt-4">
				<section className="mx-auto w-full max-w-xl space-y-6">
					<h1 className="text-lg md:text-xl">Coming up</h1>
					<Card className="overflow-hidden rounded-xl border-border py-0 shadow-sm">
						<CardContent className="p-0">
							<div className="grid min-h-[152px] md:grid-cols-[184px_minmax(0,1fr)]">
								<div className="flex items-start border-b border-border/60 px-5 py-4 md:border-b-0 md:border-r">
									<div className="grid grid-cols-[auto_auto] items-start gap-x-3 gap-y-1">
										<div className="row-span-2 text-5xl leading-none tracking-tight tabular-nums">
											{currentDayOfMonth}
										</div>
										<div className="flex items-center gap-2 pt-1 text-base leading-none">
											<span>{currentMonthLabel}</span>
											<span className="h-1.5 w-1.5 rounded-full bg-green-500" />
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
													const canJoinNow = Boolean(event.meetingUrl);

													return (
														<div
															key={`${event.id}:${event.startAt}`}
															className={cn(
																"flex items-start gap-3 rounded-lg px-3 py-2 transition-colors",
																isLive && "bg-muted/50",
															)}
														>
															<div
																className={cn(
																	"mt-0.5 h-8 w-1 shrink-0 rounded-full bg-[#8f88ff]",
																	isLive && "bg-green-500",
																)}
															/>
															<div className="min-w-0 flex-1">
																<div className="flex items-start justify-between gap-4">
																	<div className="min-w-0">
																		<p className="truncate text-sm font-medium text-foreground">
																			{event.title}
																		</p>
																		<p
																			className={cn(
																				"mt-0.5 text-xs text-muted-foreground",
																				isLive && "text-green-500",
																			)}
																		>
																			{formatUpcomingEventMeta(
																				event,
																				currentDate,
																			)}
																		</p>
																	</div>
																	{canJoinNow ? (
																		<Button
																			type="button"
																			variant="default"
																			size="sm"
																			className="h-8 shrink-0 px-3.5 text-xs"
																			onClick={() => {
																				if (event.meetingUrl) {
																					void openMeetingLink(
																						event.meetingUrl,
																					);
																				}
																			}}
																		>
																			Start now
																		</Button>
																	) : null}
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
														? "Connect Google Calendar"
														: upcomingCalendarStatus === "error"
															? "Couldn’t load calendar"
															: "No upcoming events today"}
												</EmptyTitle>
												<EmptyDescription>
													{upcomingCalendarStatus === "not_connected"
														? "Link Google Calendar in settings to see upcoming meetings."
														: upcomingCalendarStatus === "error"
															? "Try reconnecting Google Calendar or refresh the app."
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
							currentUserName={currentUserName}
							onOpenNote={onOpenNote}
							onNoteTrashed={onNoteTrashed}
						/>
					) : (
						<Empty className="max-w-xl">
							<EmptyHeader>
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
	currentUserName,
	onOpenNote,
	onNoteTrashed,
}: {
	sharedNotes: Array<Doc<"notes">> | undefined;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle: string;
	currentUserName: string;
	onOpenNote: (noteId: Id<"notes">) => void;
	onNoteTrashed: (noteId: Id<"notes">) => void;
}) {
	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-col gap-6 pt-2 md:pt-4">
				<section className="mx-auto w-full max-w-xl space-y-6">
					<h1 className="text-lg md:text-xl">Shared with others</h1>
				</section>
				<section className="flex justify-center py-8">
					{sharedNotes === undefined ? (
						<SharedNotesSkeleton />
					) : sharedNotes.length > 0 ? (
						<SharedNotesList
							notes={sharedNotes}
							activeNoteId={currentNoteId}
							activeNoteTitle={currentNoteTitle}
							currentUserName={currentUserName}
							onOpenNote={onOpenNote}
							onNoteTrashed={onNoteTrashed}
						/>
					) : (
						<Empty className="max-w-xl">
							<EmptyHeader>
								<EmptyTitle>No shared notes yet</EmptyTitle>
								<EmptyDescription>
									When you share a note with someone else, it will show up here
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
					<div key={id} className="flex items-center gap-3 rounded-xl p-1">
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
					<div key={id} className="flex items-center gap-3 rounded-xl p-1">
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
	currentUserName,
	onOpenNote,
	onNoteTrashed,
}: {
	notes: Array<Doc<"notes">>;
	activeNoteId: Id<"notes"> | null;
	activeNoteTitle: string;
	currentUserName: string;
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
								const title =
									isActive && activeNoteTitle.trim()
										? activeNoteTitle
										: note.title || "New note";
								const preview =
									note.searchableText.trim() ||
									note.authorName?.trim() ||
									currentUserName;

								return (
									<div
										key={note._id}
										className={cn(
											"group flex items-center rounded-xl p-1 transition-colors hover:bg-card/50 has-[[data-note-actions]:focus-visible]:bg-transparent has-[[data-note-actions]:hover]:bg-transparent",
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
												<div className="truncate text-xs text-muted-foreground">
													{preview}
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
	currentUserName,
	onOpenNote,
	onNoteTrashed,
}: {
	notes: Array<Doc<"notes">>;
	activeNoteId: Id<"notes"> | null;
	activeNoteTitle: string;
	currentUserName: string;
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
								const title =
									isActive && activeNoteTitle.trim()
										? activeNoteTitle
										: note.title || "New note";
								const preview =
									note.searchableText.trim() ||
									note.authorName?.trim() ||
									currentUserName;

								return (
									<div
										key={note._id}
										className={cn(
											"group flex items-center rounded-xl p-1 transition-colors hover:bg-card/50 has-[[data-note-actions]:focus-visible]:bg-transparent has-[[data-note-actions]:hover]:bg-transparent",
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
												<div className="truncate text-xs text-muted-foreground">
													{preview}
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
				isDesktopMac && "pt-20 md:pt-24",
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
