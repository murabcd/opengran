"use client";

import { Button } from "@workspace/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Field, FieldGroup } from "@workspace/ui/components/field";
import { Icons } from "@workspace/ui/components/icons";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { useQuery } from "convex/react";
import { ChevronDown, Clock, FolderClosed } from "lucide-react";
import * as React from "react";
import {
	AUTOMATION_SCHEDULE_PERIODS,
	type AutomationDraft,
	type AutomationSchedulePeriod,
	type AutomationTarget,
} from "@/components/automations/automation-types";
import { getAutomationSchedulePeriodLabel } from "@/components/automations/automation-utils";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { chatModels, defaultChatModel, findChatModel } from "@/lib/ai/models";
import { api } from "../../../../../convex/_generated/api";
import type { Doc } from "../../../../../convex/_generated/dataModel";

const AUTOMATION_PICKER_TRIGGER_CLASS_NAME =
	"min-w-40 justify-between rounded-lg border-input bg-background text-sm shadow-xs hover:bg-background aria-expanded:bg-background dark:bg-input/30 dark:hover:bg-input/30";

type CreateAutomationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreateAutomation: (automation: AutomationDraft) => void | Promise<void>;
	initialAutomation?: AutomationDraft | null;
};

const createInitialScheduledAt = () => {
	const nextDate = new Date();
	nextDate.setHours(9, 0, 0, 0);
	return nextDate;
};

const formatTimeInputValue = (value: Date) => {
	const hours = String(value.getHours()).padStart(2, "0");
	const minutes = String(value.getMinutes()).padStart(2, "0");
	return `${hours}:${minutes}`;
};

export function CreateAutomationDialog({
	open,
	onOpenChange,
	onCreateAutomation,
	initialAutomation = null,
}: CreateAutomationDialogProps) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const projects = useQuery(
		api.projects.list,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);
	const [schedulePickerOpen, setSchedulePickerOpen] = React.useState(false);
	const [modelPickerOpen, setModelPickerOpen] = React.useState(false);
	const [title, setTitle] = React.useState("");
	const [prompt, setPrompt] = React.useState("");
	const [selectedModel, setSelectedModel] = React.useState(defaultChatModel);
	const [schedulePeriod, setSchedulePeriod] =
		React.useState<AutomationSchedulePeriod>("daily");
	const [scheduledAt, setScheduledAt] = React.useState(
		createInitialScheduledAt,
	);
	const [target, setTarget] = React.useState<AutomationTarget | null>(null);

	React.useEffect(() => {
		setProjectPickerOpen(false);
		setSchedulePickerOpen(false);
		setModelPickerOpen(false);

		if (!open) {
			setTitle("");
			setPrompt("");
			setSelectedModel(defaultChatModel);
			setSchedulePeriod("daily");
			setScheduledAt(createInitialScheduledAt());
			setTarget(null);
			return;
		}

		if (initialAutomation) {
			setTitle(initialAutomation.title);
			setPrompt(initialAutomation.prompt);
			setSelectedModel(
				findChatModel(initialAutomation.model) ?? defaultChatModel,
			);
			setSchedulePeriod(initialAutomation.schedulePeriod);
			setScheduledAt(new Date(initialAutomation.scheduledAt));
			setTarget(initialAutomation.target);
			return;
		}

		setTitle("");
		setPrompt("");
		setSelectedModel(defaultChatModel);
		setSchedulePeriod("daily");
		setScheduledAt(createInitialScheduledAt());
		setTarget(null);
	}, [initialAutomation, open]);

	React.useEffect(() => {
		if (projects === undefined) {
			return;
		}

		if (target?.kind !== "project") {
			return;
		}

		if (projects?.some((project) => project._id === target.projectId)) {
			return;
		}

		setTarget(null);
	}, [projects, target]);

	const handleTimeChange = React.useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const nextValue = event.target.value;
			if (!nextValue) {
				return;
			}

			const [hoursString, minutesString] = nextValue.split(":");
			const hours = Number(hoursString);
			const minutes = Number(minutesString);

			if (Number.isNaN(hours) || Number.isNaN(minutes)) {
				return;
			}

			setScheduledAt((currentValue) => {
				const nextDate = new Date(currentValue);
				nextDate.setHours(hours, minutes, 0, 0);
				return nextDate;
			});
		},
		[],
	);

	const handleCreate = React.useCallback(async () => {
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt || !target) {
			return;
		}

		const trimmedTitle = title.trim();

		await onCreateAutomation({
			title: trimmedTitle || trimmedPrompt,
			prompt: trimmedPrompt,
			model: selectedModel.model,
			schedulePeriod,
			scheduledAt: scheduledAt.getTime(),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
			target,
		});
	}, [
		onCreateAutomation,
		prompt,
		schedulePeriod,
		scheduledAt,
		selectedModel.model,
		target,
		title,
	]);

	const scheduleLabel = getAutomationSchedulePeriodLabel({
		schedulePeriod,
		scheduledAt: scheduledAt.getTime(),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{initialAutomation ? "Edit automation" : "New automation"}
					</DialogTitle>
					<DialogDescription>
						Write the prompt and choose when this automation should run.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<Label
							htmlFor="automation-title"
							className="text-xs text-muted-foreground"
						>
							Title
						</Label>
						<Input
							id="automation-title"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Daily meeting recap"
						/>
					</Field>
					<Field>
						<Label
							htmlFor="automation-prompt"
							className="text-xs text-muted-foreground"
						>
							Prompt
						</Label>
						<Textarea
							id="automation-prompt"
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder="Review yesterday's meeting notes and summarize follow-ups, decisions, and open questions for my workspace."
							className="min-h-40 resize-none"
						/>
					</Field>
					<div className="flex flex-wrap items-center gap-1.5 pt-2">
						<ProjectPicker
							open={projectPickerOpen}
							onOpenChange={setProjectPickerOpen}
							projects={projects ?? []}
							target={target}
							onTargetSelect={setTarget}
						/>
						<SchedulePicker
							open={schedulePickerOpen}
							onOpenChange={setSchedulePickerOpen}
							scheduleLabel={scheduleLabel}
							schedulePeriod={schedulePeriod}
							scheduledAt={scheduledAt}
							onSchedulePeriodChange={setSchedulePeriod}
							onTimeChange={handleTimeChange}
						/>
						<ModelPicker
							open={modelPickerOpen}
							onOpenChange={setModelPickerOpen}
							selectedModel={selectedModel}
							onSelectedModelChange={setSelectedModel}
						/>
					</div>
				</FieldGroup>
				<div className="flex justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!prompt.trim() || !target}
						onClick={() => void handleCreate()}
					>
						{initialAutomation ? "Save" : "Create"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function ModelPicker({
	open,
	onOpenChange,
	selectedModel,
	onSelectedModelChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedModel: (typeof chatModels)[number];
	onSelectedModelChange: (model: (typeof chatModels)[number]) => void;
}) {
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
					aria-label={`Model: ${selectedModel.name}`}
				>
					<Icons.codexLogo className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" className="w-72">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						Model
					</DropdownMenuLabel>
					{chatModels.map((model) => (
						<DropdownMenuCheckboxItem
							key={model.id}
							checked={model.id === selectedModel.id}
							onCheckedChange={(checked) => {
								if (checked) {
									onSelectedModelChange(model);
								}
							}}
							className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
						>
							<span className="inline-flex items-center gap-2">
								<Icons.codexLogo className="size-4 text-muted-foreground" />
								{model.name}
							</span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ProjectPicker({
	open,
	onOpenChange,
	projects,
	target,
	onTargetSelect,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projects: Array<Doc<"projects">>;
	target: AutomationTarget | null;
	onTargetSelect: (target: AutomationTarget) => void;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className={cn(
						"justify-between font-normal",
						AUTOMATION_PICKER_TRIGGER_CLASS_NAME,
					)}
				>
					<span className="flex items-center gap-2">
						<FolderClosed className="size-4 text-muted-foreground" />
						<span className="truncate">
							{target?.label ?? "Select project"}
						</span>
					</span>
					<ChevronDown className="size-4 text-muted-foreground opacity-70" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-72 gap-0 border-input/30 p-0"
			>
				<Command className="bg-popover p-1">
					<CommandInput className="pl-2" placeholder="Search projects" />
					<CommandList className="max-h-64">
						<CommandEmpty>No projects found.</CommandEmpty>
						<CommandGroup className="p-1 [&>[cmdk-group-items]]:flex [&>[cmdk-group-items]]:flex-col [&>[cmdk-group-items]]:gap-1">
							{projects.map((project) => (
								<ProjectPickerItem
									key={project._id}
									icon={FolderClosed}
									label={project.name}
									selected={
										target?.kind === "project" &&
										target.projectId === project._id
									}
									onSelect={() => {
										onTargetSelect({
											kind: "project",
											label: project.name,
											projectId: project._id,
										});
										onOpenChange(false);
									}}
								/>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function ProjectPickerItem({
	icon,
	label,
	selected,
	onSelect,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	selected: boolean;
	onSelect: () => void;
}) {
	const Icon = icon;

	return (
		<CommandItem
			value={label}
			onSelect={onSelect}
			data-checked={selected}
			className={cn(
				"h-8 w-full cursor-pointer gap-2 overflow-hidden rounded-lg p-2 text-left text-sm ring-sidebar-ring transition-[background-color,color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 data-selected:bg-sidebar-accent data-selected:text-sidebar-accent-foreground",
				selected && "bg-sidebar-accent text-sidebar-accent-foreground",
			)}
		>
			<Icon className="size-4 shrink-0 text-muted-foreground group-hover/command-item:text-sidebar-accent-foreground group-data-[selected=true]/command-item:text-sidebar-accent-foreground" />
			<div className="min-w-0 flex-1 truncate">{label}</div>
		</CommandItem>
	);
}

function SchedulePicker({
	open,
	onOpenChange,
	scheduleLabel,
	schedulePeriod,
	scheduledAt,
	onSchedulePeriodChange,
	onTimeChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scheduleLabel: string;
	schedulePeriod: AutomationSchedulePeriod;
	scheduledAt: Date;
	onSchedulePeriodChange: (value: AutomationSchedulePeriod) => void;
	onTimeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className={cn(
						"justify-between font-normal",
						AUTOMATION_PICKER_TRIGGER_CLASS_NAME,
					)}
				>
					<span className="flex items-center gap-2">
						<Clock className="size-4 text-muted-foreground" />
						<span>{scheduleLabel}</span>
					</span>
					<ChevronDown className="size-4 text-muted-foreground opacity-70" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" sideOffset={6} className="w-64 gap-0 p-1.5">
				<PopoverHeader className="px-1 pb-1">
					<PopoverTitle className="text-xs font-medium text-muted-foreground">
						Schedule
					</PopoverTitle>
				</PopoverHeader>
				<div className="space-y-1">
					<Select
						value={schedulePeriod}
						onValueChange={(value) =>
							onSchedulePeriodChange(value as AutomationSchedulePeriod)
						}
					>
						<SelectTrigger
							size="sm"
							className="w-full border-input/30 bg-input/30 shadow-none focus-visible:border-input focus-visible:ring-0"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{AUTOMATION_SCHEDULE_PERIODS.map((period) => (
									<SelectItem key={period.value} value={period.value}>
										{period.label}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<Input
						id="automation-schedule-time"
						type="time"
						value={formatTimeInputValue(scheduledAt)}
						onChange={onTimeChange}
						className="appearance-none border-input/30 bg-input/30 shadow-none focus-visible:border-input focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}
