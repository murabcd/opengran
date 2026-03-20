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
import { cn } from "@workspace/ui/lib/utils";
import { AlertCircle, CalendarClock, LoaderCircle, Plus } from "lucide-react";
import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPage } from "@/components/chat/chat-page";
import { QuickNotePage } from "@/components/quick-note/quick-note-page";
import { type AuthSession, authClient } from "@/lib/auth-client";

type AppUser = {
	name: string;
	email: string;
	avatar: string;
};

export function App() {
	const { data: session } = authClient.useSession();
	const [authError, setAuthError] = React.useState<string | null>(null);
	const [isAuthenticating, startAuthentication] = React.useTransition();
	const [isDesktopMac, setIsDesktopMac] = React.useState(false);

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

		if (window.location.pathname === "/quick-note") {
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
	const [chatSession, setChatSession] = React.useState(0);
	const [quickNoteSession, setQuickNoteSession] = React.useState(0);
	const [isDesktopMac, setIsDesktopMac] = React.useState(initialDesktopMac);
	const [settingsOpen, setSettingsOpen] = React.useState(false);
	const [isSigningOut, startSignOut] = React.useTransition();
	const user = React.useMemo(() => toAppUser(session), [session]);

	React.useEffect(() => {
		const syncViewFromLocation = () => {
			const nextSettingsOpen = window.location.hash === "#settings";
			const nextView =
				window.location.pathname === "/quick-note" ||
				window.location.hash === "#quick-note"
					? "quick-note"
					: window.location.pathname === "/chat" ||
							window.location.hash === "#chat"
						? "chat"
						: window.location.pathname === "/shared" ||
								window.location.hash === "#shared"
							? "shared"
							: "home";

			setCurrentView(nextView);

			const nextPath =
				nextView === "quick-note"
					? "/quick-note"
					: nextView === "chat"
						? "/chat"
						: nextView === "shared"
							? "/shared"
							: "/home";
			const nextLocation = `${nextPath}${nextSettingsOpen ? "#settings" : ""}`;
			if (
				window.location.pathname !== nextPath ||
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
		void window.openGranDesktop
			?.getMeta()
			.then((meta) => {
				setIsDesktopMac(meta.platform === "darwin");
			})
			.catch(() => {
				setIsDesktopMac(false);
			});
	}, []);

	const handleViewChange = React.useCallback(
		(view: "home" | "chat" | "shared" | "quick-note") => {
			setCurrentView(view);
			setSettingsOpen(false);
			window.history.pushState(
				null,
				"",
				view === "quick-note"
					? "/quick-note"
					: view === "chat"
						? "/chat"
						: view === "shared"
							? "/shared"
							: "/home",
			);
		},
		[],
	);

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

	return (
		<SidebarProvider>
			<AppSidebar
				currentView={currentView}
				user={user}
				onViewChange={handleViewChange}
				settingsOpen={settingsOpen}
				onSettingsOpenChange={handleSettingsOpenChange}
				onSignOut={handleSignOut}
				signingOut={isSigningOut}
				desktopSafeTop={isDesktopMac}
			/>
			<SidebarInset>
				<header
					data-app-region={isDesktopMac ? "drag" : undefined}
					className={cn(
						"sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6",
						isDesktopMac && "h-24 pt-8",
					)}
				>
					<div
						data-app-region={isDesktopMac ? "no-drag" : undefined}
						className="flex items-center gap-2"
					>
						<SidebarTrigger className="-ml-1" />
						<Separator
							orientation="vertical"
							className="mr-2 data-[orientation=vertical]:h-4"
						/>
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem className="hidden md:block">
									<BreadcrumbLink asChild>
										<button
											type="button"
											onClick={() => handleViewChange("home")}
										>
											OpenGran
										</button>
									</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden md:block" />
								<BreadcrumbItem>
									<BreadcrumbPage>
										{currentView === "home"
											? "Home"
											: currentView === "quick-note"
												? "Quick note"
												: currentView === "shared"
													? "Shared with others"
													: "Chat"}
									</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>
					<div
						data-app-region={isDesktopMac ? "no-drag" : undefined}
						className="ml-auto"
					>
						{currentView === "home" || currentView === "quick-note" ? (
							<Button
								variant="outline"
								onClick={() => {
									handleViewChange("quick-note");
									setQuickNoteSession((current) => current + 1);
								}}
							>
								<Plus />
								Quick note
							</Button>
						) : currentView === "chat" ? (
							<Button
								variant="outline"
								onClick={() => {
									handleViewChange("chat");
									setChatSession((current) => current + 1);
								}}
							>
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
											<div className="flex shrink-0 items-start gap-3 pt-1">
												<div className="text-5xl leading-none tracking-tight">
													20
												</div>
												<div className="pt-1 leading-none">
													<div className="flex items-center gap-2 text-base">
														<span>March</span>
														<span className="size-2 rounded-full bg-primary" />
													</div>
													<p className="mt-1 text-base text-muted-foreground">
														Fri
													</p>
												</div>
											</div>
											<Card className="ml-auto w-full rounded-xl border-border py-0 shadow-none">
												<CardContent className="p-3">
													<Empty className="min-h-[176px] rounded-xl border-border">
														<EmptyHeader>
															<EmptyMedia variant="icon">
																<CalendarClock className="size-6" />
															</EmptyMedia>
															<EmptyTitle>No upcoming events</EmptyTitle>
															<EmptyDescription>
																Check your visible calendars
															</EmptyDescription>
														</EmptyHeader>
														<EmptyContent>
															<Button variant="outline">
																Calendar settings
															</Button>
														</EmptyContent>
													</Empty>
												</CardContent>
											</Card>
										</div>
									</CardContent>
								</Card>
							</section>

							<section className="flex justify-center py-8">
								<Empty className="max-w-xl">
									<EmptyHeader>
										<EmptyTitle className="text-base">
											Take your first note
										</EmptyTitle>
										<EmptyDescription>
											Your meeting notes will appear here
										</EmptyDescription>
									</EmptyHeader>
									<EmptyContent>
										<Button
											onClick={() => {
												handleViewChange("quick-note");
												setQuickNoteSession((current) => current + 1);
											}}
										>
											Quick note
										</Button>
									</EmptyContent>
								</Empty>
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
								<Empty className="max-w-xl">
									<EmptyHeader>
										<EmptyTitle className="text-base">
											No shared notes yet
										</EmptyTitle>
										<EmptyDescription>
											When you share a note with someone else, it will show up
											here
										</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</section>
						</div>
					</div>
				) : currentView === "quick-note" ? (
					<QuickNotePage key={quickNoteSession} />
				) : (
					<ChatPage key={chatSession} />
				)}
			</SidebarInset>
		</SidebarProvider>
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
