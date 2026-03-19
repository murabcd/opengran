import { CalendarClock, Plus } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
	return (
		<SidebarProvider>
			<AppSidebar />
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
									<BreadcrumbLink href="#">OpenMeet</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="hidden md:block" />
								<BreadcrumbItem>
									<BreadcrumbPage>Home</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>
					<div className="ml-auto">
						<Button variant="outline">
							<Plus />
							Quick note
						</Button>
					</div>
				</header>
				<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
					<div className="flex w-full max-w-5xl flex-col gap-8 pt-2 md:pt-4">
						<section className="mx-auto w-full max-w-4xl space-y-4">
							<h1 className="text-lg md:text-xl">Coming up</h1>
							<div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
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
									<div className="ml-auto w-full max-w-3xl rounded-3xl border border-border p-3">
										<Empty className="min-h-[240px] rounded-3xl border-border">
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
												<Button variant="outline">Calendar settings</Button>
											</EmptyContent>
										</Empty>
									</div>
								</div>
							</div>
						</section>

						<section className="flex justify-center py-8">
							<Empty className="max-w-md">
								<EmptyHeader>
									<EmptyTitle className="text-base">
										Take your first note
									</EmptyTitle>
									<EmptyDescription>
										Your meeting notes will appear here after you start
										capturing conversations.
									</EmptyDescription>
								</EmptyHeader>
								<EmptyContent>
									<Button>Quick Note</Button>
								</EmptyContent>
							</Empty>
						</section>
					</div>
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

export default App;
