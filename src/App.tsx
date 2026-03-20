import { CalendarClock, Plus } from "lucide-react";
import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatPage } from "@/components/chat/chat-page";
import { QuickNotePage } from "@/components/quick-note/quick-note-page";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";

export function App() {
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

	React.useEffect(() => {
		const syncViewFromLocation = () => {
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
			if (window.location.pathname !== nextPath || window.location.hash) {
				window.history.replaceState(null, "", nextPath);
			}
		};

		syncViewFromLocation();
		window.addEventListener("popstate", syncViewFromLocation);

		return () => {
			window.removeEventListener("popstate", syncViewFromLocation);
		};
	}, []);

	const handleViewChange = React.useCallback(
		(view: "home" | "chat" | "shared" | "quick-note") => {
			setCurrentView(view);
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

	return (
		<SidebarProvider>
			<AppSidebar currentView={currentView} onViewChange={handleViewChange} />
			<SidebarInset>
				<header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between bg-background/95 px-4 backdrop-blur transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6">
					<div className="flex items-center gap-2">
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
											OpenMeet
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
					<div className="ml-auto">
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

export default App;
