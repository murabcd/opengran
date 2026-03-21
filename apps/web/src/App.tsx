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
	SidebarInset,
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
import { useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	ArrowDown,
	CalendarClock,
	Copy,
	FileText,
	LoaderCircle,
	MoreHorizontal,
	Plus,
	Redo2,
	Undo2,
} from "lucide-react";
import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPage } from "@/components/chat/chat-page";
import { QuickNoteActionsMenu } from "@/components/quick-note/quick-note-actions-menu";
import {
	type QuickNoteEditorActions,
	QuickNotePage,
} from "@/components/quick-note/quick-note-page";
import { SharedQuickNotePage } from "@/components/quick-note/shared-note-page";
import { type AuthSession, authClient } from "@/lib/auth-client";
import { getChatId } from "@/lib/chat";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";

type AppUser = {
	name: string;
	email: string;
	avatar: string;
};

const HOME_QUICK_NOTE_SKELETON_IDS = [
	"home-quick-note-skeleton-1",
	"home-quick-note-skeleton-2",
	"home-quick-note-skeleton-3",
] as const;

type GroupedItems<T> = {
	today: T[];
	yesterday: T[];
	lastWeek: T[];
	lastMonth: T[];
	older: T[];
};

const currentMonthFormatter = new Intl.DateTimeFormat(undefined, {
	month: "long",
});

const currentWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
	weekday: "short",
});

const isSameCalendarDay = (left: Date, right: Date) =>
	left.getFullYear() === right.getFullYear() &&
	left.getMonth() === right.getMonth() &&
	left.getDate() === right.getDate();

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

export function App() {
	const { data: session, isPending: isSessionPending } =
		authClient.useSession();
	const [authError, setAuthError] = React.useState<string | null>(null);
	const [isAuthenticating, startAuthentication] = React.useTransition();
	const [isDesktopMac, setIsDesktopMac] = React.useState(false);
	const [sharedNoteShareId, setSharedNoteShareId] = React.useState<
		string | null
	>(() => {
		if (typeof window === "undefined") {
			return null;
		}

		return getSharedNoteShareId(window.location.pathname);
	});
	const sharedNote = useQuery(
		api.quickNotes.getShared,
		sharedNoteShareId
			? {
					shareId: sharedNoteShareId,
				}
			: "skip",
	);

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

	const handleGitHubSignIn = React.useCallback(() => {
		startAuthentication(async () => {
			try {
				setAuthError(null);
				if (window.openGranDesktop) {
					const { url: callbackURL } =
						await window.openGranDesktop.getAuthCallbackUrl();
					const result = await authClient.signIn.social({
						provider: "github",
						callbackURL,
						errorCallbackURL: callbackURL,
						disableRedirect: true,
					});

					if (result.error) {
						const message =
							result.error.message ||
							result.error.statusText ||
							"GitHub sign-in failed.";
						throw new Error(message);
					}

					const url = result.data?.url;

					if (!url) {
						throw new Error("GitHub sign-in URL was not returned.");
					}

					await window.openGranDesktop.openExternalUrl(url);
					return;
				}

				await authClient.signIn.social({
					provider: "github",
					callbackURL: window.location.href,
				});
			} catch (error) {
				setAuthError(
					error instanceof Error
						? error.message
						: "GitHub sign-in failed. Check your Better Auth setup.",
				);
			}
		});
	}, []);

	const handleOpenOwnedSharedNote = React.useCallback(
		(noteId: Id<"quickNotes">) => {
			setSharedNoteShareId(null);
			window.history.pushState(null, "", `/note?noteId=${noteId}`);
		},
		[],
	);

	if (sharedNoteShareId) {
		return (
			<SharedQuickNotePage
				note={sharedNote}
				onOpenNote={handleOpenOwnedSharedNote}
			/>
		);
	}

	if (isSessionPending) {
		return <AuthBootstrapScreen isDesktopMac={isDesktopMac} />;
	}

	if (!session?.user) {
		return (
			<AuthScreen
				error={authError}
				isAuthenticating={isAuthenticating}
				isDesktopMac={isDesktopMac}
				onGitHubSignIn={handleGitHubSignIn}
			/>
		);
	}

	return <AppShell session={session} initialDesktopMac={isDesktopMac} />;
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

function AppShell({
	session,
	initialDesktopMac,
}: {
	session: AuthSession;
	initialDesktopMac: boolean;
}) {
	const [currentView, setCurrentView] = React.useState<
		"home" | "chat" | "shared" | "quick-note"
	>(() => {
		if (typeof window === "undefined") {
			return "home";
		}

		if (
			window.location.pathname === "/note" ||
			window.location.pathname === "/notes" ||
			window.location.pathname === "/quick-note"
		) {
			return "quick-note";
		}

		if (window.location.pathname === "/chat") {
			return "chat";
		}

		if (window.location.pathname === "/shared") {
			return "shared";
		}

		return "home";
	});
	const [isDesktopMac, setIsDesktopMac] = React.useState(initialDesktopMac);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [isSigningOut, startSignOut] = React.useTransition();
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
	const [currentQuickNoteId, setCurrentQuickNoteId] =
		React.useState<Id<"quickNotes"> | null>(() => {
			if (typeof window === "undefined") {
				return null;
			}

			return (
				(new URL(window.location.href).searchParams.get(
					"noteId",
				) as Id<"quickNotes"> | null) ?? null
			);
		});
	const [currentQuickNoteTitle, setCurrentQuickNoteTitle] =
		React.useState("New note");
	const [currentQuickNoteEditorActions, setCurrentQuickNoteEditorActions] =
		React.useState<QuickNoteEditorActions | null>(null);
	const creatingQuickNoteRef = React.useRef(false);
	const user = React.useMemo(() => toAppUser(session), [session]);
	const currentDate = useCurrentDate();
	const currentDayOfMonth = currentDate.getDate();
	const currentMonthLabel = currentMonthFormatter.format(currentDate);
	const currentWeekdayLabel = currentWeekdayFormatter.format(currentDate);
	const createQuickNote = useMutation(api.quickNotes.create);
	const chats = useQuery(api.chats.list, {});
	const quickNotes = useQuery(api.quickNotes.list, {});
	const sharedNotes = useQuery(api.quickNotes.listShared, {});
	const selectedChatMessages = useQuery(
		api.chats.getMessages,
		currentView === "chat" && currentChatId
			? {
					chatId: currentChatId,
				}
			: "skip",
	);
	const selectedQuickNote = useQuery(
		api.quickNotes.get,
		currentQuickNoteId
			? {
					id: currentQuickNoteId,
				}
			: "skip",
	);

	React.useEffect(() => {
		const syncViewFromLocation = () => {
			const url = new URL(window.location.href);
			const nextSettingsOpen = url.hash === "#settings";
			const nextChatId = getChatIdFromUrl(url);
			const nextView =
				window.location.pathname === "/note" ||
				window.location.pathname === "/notes" ||
				window.location.pathname === "/quick-note" ||
				url.hash === "#note" ||
				url.hash === "#notes" ||
				url.hash === "#quick-note"
					? "quick-note"
					: window.location.pathname === "/chat" || url.hash === "#chat"
						? "chat"
						: window.location.pathname === "/shared" || url.hash === "#shared"
							? "shared"
							: "home";
			const nextQuickNoteId =
				(url.searchParams.get("noteId") as Id<"quickNotes"> | null) ?? null;

			setCurrentView(nextView);
			setCurrentChatId(nextChatId);
			setChatComposerId(nextChatId ?? crypto.randomUUID());
			setCurrentQuickNoteId(nextQuickNoteId);
			setCurrentQuickNoteEditorActions(null);

			const nextPath =
				nextView === "quick-note"
					? "/note"
					: nextView === "chat"
						? "/chat"
						: nextView === "shared"
							? "/shared"
							: "/home";
			const nextSearch =
				nextView === "quick-note" && nextQuickNoteId
					? `?noteId=${nextQuickNoteId}`
					: nextView === "chat" && nextChatId
						? `?chatId=${encodeURIComponent(nextChatId)}`
						: "";
			const nextLocation = `${nextPath}${nextSearch}${nextSettingsOpen ? "#settings" : ""}`;
			if (
				window.location.pathname !== nextPath ||
				window.location.search !== nextSearch ||
				window.location.hash !== (nextSettingsOpen ? "#settings" : "")
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
		if (selectedQuickNote?.title) {
			setCurrentQuickNoteTitle(selectedQuickNote.title);
			return;
		}

		if (currentView === "quick-note") {
			setCurrentQuickNoteTitle("New note");
		}
	}, [currentView, selectedQuickNote?.title]);

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
		(view: "home" | "chat" | "shared" | "quick-note") => {
			if (view === "chat") {
				openFreshChat();
				return;
			}

			setCurrentView(view);
			setSettingsOpen(false);
			setCurrentQuickNoteEditorActions(null);
			const search =
				view === "quick-note" && currentQuickNoteId
					? `?noteId=${currentQuickNoteId}`
					: "";
			window.history.pushState(
				null,
				"",
				view === "quick-note"
					? `/note${search}`
					: view === "shared"
						? "/shared"
						: "/home",
			);
		},
		[currentQuickNoteId, openFreshChat],
	);

	const openQuickNote = React.useCallback((noteId: Id<"quickNotes">) => {
		setCurrentView("quick-note");
		setSettingsOpen(false);
		setCurrentQuickNoteId(noteId);
		setCurrentQuickNoteEditorActions(null);
		window.history.pushState(null, "", `/note?noteId=${noteId}`);
	}, []);

	const handleCreateQuickNote = React.useCallback(() => {
		if (creatingQuickNoteRef.current) {
			return;
		}

		creatingQuickNoteRef.current = true;

		void createQuickNote()
			.then((noteId) => {
				setCurrentQuickNoteTitle("New note");
				openQuickNote(noteId);
			})
			.catch((error) => {
				console.error("Failed to create quick note", error);
			})
			.finally(() => {
				creatingQuickNoteRef.current = false;
			});
	}, [createQuickNote, openQuickNote]);

	React.useEffect(() => {
		if (currentView === "quick-note" && !currentQuickNoteId) {
			handleCreateQuickNote();
		}
	}, [currentQuickNoteId, currentView, handleCreateQuickNote]);

	const handleSettingsOpenChange = React.useCallback((open: boolean) => {
		setSettingsOpen(open);

		const nextUrl = new URL(window.location.href);
		nextUrl.hash = open ? "settings" : "";
		window.history.replaceState(
			null,
			"",
			`${nextUrl.pathname}${nextUrl.hash ? `#${nextUrl.hash}` : ""}`,
		);
	}, []);

	const handleSignOut = React.useCallback(() => {
		startSignOut(async () => {
			try {
				await authClient.signOut();
			} catch (error) {
				console.error("Failed to sign out", error);
			}
		});
	}, []);

	const handleQuickNoteTrashed = React.useCallback(
		(noteId: Id<"quickNotes">) => {
			if (noteId !== currentQuickNoteId) {
				return;
			}

			setCurrentQuickNoteId(null);
			setCurrentQuickNoteTitle("New note");
			setCurrentQuickNoteEditorActions(null);
			handleViewChange("home");
		},
		[currentQuickNoteId, handleViewChange],
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
	const isSharedQuickNote =
		currentView === "quick-note" &&
		(selectedQuickNote?.visibility === "public" ||
			sharedNotes?.some((note) => note._id === currentQuickNoteId) === true);
	const breadcrumbSectionLabel =
		currentView === "chat"
			? "Chat"
			: currentView === "shared" || isSharedQuickNote
				? "Shared"
				: "Home";
	const breadcrumbDetailLabel =
		currentView === "quick-note"
			? currentQuickNoteTitle
			: currentView === "chat" && currentChatId
				? currentChatTitle
				: null;
	const handleBreadcrumbSectionClick = () => {
		if (currentView === "chat") {
			openFreshChat();
			return;
		}

		handleViewChange(
			currentView === "shared" || isSharedQuickNote ? "shared" : "home",
		);
	};
	const initialChatMessages = React.useMemo(
		() => toStoredChatMessages(selectedChatMessages ?? []),
		[selectedChatMessages],
	);

	return (
		<SidebarProvider>
			<AppSidebar
				currentView={currentView}
				user={user}
				quickNotes={quickNotes}
				onViewChange={handleViewChange}
				settingsOpen={settingsOpen}
				onSettingsOpenChange={handleSettingsOpenChange}
				onSignOut={handleSignOut}
				signingOut={isSigningOut}
				desktopSafeTop={isDesktopMac}
				currentQuickNoteId={currentQuickNoteId}
				currentQuickNoteTitle={currentQuickNoteTitle}
				onQuickNoteSelect={openQuickNote}
				onQuickNoteTrashed={handleQuickNoteTrashed}
			/>
			<SidebarInset>
				<header
					data-app-region={isDesktopMac ? "drag" : undefined}
					className={cn(
						"sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6",
						isDesktopMac && "h-20 pt-8",
					)}
				>
					<div
						data-app-region={isDesktopMac ? "no-drag" : undefined}
						className="flex items-center gap-2"
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
						<Breadcrumb>
							<BreadcrumbList>
								{breadcrumbDetailLabel ? (
									<>
										<BreadcrumbItem className="hidden md:block">
											<BreadcrumbLink asChild>
												<button
													type="button"
													className="cursor-pointer"
													onClick={handleBreadcrumbSectionClick}
												>
													{breadcrumbSectionLabel}
												</button>
											</BreadcrumbLink>
										</BreadcrumbItem>
										<BreadcrumbSeparator className="hidden md:block" />
										<BreadcrumbItem>
											<BreadcrumbPage>{breadcrumbDetailLabel}</BreadcrumbPage>
										</BreadcrumbItem>
									</>
								) : (
									<BreadcrumbItem>
										<BreadcrumbPage>{breadcrumbSectionLabel}</BreadcrumbPage>
									</BreadcrumbItem>
								)}
							</BreadcrumbList>
						</Breadcrumb>
					</div>
					<div
						data-app-region={isDesktopMac ? "no-drag" : undefined}
						className="ml-auto"
					>
						{currentView === "home" ? (
							<Button variant="outline" onClick={handleCreateQuickNote}>
								<Plus />
								Quick note
							</Button>
						) : currentView === "quick-note" && currentQuickNoteId ? (
							<QuickNoteActionsMenu
								noteId={currentQuickNoteId}
								onMoveToTrash={handleQuickNoteTrashed}
								align="end"
								itemsBeforeDefaults={
									currentQuickNoteEditorActions ? (
										<DropdownMenuItem
											className="cursor-pointer"
											disabled={!currentQuickNoteEditorActions.canCopyText}
											onSelect={(event) => {
												event.preventDefault();
												currentQuickNoteEditorActions.copyText();
											}}
										>
											<Copy />
											Copy text
										</DropdownMenuItem>
									) : null
								}
								itemsAfterDefaults={
									currentQuickNoteEditorActions ? (
										<>
											<DropdownMenuItem
												className="cursor-pointer"
												disabled={!currentQuickNoteEditorActions.canUndo}
												onSelect={(event) => {
													event.preventDefault();
													currentQuickNoteEditorActions.undo();
												}}
											>
												<Undo2 />
												Undo
											</DropdownMenuItem>
											<DropdownMenuItem
												className="cursor-pointer"
												disabled={!currentQuickNoteEditorActions.canRedo}
												onSelect={(event) => {
													event.preventDefault();
													currentQuickNoteEditorActions.redo();
												}}
											>
												<Redo2 />
												Redo
											</DropdownMenuItem>
											<DropdownMenuItem
												className="cursor-pointer"
												disabled={!currentQuickNoteEditorActions.canCopyText}
												onSelect={(event) => {
													event.preventDefault();
													currentQuickNoteEditorActions.exportNote();
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
									aria-label={`Open actions for ${currentQuickNoteTitle || "note"}`}
								>
									<MoreHorizontal className="size-4" />
								</Button>
							</QuickNoteActionsMenu>
						) : currentView === "chat" ? (
							<Button variant="outline" onClick={handleNewChat}>
								<Plus />
								New chat
							</Button>
						) : null}
					</div>
				</header>
				{currentView === "home" ? (
					<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
						<div className="flex w-full max-w-5xl flex-col gap-6 pt-2 md:pt-4">
							<section className="mx-auto w-full max-w-xl space-y-6">
								<h1 className="text-lg md:text-xl">Coming up</h1>
								<Card className="min-h-[176px] rounded-xl border-border py-0 shadow-sm">
									<CardContent className="p-5">
										<div className="flex flex-col gap-6 md:flex-row md:items-start">
											<div className="grid w-fit shrink-0 grid-cols-[auto_auto] items-start gap-x-3 gap-y-1 pt-1">
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
											<div className="ml-auto flex min-h-[176px] w-full items-center justify-center">
												<Empty className="min-h-[176px] rounded-xl border border-solid border-border px-4 py-5">
													<EmptyHeader>
														<EmptyMedia variant="icon">
															<CalendarClock className="size-4" />
														</EmptyMedia>
														<EmptyTitle>No upcoming events</EmptyTitle>
														<EmptyDescription>
															Check your visible calendars
														</EmptyDescription>
													</EmptyHeader>
													<EmptyContent>
														<Button variant="outline">Calendar settings</Button>
													</EmptyContent>
												</Empty>
											</div>
										</div>
									</CardContent>
								</Card>
							</section>

							<section className="flex justify-center py-8">
								{quickNotes === undefined ? (
									<HomeQuickNotesSkeleton />
								) : quickNotes.length > 0 ? (
									<HomeQuickNotesList
										notes={quickNotes}
										activeNoteId={currentQuickNoteId}
										activeNoteTitle={currentQuickNoteTitle}
										currentUserName={user.name}
										onOpenNote={openQuickNote}
										onQuickNoteTrashed={handleQuickNoteTrashed}
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
											<Button onClick={handleCreateQuickNote}>
												Quick note
											</Button>
										</EmptyContent>
									</Empty>
								)}
							</section>
						</div>
					</div>
				) : currentView === "shared" ? (
					<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
						<div className="flex w-full max-w-5xl flex-col gap-6 pt-2 md:pt-4">
							<section className="mx-auto w-full max-w-xl space-y-6">
								<h1 className="text-lg md:text-xl">Shared with others</h1>
							</section>
							<section className="flex justify-center py-8">
								{sharedNotes === undefined ? (
									<SharedQuickNotesSkeleton />
								) : sharedNotes.length > 0 ? (
									<SharedQuickNotesList
										notes={sharedNotes}
										activeNoteId={currentQuickNoteId}
										activeNoteTitle={currentQuickNoteTitle}
										currentUserName={user.name}
										onOpenNote={openQuickNote}
										onQuickNoteTrashed={handleQuickNoteTrashed}
									/>
								) : (
									<Empty className="max-w-xl">
										<EmptyHeader>
											<EmptyTitle>No shared notes yet</EmptyTitle>
											<EmptyDescription>
												When you share a note with someone else, it will show up
												here
											</EmptyDescription>
										</EmptyHeader>
									</Empty>
								)}
							</section>
						</div>
					</div>
				) : currentView === "quick-note" ? (
					<QuickNotePage
						noteId={currentQuickNoteId}
						onTitleChange={setCurrentQuickNoteTitle}
						onEditorActionsChange={setCurrentQuickNoteEditorActions}
					/>
				) : (
					<ChatPage
						key={chatComposerId}
						chatId={chatComposerId}
						initialMessages={initialChatMessages}
						onChatPersisted={handleChatPersisted}
						chats={chats ?? []}
						isChatsLoading={chats === undefined}
						activeChatId={currentChatId}
						onOpenChat={handleOpenChat}
						onChatRemoved={handleChatRemoved}
					/>
				)}
			</SidebarInset>
		</SidebarProvider>
	);
}

function HomeQuickNotesSkeleton() {
	return (
		<div className="w-full max-w-xl space-y-3">
			<div className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-foreground/70">
				Today
			</div>
			<div className="space-y-2">
				{HOME_QUICK_NOTE_SKELETON_IDS.map((id) => (
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

function SharedQuickNotesSkeleton() {
	return (
		<div className="w-full max-w-xl space-y-3">
			<div className="flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-medium text-foreground/70">
				Today
			</div>
			<div className="space-y-2">
				{HOME_QUICK_NOTE_SKELETON_IDS.map((id) => (
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

function SharedQuickNotesList({
	notes,
	activeNoteId,
	activeNoteTitle,
	currentUserName,
	onOpenNote,
	onQuickNoteTrashed,
}: {
	notes: Array<Doc<"quickNotes">>;
	activeNoteId: Id<"quickNotes"> | null;
	activeNoteTitle: string;
	currentUserName: string;
	onOpenNote: (noteId: Id<"quickNotes">) => void;
	onQuickNoteTrashed: (noteId: Id<"quickNotes">) => void;
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
										<QuickNoteActionsMenu
											noteId={note._id}
											onMoveToTrash={onQuickNoteTrashed}
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
										</QuickNoteActionsMenu>
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

function HomeQuickNotesList({
	notes,
	activeNoteId,
	activeNoteTitle,
	currentUserName,
	onOpenNote,
	onQuickNoteTrashed,
}: {
	notes: Array<Doc<"quickNotes">>;
	activeNoteId: Id<"quickNotes"> | null;
	activeNoteTitle: string;
	currentUserName: string;
	onOpenNote: (noteId: Id<"quickNotes">) => void;
	onQuickNoteTrashed: (noteId: Id<"quickNotes">) => void;
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
										<QuickNoteActionsMenu
											noteId={note._id}
											onMoveToTrash={onQuickNoteTrashed}
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
										</QuickNoteActionsMenu>
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
	isDesktopMac,
	onGitHubSignIn,
}: {
	error: string | null;
	isAuthenticating: boolean;
	isDesktopMac: boolean;
	onGitHubSignIn: () => void;
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
				isDesktopMac={isDesktopMac}
				onGitHubSignIn={onGitHubSignIn}
			/>
		</div>
	);
}

function LoginForm({
	className,
	error,
	isAuthenticating,
	isDesktopMac,
	onGitHubSignIn,
	...props
}: React.ComponentProps<"div"> & {
	error: string | null;
	isAuthenticating: boolean;
	isDesktopMac: boolean;
	onGitHubSignIn: () => void;
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
					<CardDescription>Login with your GitHub account</CardDescription>
				</CardHeader>
				<CardContent>
					<form>
						<FieldGroup>
							<Field>
								<Button
									variant="outline"
									type="button"
									className="w-full"
									onClick={onGitHubSignIn}
									disabled={isAuthenticating || !hasAcceptedTerms}
								>
									{isAuthenticating ? (
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

function OpenGranMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
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
