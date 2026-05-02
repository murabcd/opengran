"use client";

import { Button } from "@workspace/ui/components/button";
import {
	Calendar,
	CalendarDayButton,
	type DateRange,
} from "@workspace/ui/components/calendar";
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
	Folder,
	GalleryHorizontalEnd,
	ListFilter,
	type LucideIcon,
	MessageCircle,
} from "lucide-react";
import * as React from "react";
import {
	groupItemsByRelativeDate,
	RELATIVE_DATE_GROUP_SECTIONS,
} from "@/lib/group-by-relative-date";

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

type SearchSourceFilter = "all" | "notes" | "chats" | string;
type SearchCommandKind = SearchCommandItem["kind"];

const STATIC_SOURCE_FILTER_OPTIONS = [
	{
		value: "all",
		label: "All",
		icon: GalleryHorizontalEnd,
	},
	{
		value: "notes",
		label: "Notes",
		icon: FileText,
	},
	{
		value: "chats",
		label: "Chats",
		icon: MessageCircle,
	},
] as const;

interface SearchCommandProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: SearchCommandItem[];
	projects: SearchCommandProject[];
	onSelectItem: (itemId: string) => void;
	searchPlaceholder?: string;
	searchDescription?: string;
	filtersEnabled?: boolean;
	groupByDate?: boolean;
	showResultsOnEmptySearch?: boolean;
	filterKinds?: SearchCommandKind[];
	showKeyboardHintsFooter?: boolean;
}

type SearchFiltersState = {
	sourceFilter: SearchSourceFilter;
	searchValue: string;
	filtersVisible: boolean;
	dateFilter: "all" | "today" | "last7" | "last30" | "custom";
	dateRange: DateRange | undefined;
	sourcePopoverOpen: boolean;
	datePopoverOpen: boolean;
	sourceSearchValue: string;
};

const INITIAL_SEARCH_FILTERS_STATE: SearchFiltersState = {
	sourceFilter: "all",
	searchValue: "",
	filtersVisible: false,
	dateFilter: "all",
	dateRange: undefined,
	sourcePopoverOpen: false,
	datePopoverOpen: false,
	sourceSearchValue: "",
};

const searchDateRangeFormatter = new Intl.DateTimeFormat(undefined, {
	month: "short",
	day: "numeric",
});

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
		sourceFilter,
		searchValue,
		filtersVisible,
		dateFilter,
		dateRange,
		sourcePopoverOpen,
		datePopoverOpen,
		sourceSearchValue,
	} = state;

	React.useEffect(() => {
		if (!open) {
			setState(INITIAL_SEARCH_FILTERS_STATE);
		}
	}, [open]);

	React.useEffect(() => {
		if (!sourcePopoverOpen) {
			setState({ sourceSearchValue: "" });
		}
	}, [sourcePopoverOpen]);

	React.useEffect(() => {
		if (
			isProjectSourceFilter(sourceFilter) &&
			!projects.some((project) => project.id === sourceFilter)
		) {
			setState({ sourceFilter: "all" });
		}
	}, [projects, sourceFilter]);

	const hideFilters = React.useCallback(() => {
		setState({
			filtersVisible: false,
			sourceFilter: "all",
			searchValue: "",
			dateFilter: "all",
			dateRange: undefined,
			sourcePopoverOpen: false,
			datePopoverOpen: false,
			sourceSearchValue: "",
		});
	}, []);

	return {
		sourceFilter,
		searchValue,
		filtersVisible,
		dateFilter,
		dateRange,
		sourcePopoverOpen,
		datePopoverOpen,
		sourceSearchValue,
		setState,
		hideFilters,
	};
}

function SearchCommandFilters({
	sourceFilter,
	searchValue,
	filtersVisible,
	dateFilter,
	dateRange,
	sourcePopoverOpen,
	datePopoverOpen,
	sourceSearchValue,
	matchingProjects,
	sourceFilterLabel,
	sourceFilterIcon,
	sourceFilterOptions,
	searchPlaceholder,
	filtersEnabled,
	dateFilterLabel,
	onOpenChange,
	setState,
	hideFilters,
}: {
	sourceFilter: SearchSourceFilter;
	searchValue: string;
	filtersVisible: boolean;
	dateFilter: "all" | "today" | "last7" | "last30" | "custom";
	dateRange: DateRange | undefined;
	sourcePopoverOpen: boolean;
	datePopoverOpen: boolean;
	sourceSearchValue: string;
	matchingProjects: SearchCommandProject[];
	sourceFilterLabel: string;
	sourceFilterIcon: LucideIcon;
	sourceFilterOptions: (typeof STATIC_SOURCE_FILTER_OPTIONS)[number][];
	searchPlaceholder: string;
	filtersEnabled: boolean;
	dateFilterLabel: string;
	onOpenChange: (open: boolean) => void;
	setState: React.ActionDispatch<[patch: Partial<SearchFiltersState>]>;
	hideFilters: () => void;
}) {
	const [defaultCalendarMonth] = React.useState(() => new Date());
	const showTypeFilters = sourceFilterOptions.length > 1;

	return (
		<>
			<div className="flex items-start gap-1 px-1 pt-1">
				<div className="relative min-w-0 flex-1">
					<CommandInput
						value={searchValue}
						onValueChange={(value) => setState({ searchValue: value })}
						placeholder={searchPlaceholder}
						className="pr-14"
					/>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="absolute top-5 right-4 z-10 flex -translate-y-1/2 items-center"
						aria-label="Close search"
					>
						<Kbd className="font-mono">Esc</Kbd>
					</button>
				</div>
				{filtersEnabled ? (
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
				) : null}
			</div>
			{filtersEnabled && filtersVisible ? (
				<div className="flex items-center gap-1.5 px-2 pb-2">
					<Popover
						open={sourcePopoverOpen}
						onOpenChange={(nextOpen) =>
							setState({ sourcePopoverOpen: nextOpen })
						}
					>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className={cn(
									"h-7 rounded-full border border-transparent bg-transparent px-2.5 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground aria-expanded:border-border/60 aria-expanded:bg-muted aria-expanded:text-foreground",
									sourceFilter !== "all" && "bg-muted text-foreground",
								)}
							>
								{React.createElement(sourceFilterIcon, {
									className: "size-3.5",
								})}
								<span className="truncate">{sourceFilterLabel}</span>
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
										value={sourceSearchValue}
										onValueChange={(value) =>
											setState({ sourceSearchValue: value })
										}
										className="pl-2"
										placeholder="Search projects"
									/>
								</div>
								<CommandList className="max-h-64">
									{showTypeFilters ? (
										<CommandGroup heading="Types" className="px-1 py-1">
											<div className="flex flex-col gap-1">
												{sourceFilterOptions.map((option) => (
													<SearchSourceFilterOption
														key={option.value}
														icon={option.icon}
														label={option.label}
														selected={sourceFilter === option.value}
														onSelect={() => {
															setState({
																sourceFilter: option.value,
																sourcePopoverOpen: false,
															});
														}}
													/>
												))}
											</div>
										</CommandGroup>
									) : null}
									<CommandGroup heading="Projects" className="px-1 py-1">
										{matchingProjects.length > 0 ? (
											<div className="flex flex-col gap-1">
												{matchingProjects.map((project) => (
													<SearchSourceFilterOption
														key={project.id}
														icon={Folder}
														label={project.name}
														selected={sourceFilter === project.id}
														onSelect={() => {
															setState({
																sourceFilter: project.id,
																sourcePopoverOpen: false,
															});
														}}
													/>
												))}
											</div>
										) : (
											<div className="px-2 pt-1 pb-2 text-xs text-muted-foreground/50">
												No projects found
											</div>
										)}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>
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
							className="w-64 gap-0 p-0"
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
									defaultMonth={dateRange?.from ?? defaultCalendarMonth}
									classNames={{
										root: "w-full",
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
	searchPlaceholder = "Search notes and chats...",
	searchDescription = "Search notes and chats...",
	filtersEnabled = true,
	groupByDate = true,
	showResultsOnEmptySearch = true,
	filterKinds = ["note", "chat"],
	showKeyboardHintsFooter = false,
}: SearchCommandProps) {
	const {
		sourceFilter,
		searchValue,
		filtersVisible,
		dateFilter,
		dateRange,
		sourcePopoverOpen,
		datePopoverOpen,
		sourceSearchValue,
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

	const visibleItems = React.useMemo(
		() =>
			dateFilteredItems.filter((item) =>
				matchesSourceFilter(item, sourceFilter),
			),
		[dateFilteredItems, sourceFilter],
	);
	const groupedItems = React.useMemo(
		() => groupItemsByRelativeDate(visibleItems, (item) => item.updatedAt),
		[visibleItems],
	);
	const itemSections = React.useMemo(
		() =>
			RELATIVE_DATE_GROUP_SECTIONS.map((section) => ({
				...section,
				items: groupedItems[section.key],
			})),
		[groupedItems],
	);
	const selectedProject = React.useMemo(
		() => projects.find((project) => project.id === sourceFilter) ?? null,
		[sourceFilter, projects],
	);
	const matchingProjects = React.useMemo(() => {
		const normalizedSearch = sourceSearchValue.trim().toLowerCase();

		if (!normalizedSearch) {
			return projects;
		}

		return projects.filter((project) =>
			project.name.toLowerCase().includes(normalizedSearch),
		);
	}, [projects, sourceSearchValue]);
	const sourceFilterOptions = React.useMemo(
		() => getSourceFilterOptions(filterKinds),
		[filterKinds],
	);
	const sourceFilterLabel = getSourceFilterLabel(
		sourceFilter,
		sourceFilterOptions,
		selectedProject?.name,
	);
	const sourceFilterIcon = getSourceFilterIcon(
		sourceFilter,
		sourceFilterOptions,
	);
	const dateFilterLabel = getDateFilterLabel(dateFilter, dateRange);
	const isFilterPopoverOpen = sourcePopoverOpen || datePopoverOpen;
	const shouldShowResults =
		showResultsOnEmptySearch || searchValue.trim().length > 0;
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search"
			description={searchDescription}
			className="top-1/2 max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-lg sm:max-w-lg"
		>
			<Command className="**:[[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 **:[[cmdk-group-heading]]:px-1.5 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 **:[[cmdk-input-wrapper]_svg]:size-5 **:[[cmdk-input]]:h-12">
				<SearchCommandFilters
					sourceFilter={sourceFilter}
					searchValue={searchValue}
					filtersVisible={filtersVisible}
					dateFilter={dateFilter}
					dateRange={dateRange}
					sourcePopoverOpen={sourcePopoverOpen}
					datePopoverOpen={datePopoverOpen}
					sourceSearchValue={sourceSearchValue}
					matchingProjects={matchingProjects}
					sourceFilterLabel={sourceFilterLabel}
					sourceFilterIcon={sourceFilterIcon}
					sourceFilterOptions={sourceFilterOptions}
					searchPlaceholder={searchPlaceholder}
					filtersEnabled={filtersEnabled}
					dateFilterLabel={dateFilterLabel}
					onOpenChange={onOpenChange}
					setState={setState}
					hideFilters={hideFilters}
				/>
				{shouldShowResults ? (
					<CommandList
						className={cn(
							"h-[22rem] max-h-[calc(100vh-14rem)] min-h-[14rem]",
							isFilterPopoverOpen && "pointer-events-none",
						)}
					>
						<CommandEmpty>No results found.</CommandEmpty>
						{groupByDate ? (
							itemSections.map((section) =>
								section.items.length > 0 ? (
									<CommandGroup key={section.key} heading={section.label}>
										<div className="flex flex-col gap-1">
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
										</div>
									</CommandGroup>
								) : null,
							)
						) : (
							<CommandGroup>
								<div className="flex flex-col gap-1">
									{visibleItems.map((item) => (
										<SearchCommandRow
											key={item.id}
											item={item}
											onSelect={() => {
												onOpenChange(false);
												onSelectItem(item.id);
											}}
										/>
									))}
								</div>
							</CommandGroup>
						)}
					</CommandList>
				) : (
					<div className="flex h-12 items-center px-3 text-muted-foreground text-xs">
						Type to search for notes
					</div>
				)}
				{showKeyboardHintsFooter ? <SearchCommandKeyboardHints /> : null}
			</Command>
		</CommandDialog>
	);
}

function SearchCommandKeyboardHints() {
	const kbdClassName =
		"border border-border/60 bg-muted px-1.5 font-mono text-xs";

	return (
		<div className="flex h-11 items-center gap-5 px-4 text-muted-foreground text-xs">
			<div className="flex items-center gap-2">
				<Kbd aria-hidden="true" className={kbdClassName}>
					↑↓
				</Kbd>
				<span>navigate</span>
			</div>
			<div className="flex items-center gap-2">
				<Kbd aria-hidden="true" className={kbdClassName}>
					↵
				</Kbd>
				<span>open</span>
			</div>
			<div className="flex items-center gap-2">
				<Kbd aria-hidden="true" className={kbdClassName}>
					Esc
				</Kbd>
				<span>close</span>
			</div>
		</div>
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

function SearchSourceFilterOption({
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

function isProjectSourceFilter(sourceFilter: SearchSourceFilter) {
	return !STATIC_SOURCE_FILTER_OPTIONS.some(
		(option) => option.value === sourceFilter,
	);
}

function getSourceFilterOptions(filterKinds: SearchCommandKind[]) {
	const enabledKinds = new Set(filterKinds);

	if (enabledKinds.size < 2) {
		return STATIC_SOURCE_FILTER_OPTIONS.filter(
			(option) => option.value === "all",
		);
	}

	return STATIC_SOURCE_FILTER_OPTIONS.filter(
		(option) =>
			option.value === "all" ||
			(option.value === "notes" && enabledKinds.has("note")) ||
			(option.value === "chats" && enabledKinds.has("chat")),
	);
}

function getSourceFilterLabel(
	sourceFilter: SearchSourceFilter,
	sourceFilterOptions: (typeof STATIC_SOURCE_FILTER_OPTIONS)[number][],
	projectName?: string,
) {
	const option = sourceFilterOptions.find(
		(candidate) => candidate.value === sourceFilter,
	);
	if (option) {
		return option.label;
	}

	return projectName ?? "All";
}

function getSourceFilterIcon(
	sourceFilter: SearchSourceFilter,
	sourceFilterOptions: (typeof STATIC_SOURCE_FILTER_OPTIONS)[number][],
) {
	const option = sourceFilterOptions.find(
		(candidate) => candidate.value === sourceFilter,
	);
	if (option) {
		return option.icon;
	}

	return Folder;
}

function matchesSourceFilter(
	item: SearchCommandItem,
	sourceFilter: SearchSourceFilter,
) {
	if (sourceFilter === "all") {
		return true;
	}

	if (sourceFilter === "chats") {
		return item.kind === "chat";
	}

	if (item.kind === "chat") {
		return false;
	}

	if (sourceFilter === "notes") {
		return !item.projectId;
	}

	if (!isProjectSourceFilter(sourceFilter)) {
		return false;
	}

	return item.projectId === sourceFilter;
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

	if (!range.to) {
		return searchDateRangeFormatter.format(range.from);
	}

	return `${searchDateRangeFormatter.format(range.from)} - ${searchDateRangeFormatter.format(range.to)}`;
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
