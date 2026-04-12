"use client";

import { Button } from "@workspace/ui/components/button";
import { Calendar, CalendarDayButton } from "@workspace/ui/components/calendar";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import { Kbd } from "@workspace/ui/components/kbd";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import {
	CalendarDays,
	ChevronDown,
	FileText,
	FolderClosed,
	GalleryHorizontalEnd,
	ListFilter,
	type LucideIcon,
} from "lucide-react";
import * as React from "react";
import type { DateRange } from "react-day-picker";

export interface SearchCommandItem {
	id: string;
	title: string;
	kind: "note" | "chat";
	icon: LucideIcon;
	preview?: string;
	projectId?: string;
	projectName?: string;
	updatedAt?: number;
}

export interface SearchCommandProject {
	id: string;
	name: string;
}

interface SearchCommandProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: SearchCommandItem[];
	projects: SearchCommandProject[];
	onSelectItem: (itemId: string) => void;
}

type SearchFiltersState = {
	projectFilter: "all" | "notes" | string;
	filtersVisible: boolean;
	dateFilter: "all" | "today" | "last7" | "last30" | "custom";
	dateRange: DateRange | undefined;
	projectPopoverOpen: boolean;
	datePopoverOpen: boolean;
	projectSearchValue: string;
};

const INITIAL_SEARCH_FILTERS_STATE: SearchFiltersState = {
	projectFilter: "all",
	filtersVisible: false,
	dateFilter: "all",
	dateRange: undefined,
	projectPopoverOpen: false,
	datePopoverOpen: false,
	projectSearchValue: "",
};

const reduceSearchFiltersState = (
	state: SearchFiltersState,
	patch: Partial<SearchFiltersState>,
) => ({ ...state, ...patch });

function useSearchCommandFilters({
	open,
	projects,
}: {
	open: boolean;
	projects: SearchCommandProject[];
}) {
	const [state, setState] = React.useReducer(
		reduceSearchFiltersState,
		INITIAL_SEARCH_FILTERS_STATE,
	);
	const {
		projectFilter,
		filtersVisible,
		dateFilter,
		dateRange,
		projectPopoverOpen,
		datePopoverOpen,
		projectSearchValue,
	} = state;

	React.useEffect(() => {
		if (!open) {
			setState(INITIAL_SEARCH_FILTERS_STATE);
		}
	}, [open]);

	React.useEffect(() => {
		if (!projectPopoverOpen) {
			setState({ projectSearchValue: "" });
		}
	}, [projectPopoverOpen]);

	React.useEffect(() => {
		if (
			projectFilter !== "all" &&
			projectFilter !== "notes" &&
			!projects.some((project) => project.id === projectFilter)
		) {
			setState({ projectFilter: "all" });
		}
	}, [projectFilter, projects]);

	const hideFilters = React.useCallback(() => {
		setState({
			filtersVisible: false,
			projectFilter: "all",
			dateFilter: "all",
			dateRange: undefined,
			projectPopoverOpen: false,
			datePopoverOpen: false,
			projectSearchValue: "",
		});
	}, []);

	return {
		projectFilter,
		filtersVisible,
		dateFilter,
		dateRange,
		projectPopoverOpen,
		datePopoverOpen,
		projectSearchValue,
		setState,
		hideFilters,
	};
}

function SearchCommandFilters({
	projects,
	projectFilter,
	filtersVisible,
	dateFilter,
	dateRange,
	projectPopoverOpen,
	datePopoverOpen,
	projectSearchValue,
	activeProject,
	filteredProjects,
	projectFilterLabel,
	projectFilterIcon,
	dateFilterLabel,
	onOpenChange,
	setState,
	hideFilters,
}: {
	projects: SearchCommandProject[];
	projectFilter: "all" | "notes" | string;
	filtersVisible: boolean;
	dateFilter: "all" | "today" | "last7" | "last30" | "custom";
	dateRange: DateRange | undefined;
	projectPopoverOpen: boolean;
	datePopoverOpen: boolean;
	projectSearchValue: string;
	activeProject: SearchCommandProject | null;
	filteredProjects: SearchCommandProject[];
	projectFilterLabel: string;
	projectFilterIcon: LucideIcon;
	dateFilterLabel: string;
	onOpenChange: (open: boolean) => void;
	setState: React.ActionDispatch<[patch: Partial<SearchFiltersState>]>;
	hideFilters: () => void;
}) {
	void activeProject;

	return (
		<>
			<div className="flex items-start gap-1 px-1 pt-1">
				<div className="relative min-w-0 flex-1">
					<CommandInput placeholder="Search notes..." className="pr-14" />
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="absolute top-5 right-4 z-10 flex -translate-y-1/2 items-center"
						aria-label="Close search"
					>
						<Kbd className="font-mono text-[10px]">Esc</Kbd>
					</button>
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							aria-pressed={filtersVisible}
							aria-label={filtersVisible ? "Hide filters" : "Show filters"}
							onClick={() => {
								if (filtersVisible) {
									hideFilters();
									return;
								}

								setState({ filtersVisible: true });
							}}
							className={cn(
								"mt-1 size-8 rounded-lg p-0 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground",
								filtersVisible && "bg-muted text-foreground",
							)}
						>
							<ListFilter className="size-3.5" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{filtersVisible ? "Hide filters" : "Show filters"}
					</TooltipContent>
				</Tooltip>
			</div>
			{filtersVisible ? (
				<div className="flex items-center gap-1.5 px-2 pb-2">
					{projects.length > 0 ? (
						<Popover
							open={projectPopoverOpen}
							onOpenChange={(nextOpen) =>
								setState({ projectPopoverOpen: nextOpen })
							}
						>
							<PopoverTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className={cn(
										"h-7 rounded-full border border-transparent bg-transparent px-2.5 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground aria-expanded:border-border/60 aria-expanded:bg-muted aria-expanded:text-foreground",
										projectFilter !== "all" && "bg-muted text-foreground",
									)}
								>
									{React.createElement(projectFilterIcon, {
										className: "size-3.5",
									})}
									<span className="truncate">{projectFilterLabel}</span>
									<ChevronDown className="size-3.5 opacity-70" />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								align="start"
								sideOffset={6}
								className="w-64 gap-0 p-1.5"
							>
								<Command shouldFilter={false} className="bg-transparent p-0">
									<div className="pb-1.5">
										<CommandInput
											value={projectSearchValue}
											onValueChange={(value) =>
												setState({ projectSearchValue: value })
											}
											placeholder="Search sources"
										/>
									</div>
									<CommandList className="max-h-64">
										<div className="flex flex-col gap-1 px-1 py-1">
											<SearchProjectFilterOption
												icon={GalleryHorizontalEnd}
												label="All"
												selected={projectFilter === "all"}
												onSelect={() => {
													setState({
														projectFilter: "all",
														projectPopoverOpen: false,
													});
												}}
											/>
											<SearchProjectFilterOption
												icon={FileText}
												label="Notes"
												selected={projectFilter === "notes"}
												onSelect={() => {
													setState({
														projectFilter: "notes",
														projectPopoverOpen: false,
													});
												}}
											/>
											{filteredProjects.length > 0 ? (
												filteredProjects.map((project) => (
													<SearchProjectFilterOption
														key={project.id}
														icon={FolderClosed}
														label={project.name}
														selected={projectFilter === project.id}
														onSelect={() => {
															setState({
																projectFilter: project.id,
																projectPopoverOpen: false,
															});
														}}
													/>
												))
											) : (
												<div className="px-2 py-3 text-sm text-muted-foreground">
													No projects found.
												</div>
											)}
										</div>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					) : null}
					<Popover
						open={datePopoverOpen}
						onOpenChange={(nextOpen) => setState({ datePopoverOpen: nextOpen })}
					>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className={cn(
									"h-7 rounded-full border border-transparent bg-transparent px-2.5 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground aria-expanded:border-border/60 aria-expanded:bg-muted aria-expanded:text-foreground",
									dateFilter !== "all" && "bg-muted text-foreground",
								)}
							>
								<CalendarDays className="size-3.5" />
								<span className="truncate">{dateFilterLabel}</span>
								<ChevronDown className="size-3.5 opacity-70" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="start"
							sideOffset={6}
							className="w-fit gap-0 p-0"
						>
							<div className="flex flex-col gap-0.5 border-b border-border/80 px-2 pt-2 pb-2">
								<SearchDatePresetOption
									label="Today"
									selected={dateFilter === "today"}
									onSelect={() => {
										setState({
											dateFilter: "today",
											dateRange: undefined,
											datePopoverOpen: false,
										});
									}}
								/>
								<SearchDatePresetOption
									label="Last 7 days"
									selected={dateFilter === "last7"}
									onSelect={() => {
										setState({
											dateFilter: "last7",
											dateRange: undefined,
											datePopoverOpen: false,
										});
									}}
								/>
								<SearchDatePresetOption
									label="Last 30 days"
									selected={dateFilter === "last30"}
									onSelect={() => {
										setState({
											dateFilter: "last30",
											dateRange: undefined,
											datePopoverOpen: false,
										});
									}}
								/>
							</div>
							<div className="px-2 py-2">
								<Calendar
									mode="range"
									selected={dateRange}
									defaultMonth={dateRange?.from ?? new Date()}
									classNames={{
										today:
											"rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-(--cell-radius)",
									}}
									components={{
										DayButton: SearchDateCalendarDayButton,
									}}
									onSelect={(range) => {
										setState({
											dateRange: range,
											dateFilter: range?.from ? "custom" : "all",
										});
									}}
									className="p-0"
								/>
							</div>
							<div className="border-t border-border/80 px-3 py-2">
								<button
									type="button"
									onClick={() => {
										setState({
											dateFilter: "all",
											dateRange: undefined,
											datePopoverOpen: false,
										});
									}}
									className="cursor-pointer text-sm hover:text-foreground"
								>
									Clear
								</button>
							</div>
						</PopoverContent>
					</Popover>
				</div>
			) : null}
		</>
	);
}

export function SearchCommand({
	open,
	onOpenChange,
	items,
	projects,
	onSelectItem,
}: SearchCommandProps) {
	const {
		projectFilter,
		filtersVisible,
		dateFilter,
		dateRange,
		projectPopoverOpen,
		datePopoverOpen,
		projectSearchValue,
		setState,
		hideFilters,
	} = useSearchCommandFilters({ open, projects });

	const dateFilteredItems = React.useMemo(
		() =>
			items.filter((item) =>
				matchesDateFilter(item.updatedAt, dateFilter, dateRange),
			),
		[dateFilter, dateRange, items],
	);

	const noteItems = React.useMemo(
		() =>
			dateFilteredItems.filter((item) => {
				if (item.kind !== "note") {
					return false;
				}

				if (projectFilter === "all") {
					return true;
				}

				if (projectFilter === "notes") {
					return !item.projectId;
				}

				return item.projectId === projectFilter;
			}),
		[dateFilteredItems, projectFilter],
	);
	const groupedNotes = React.useMemo(
		() => groupSearchItemsByDate(noteItems),
		[noteItems],
	);
	const noteSections = React.useMemo(
		() =>
			[
				{ key: "today", label: "Today", items: groupedNotes.today },
				{ key: "yesterday", label: "Yesterday", items: groupedNotes.yesterday },
				{ key: "lastWeek", label: "Last 7 days", items: groupedNotes.lastWeek },
				{
					key: "lastMonth",
					label: "Last 30 days",
					items: groupedNotes.lastMonth,
				},
				{ key: "older", label: "Older", items: groupedNotes.older },
			] as const,
		[groupedNotes],
	);
	const activeProject = React.useMemo(
		() => projects.find((project) => project.id === projectFilter) ?? null,
		[projectFilter, projects],
	);
	const filteredProjects = React.useMemo(() => {
		const normalizedSearch = projectSearchValue.trim().toLowerCase();

		if (!normalizedSearch) {
			return projects;
		}

		return projects.filter((project) =>
			project.name.toLowerCase().includes(normalizedSearch),
		);
	}, [projectSearchValue, projects]);
	const projectFilterLabel =
		projectFilter === "all"
			? "All"
			: projectFilter === "notes"
				? "Notes"
				: (activeProject?.name ?? "Project");
	const projectFilterIcon =
		projectFilter === "all"
			? GalleryHorizontalEnd
			: projectFilter === "notes"
				? FileText
				: FolderClosed;
	const dateFilterLabel = getDateFilterLabel(dateFilter, dateRange);
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search"
			description="Search notes..."
			className="top-1/2 max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-lg sm:max-w-lg"
		>
			<Command className="**:[[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 **:[[cmdk-group-heading]]:px-1.5 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 **:[[cmdk-input-wrapper]_svg]:size-5 **:[[cmdk-input]]:h-12">
				<SearchCommandFilters
					projects={projects}
					projectFilter={projectFilter}
					filtersVisible={filtersVisible}
					dateFilter={dateFilter}
					dateRange={dateRange}
					projectPopoverOpen={projectPopoverOpen}
					datePopoverOpen={datePopoverOpen}
					projectSearchValue={projectSearchValue}
					activeProject={activeProject}
					filteredProjects={filteredProjects}
					projectFilterLabel={projectFilterLabel}
					projectFilterIcon={projectFilterIcon}
					dateFilterLabel={dateFilterLabel}
					onOpenChange={onOpenChange}
					setState={setState}
					hideFilters={hideFilters}
				/>
				<CommandList className="h-[22rem] max-h-[calc(100vh-14rem)] min-h-[14rem]">
					<CommandEmpty>No results found.</CommandEmpty>
					{noteSections.map((section) =>
						section.items.length > 0 ? (
							<CommandGroup key={section.key} heading={section.label}>
								{section.items.map((item) => (
									<SearchCommandRow
										key={item.id}
										item={item}
										onSelect={() => {
											onOpenChange(false);
											onSelectItem(item.id);
										}}
									/>
								))}
							</CommandGroup>
						) : null,
					)}
				</CommandList>
			</Command>
		</CommandDialog>
	);
}

function SearchCommandRow({
	item,
	onSelect,
}: {
	item: SearchCommandItem;
	onSelect: () => void;
}) {
	return (
		<CommandItem
			value={`${item.kind} ${item.id} ${item.title} ${item.projectName ?? ""} ${item.preview ?? ""}`}
			onSelect={onSelect}
			className="h-8 cursor-pointer gap-1.5 rounded-md px-1.5"
		>
			<div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
				<item.icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1 truncate">{item.title}</div>
		</CommandItem>
	);
}

function SearchProjectFilterOption({
	icon: Icon,
	label,
	selected,
	onSelect,
}: {
	icon?: LucideIcon;
	label: string;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<CommandItem
			value={label}
			onSelect={onSelect}
			data-checked={selected}
			className={cn(
				"h-8 cursor-pointer gap-1.5 rounded-md px-1.5",
				selected && "bg-muted text-foreground",
			)}
		>
			<div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
				{Icon ? <Icon className="size-4" /> : null}
			</div>
			<div className="min-w-0 flex-1 truncate">{label}</div>
		</CommandItem>
	);
}

function SearchDatePresetOption({
	label,
	selected,
	onSelect,
}: {
	label: string;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			className={cn(
				"flex h-8 w-full cursor-pointer items-center rounded-lg px-2 text-sm text-foreground transition-colors hover:bg-muted",
				selected && "bg-muted",
			)}
		>
			<span className="truncate">{label}</span>
		</button>
	);
}

function SearchDateCalendarDayButton(
	props: React.ComponentProps<typeof CalendarDayButton>,
) {
	const { modifiers } = props;
	const isToday = Boolean(modifiers.today);
	const isSelected = Boolean(
		modifiers.selected ||
			modifiers.range_start ||
			modifiers.range_middle ||
			modifiers.range_end,
	);

	return (
		<CalendarDayButton
			{...props}
			className={cn(
				props.className,
				isToday && !isSelected && "text-destructive",
				isToday &&
					"data-[selected-single=true]:bg-destructive/15 data-[selected-single=true]:text-destructive dark:data-[selected-single=true]:bg-destructive/25 data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:bg-destructive/15 data-[range-start=true]:text-destructive dark:data-[range-start=true]:bg-destructive/25 data-[range-middle=true]:bg-destructive/15 data-[range-middle=true]:text-destructive dark:data-[range-middle=true]:bg-destructive/25 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:bg-destructive/15 data-[range-end=true]:text-destructive dark:data-[range-end=true]:bg-destructive/25",
			)}
		/>
	);
}

type GroupedSearchItems = {
	today: SearchCommandItem[];
	yesterday: SearchCommandItem[];
	lastWeek: SearchCommandItem[];
	lastMonth: SearchCommandItem[];
	older: SearchCommandItem[];
};

function groupSearchItemsByDate(
	items: SearchCommandItem[],
): GroupedSearchItems {
	const now = new Date();
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
	const oneMonthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

	return items.reduce<GroupedSearchItems>(
		(groups, item) => {
			if (!item.updatedAt) {
				groups.older.push(item);
				return groups;
			}

			const itemDate = new Date(item.updatedAt);

			if (isSameCalendarDay(itemDate, now)) {
				groups.today.push(item);
			} else if (isSameCalendarDay(itemDate, yesterday)) {
				groups.yesterday.push(item);
			} else if (itemDate.getTime() > oneWeekAgo) {
				groups.lastWeek.push(item);
			} else if (itemDate.getTime() > oneMonthAgo) {
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
}

function isSameCalendarDay(left: Date, right: Date) {
	return (
		left.getFullYear() === right.getFullYear() &&
		left.getMonth() === right.getMonth() &&
		left.getDate() === right.getDate()
	);
}

function matchesDateFilter(
	updatedAt: number | undefined,
	filter: "all" | "today" | "last7" | "last30" | "custom",
	range: DateRange | undefined,
) {
	if (filter === "all") {
		return true;
	}

	if (!updatedAt) {
		return false;
	}

	const now = new Date();

	if (filter === "today") {
		return (
			updatedAt >= startOfDay(now).getTime() &&
			updatedAt <= endOfDay(now).getTime()
		);
	}

	if (filter === "last7") {
		return (
			updatedAt >= startOfDay(daysAgo(6)).getTime() &&
			updatedAt <= endOfDay(now).getTime()
		);
	}

	if (filter === "last30") {
		return (
			updatedAt >= startOfDay(daysAgo(29)).getTime() &&
			updatedAt <= endOfDay(now).getTime()
		);
	}

	if (!range?.from) {
		return true;
	}

	const from = startOfDay(range.from).getTime();
	const to = endOfDay(range.to ?? range.from).getTime();
	return updatedAt >= from && updatedAt <= to;
}

function getDateFilterLabel(
	filter: "all" | "today" | "last7" | "last30" | "custom",
	range: DateRange | undefined,
) {
	if (filter === "all") {
		return "Date";
	}

	if (filter === "today") {
		return "Today";
	}

	if (filter === "last7") {
		return "Last 7 days";
	}

	if (filter === "last30") {
		return "Last 30 days";
	}

	if (!range?.from) {
		return "Date";
	}

	return formatDateRange(range);
}

function formatDateRange(range: DateRange) {
	if (!range.from) {
		return "Date";
	}

	const formatter = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	});

	if (!range.to) {
		return formatter.format(range.from);
	}

	return `${formatter.format(range.from)} - ${formatter.format(range.to)}`;
}

function startOfDay(date: Date) {
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
		0,
		0,
		0,
		0,
	);
}

function endOfDay(date: Date) {
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
		23,
		59,
		59,
		999,
	);
}

function daysAgo(days: number) {
	const date = new Date();
	date.setDate(date.getDate() - days);
	return date;
}
