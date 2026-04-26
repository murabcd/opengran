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
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Icons } from "@workspace/ui/components/icons";
import { Input } from "@workspace/ui/components/input";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import {
	Popover,
	PopoverContent,
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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { useQuery } from "convex/react";
import {
	AtSign,
	Box,
	Clock,
	FileText,
	FolderClosed,
	Grid3x3,
	X,
} from "lucide-react";
import * as React from "react";
import {
	AUTOMATION_SCHEDULE_PERIODS,
	type AutomationAppSource,
	type AutomationDraft,
	type AutomationSchedulePeriod,
	type AutomationTarget,
} from "@/components/automations/automation-types";
import { getAutomationSchedulePeriodLabel } from "@/components/automations/automation-utils";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { useLinkedAccounts } from "@/hooks/use-linked-accounts";
import { chatModels, defaultChatModel, findChatModel } from "@/lib/ai/models";
import { authClient } from "@/lib/auth-client";
import {
	type ChatAppSourceProvider,
	getAppSourceLabel,
} from "@/lib/chat-source-display";
import {
	GOOGLE_CALENDAR_SCOPE,
	GOOGLE_CALENDAR_SOURCE_ID,
	GOOGLE_DRIVE_SCOPE,
	GOOGLE_DRIVE_SOURCE_ID,
	getGoogleLinkedAccount,
	hasGoogleScope,
} from "@/lib/google-integrations";
import { getNoteDisplayTitle } from "@/lib/note-title";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";

const AUTOMATION_PICKER_TRIGGER_CLASS_NAME =
	"group/automation-picker min-w-0 max-w-[180px] justify-start overflow-hidden rounded-full font-normal text-muted-foreground";

type CreateAutomationDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreateAutomation: (automation: AutomationDraft) => void | Promise<void>;
	initialAutomation?: AutomationDraft | null;
};

type ConnectedAppSource = {
	id: string;
	title: string;
	preview: string;
	provider: ChatAppSourceProvider;
};

type AutomationNoteSource = {
	id: Id<"notes">;
	title: string;
	preview: string;
};

type NoteMentionRange = {
	start: number;
	end: number;
	query: string;
};

const findNoteMentionRange = (
	value: string,
	cursorPosition: number,
): NoteMentionRange | null => {
	const textBeforeCursor = value.slice(0, cursorPosition);
	const mentionStart = textBeforeCursor.lastIndexOf("@");

	if (mentionStart === -1) {
		return null;
	}

	const characterBeforeMention = value[mentionStart - 1];
	if (characterBeforeMention && !/\s/.test(characterBeforeMention)) {
		return null;
	}

	const mentionText = value.slice(mentionStart + 1, cursorPosition);
	if (/\s/.test(mentionText)) {
		return null;
	}

	return {
		start: mentionStart,
		end: cursorPosition,
		query: mentionText,
	};
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
	const promptTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
	const projects = useQuery(
		api.projects.list,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const notes = useQuery(
		api.notes.list,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const appSources = useQuery(
		api.appConnections.listSources,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const { data: session } = authClient.useSession();
	const { accounts } = useLinkedAccounts(session?.user);
	const googleAccount = React.useMemo(
		() => getGoogleLinkedAccount(accounts),
		[accounts],
	);
	const googleAppSources = React.useMemo(() => {
		if (!googleAccount) {
			return [];
		}

		const sources: ConnectedAppSource[] = [];

		if (hasGoogleScope(googleAccount, GOOGLE_CALENDAR_SCOPE)) {
			sources.push({
				id: GOOGLE_CALENDAR_SOURCE_ID,
				title: "Google Calendar",
				preview: "Google account",
				provider: "google-calendar",
			});
		}

		if (hasGoogleScope(googleAccount, GOOGLE_DRIVE_SCOPE)) {
			sources.push({
				id: GOOGLE_DRIVE_SOURCE_ID,
				title: "Google Drive",
				preview: "Google account",
				provider: "google-drive",
			});
		}

		return sources;
	}, [googleAccount]);
	const connectedAppSources = React.useMemo(
		() => [...googleAppSources, ...(appSources ?? [])],
		[appSources, googleAppSources],
	);
	const noteSources = React.useMemo<AutomationNoteSource[]>(
		() =>
			(notes ?? []).map((note) => ({
				id: note._id,
				title: getNoteDisplayTitle(note.title),
				preview: note.searchableText.trim(),
			})),
		[notes],
	);
	const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);
	const [schedulePickerOpen, setSchedulePickerOpen] = React.useState(false);
	const [modelPickerOpen, setModelPickerOpen] = React.useState(false);
	const [appSourcesPickerOpen, setAppSourcesPickerOpen] = React.useState(false);
	const [notePickerOpen, setNotePickerOpen] = React.useState(false);
	const [noteSearchTerm, setNoteSearchTerm] = React.useState("");
	const [noteMentionRange, setNoteMentionRange] =
		React.useState<NoteMentionRange | null>(null);
	const [title, setTitle] = React.useState("");
	const [prompt, setPrompt] = React.useState("");
	const [selectedModel, setSelectedModel] = React.useState(defaultChatModel);
	const [schedulePeriod, setSchedulePeriod] =
		React.useState<AutomationSchedulePeriod>("daily");
	const [scheduledAt, setScheduledAt] = React.useState(
		createInitialScheduledAt,
	);
	const [target, setTarget] = React.useState<AutomationTarget | null>(null);
	const [selectedConnectedAppIds, setSelectedConnectedAppIds] = React.useState<
		string[]
	>([]);
	const [selectedNoteIds, setSelectedNoteIds] = React.useState<
		Array<Id<"notes">>
	>([]);
	const selectedNoteSources = React.useMemo(
		() =>
			selectedNoteIds.flatMap((sourceId) => {
				const source = noteSources.find(
					(noteSource) => noteSource.id === sourceId,
				);
				return source ? [source] : [];
			}),
		[noteSources, selectedNoteIds],
	);
	const selectedConnectedAppSources = React.useMemo<AutomationAppSource[]>(
		() =>
			selectedConnectedAppIds.flatMap((sourceId) => {
				const source = connectedAppSources.find(
					(appSource) => appSource.id === sourceId,
				);
				return source
					? [
							{
								id: source.id,
								label: getAppSourceLabel(source.provider),
								provider: source.provider,
							},
						]
					: [];
			}),
		[connectedAppSources, selectedConnectedAppIds],
	);
	React.useEffect(() => {
		setProjectPickerOpen(false);
		setSchedulePickerOpen(false);
		setModelPickerOpen(false);
		setAppSourcesPickerOpen(false);
		setNotePickerOpen(false);

		if (!open) {
			setTitle("");
			setPrompt("");
			setNoteMentionRange(null);
			setNoteSearchTerm("");
			setSelectedModel(defaultChatModel);
			setSchedulePeriod("daily");
			setScheduledAt(createInitialScheduledAt());
			setTarget(null);
			setSelectedConnectedAppIds([]);
			setSelectedNoteIds([]);
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
			setTarget(
				initialAutomation.target.kind === "project"
					? initialAutomation.target
					: null,
			);
			setSelectedNoteIds(
				initialAutomation.target.kind === "notes"
					? initialAutomation.target.noteIds
					: [],
			);
			setSelectedConnectedAppIds(
				(initialAutomation.appSources ?? []).map((source) => source.id),
			);
			return;
		}

		setTitle("");
		setPrompt("");
		setNoteMentionRange(null);
		setNoteSearchTerm("");
		setSelectedModel(defaultChatModel);
		setSchedulePeriod("daily");
		setScheduledAt(createInitialScheduledAt());
		setTarget(null);
		setSelectedConnectedAppIds([]);
		setSelectedNoteIds([]);
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

	React.useEffect(() => {
		setSelectedConnectedAppIds((currentIds) => {
			const availableIds = new Set(
				connectedAppSources.map((source) => source.id),
			);
			const nextIds = currentIds.filter((sourceId) =>
				availableIds.has(sourceId),
			);

			return nextIds.length === currentIds.length ? currentIds : nextIds;
		});
	}, [connectedAppSources]);

	React.useEffect(() => {
		setSelectedNoteIds((currentIds) => {
			const availableIds = new Set(noteSources.map((source) => source.id));
			const nextIds = currentIds.filter((sourceId) =>
				availableIds.has(sourceId),
			);

			return nextIds.length === currentIds.length ? currentIds : nextIds;
		});
	}, [noteSources]);

	const closeAutomationPickers = React.useCallback(() => {
		setProjectPickerOpen(false);
		setSchedulePickerOpen(false);
		setModelPickerOpen(false);
		setAppSourcesPickerOpen(false);
		setNotePickerOpen(false);
	}, []);

	const handleNotePickerOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				closeAutomationPickers();
			}

			setNotePickerOpen(nextOpen);
		},
		[closeAutomationPickers],
	);

	const handleAppSourcesPickerOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				closeAutomationPickers();
			}

			setAppSourcesPickerOpen(nextOpen);
		},
		[closeAutomationPickers],
	);

	const handleProjectPickerOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				closeAutomationPickers();
			}

			setProjectPickerOpen(nextOpen);
		},
		[closeAutomationPickers],
	);

	const handleSchedulePickerOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				closeAutomationPickers();
			}

			setSchedulePickerOpen(nextOpen);
		},
		[closeAutomationPickers],
	);

	const handleModelPickerOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				closeAutomationPickers();
			}

			setModelPickerOpen(nextOpen);
		},
		[closeAutomationPickers],
	);

	const handleConnectedAppToggle = React.useCallback((sourceId: string) => {
		setSelectedConnectedAppIds((currentIds) =>
			currentIds.includes(sourceId)
				? currentIds.filter((currentId) => currentId !== sourceId)
				: [...currentIds, sourceId],
		);
	}, []);

	const handlePromptChange = React.useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>) => {
			const nextPrompt = event.target.value;
			const cursorPosition = event.target.selectionStart;
			const nextNoteMentionRange = findNoteMentionRange(
				nextPrompt,
				cursorPosition,
			);

			setPrompt(nextPrompt);
			setNoteMentionRange(nextNoteMentionRange);

			if (nextNoteMentionRange) {
				setNoteSearchTerm(nextNoteMentionRange.query);
				handleNotePickerOpenChange(true);
			}
		},
		[handleNotePickerOpenChange],
	);

	const handleNoteSelect = React.useCallback(
		(noteId: Id<"notes">) => {
			setTarget(null);
			setSelectedNoteIds((currentIds) =>
				currentIds.includes(noteId) ? currentIds : [...currentIds, noteId],
			);

			setPrompt((currentPrompt) => {
				const range = noteMentionRange;
				if (!range) {
					return currentPrompt;
				}

				const nextPrompt = `${currentPrompt.slice(0, range.start)}${currentPrompt.slice(range.end)}`;
				queueMicrotask(() => {
					const textarea = promptTextareaRef.current;
					if (!textarea) {
						return;
					}

					textarea.focus();
					textarea.setSelectionRange(range.start, range.start);
				});
				return nextPrompt;
			});
			setNoteMentionRange(null);
			setNoteSearchTerm("");
		},
		[noteMentionRange],
	);

	const handleNoteRemove = React.useCallback((noteId: Id<"notes">) => {
		setSelectedNoteIds((currentIds) =>
			currentIds.filter((currentId) => currentId !== noteId),
		);
	}, []);

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
		const effectiveTarget =
			selectedNoteIds.length > 0
				? ({
						kind: "notes",
						label:
							selectedNoteSources.length === 1
								? selectedNoteSources[0]?.title
								: `${selectedNoteIds.length} notes`,
						noteIds: selectedNoteIds,
					} satisfies AutomationTarget)
				: target;
		if (!trimmedPrompt || !effectiveTarget) {
			return;
		}

		const trimmedTitle = title.trim();

		await onCreateAutomation({
			title: trimmedTitle || trimmedPrompt,
			prompt: trimmedPrompt,
			model: selectedModel.model,
			appSources: selectedConnectedAppSources,
			schedulePeriod,
			scheduledAt: scheduledAt.getTime(),
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
			target: effectiveTarget,
		});
	}, [
		onCreateAutomation,
		prompt,
		schedulePeriod,
		scheduledAt,
		selectedConnectedAppSources,
		selectedModel.model,
		selectedNoteIds,
		selectedNoteSources,
		target,
		title,
	]);

	const scheduleLabel = getAutomationSchedulePeriodLabel({
		schedulePeriod,
		scheduledAt: scheduledAt.getTime(),
	});
	const canCreateAutomation =
		prompt.trim().length > 0 && (!!target || selectedNoteIds.length > 0);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{initialAutomation ? "Edit automation" : "New automation"}
					</DialogTitle>
					<DialogDescription>
						Create a prompt that runs automatically on your schedule.
					</DialogDescription>
				</DialogHeader>
				<FieldGroup>
					<Field>
						<FieldLabel
							htmlFor="automation-title"
							className="text-xs text-muted-foreground"
						>
							Title
						</FieldLabel>
						<Input
							id="automation-title"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Meeting notes recap"
						/>
					</Field>
					<Field>
						<FieldLabel
							htmlFor="automation-prompt"
							className="text-xs text-muted-foreground"
						>
							Prompt
						</FieldLabel>
						<InputGroup className="min-h-40 items-stretch rounded-xl bg-background">
							<InputGroupAddon align="block-start" className="px-2.5 pt-2">
								<NotePicker
									open={notePickerOpen}
									onOpenChange={handleNotePickerOpenChange}
									sources={noteSources}
									searchTerm={noteSearchTerm}
									onSearchTermChange={setNoteSearchTerm}
									selectedSourceIds={selectedNoteIds}
									isLoading={notes === undefined}
									onSelectSource={handleNoteSelect}
								/>
								{selectedNoteSources.length > 0 ? (
									<NoteChips
										sources={selectedNoteSources}
										onRemoveSource={handleNoteRemove}
									/>
								) : null}
							</InputGroupAddon>
							<InputGroupTextarea
								ref={promptTextareaRef}
								id="automation-prompt"
								value={prompt}
								onChange={handlePromptChange}
								placeholder="Summarize meeting notes and list follow-ups"
								className="min-h-28 px-4 py-3 text-sm"
							/>
							<InputGroupAddon
								align="block-end"
								className="flex-wrap justify-start gap-1 px-2.5 py-2"
							>
								<ModelPicker
									open={modelPickerOpen}
									onOpenChange={handleModelPickerOpenChange}
									selectedModel={selectedModel}
									onSelectedModelChange={setSelectedModel}
								/>
								<AppSourcesPicker
									open={appSourcesPickerOpen}
									onOpenChange={handleAppSourcesPickerOpenChange}
									sources={connectedAppSources}
									selectedSourceIds={selectedConnectedAppIds}
									onToggleSource={handleConnectedAppToggle}
								/>
								<ProjectPicker
									open={projectPickerOpen}
									onOpenChange={handleProjectPickerOpenChange}
									projects={projects ?? []}
									target={target?.kind === "project" ? target : null}
									onTargetSelect={(nextTarget) => {
										setSelectedNoteIds([]);
										setTarget(nextTarget);
									}}
								/>
								<SchedulePicker
									open={schedulePickerOpen}
									onOpenChange={handleSchedulePickerOpenChange}
									scheduleLabel={scheduleLabel}
									schedulePeriod={schedulePeriod}
									scheduledAt={scheduledAt}
									onSchedulePeriodChange={setSchedulePeriod}
									onTimeChange={handleTimeChange}
								/>
							</InputGroupAddon>
						</InputGroup>
					</Field>
				</FieldGroup>
				<div className="flex justify-end gap-2 pt-6 pb-2">
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!canCreateAutomation}
						onClick={() => void handleCreate()}
					>
						{initialAutomation ? "Save" : "Create"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function AppSourcesPicker({
	open,
	onOpenChange,
	sources,
	selectedSourceIds,
	onToggleSource,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sources: ConnectedAppSource[];
	selectedSourceIds: string[];
	onToggleSource: (sourceId: string) => void;
}) {
	const keepPickerOpen = React.useCallback((event: Event) => {
		event.preventDefault();
	}, []);
	const selectedSource =
		selectedSourceIds.length === 1
			? sources.find((source) => source.id === selectedSourceIds[0])
			: null;
	const label =
		selectedSourceIds.length === 1 && selectedSource
			? getAppSourceLabel(selectedSource.provider)
			: selectedSourceIds.length > 1
				? `${selectedSourceIds.length} apps`
				: "Apps";

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<InputGroupButton
					type="button"
					variant="ghost"
					size="sm"
					className={cn(AUTOMATION_PICKER_TRIGGER_CLASS_NAME)}
				>
					<span className="flex min-w-0 flex-1 items-center gap-2">
						<Box className="size-4 shrink-0 text-muted-foreground group-hover/automation-picker:text-foreground group-focus-visible/automation-picker:text-foreground group-data-[state=open]/automation-picker:text-foreground" />
						<span className="min-w-0 truncate">{label}</span>
					</span>
				</InputGroupButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent side="top" align="start" className="w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="text-xs text-muted-foreground">
						Apps
					</DropdownMenuLabel>
					{sources.length > 0 ? (
						sources.map((source, index) => {
							const selected = selectedSourceIds.includes(source.id);
							const sourceKey = source.id
								? `${source.provider}:${source.id}`
								: `app-source-${index}`;

							return (
								<DropdownMenuCheckboxItem
									key={sourceKey}
									checked={selected}
									className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
									onSelect={keepPickerOpen}
									onCheckedChange={() => onToggleSource(source.id)}
								>
									<ConnectedAppIcon provider={source.provider} />
									<div className="min-w-0 truncate">
										{getAppSourceLabel(source.provider)}
									</div>
								</DropdownMenuCheckboxItem>
							);
						})
					) : (
						<DropdownMenuItem disabled>No connected apps</DropdownMenuItem>
					)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function NotePicker({
	open,
	onOpenChange,
	sources,
	searchTerm = "",
	onSearchTermChange,
	selectedSourceIds,
	isLoading,
	onSelectSource,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sources: AutomationNoteSource[];
	searchTerm?: string;
	onSearchTermChange: (value: string) => void;
	selectedSourceIds: string[];
	isLoading: boolean;
	onSelectSource: (sourceId: Id<"notes">) => void;
}) {
	const filteredSources = React.useMemo(() => {
		const query = searchTerm.trim().toLowerCase();

		if (!query) {
			return sources;
		}

		return sources.filter((source) =>
			[source.title, source.preview].join(" ").toLowerCase().includes(query),
		);
	}, [searchTerm, sources]);

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<InputGroupButton
							variant="outline"
							size="icon-sm"
							className="rounded-full text-muted-foreground hover:text-foreground"
						>
							<AtSign />
							<span className="sr-only">Mention a note</span>
						</InputGroupButton>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Mention a note</TooltipContent>
			</Tooltip>
			<PopoverContent
				className="w-72 p-0 [&_[data-slot=scroll-area]]:w-full [&_[data-slot=scroll-area-viewport]]:w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=command-list]]:w-full [&_[data-slot=command-list]]:min-w-0"
				align="start"
			>
				<Command>
					<CommandInput
						placeholder="Search notes..."
						value={searchTerm}
						onValueChange={onSearchTermChange}
					/>
					<CommandList>
						{isLoading ? (
							<CommandGroup heading="Notes">
								<div className="px-2 py-2 text-sm text-muted-foreground">
									Loading notes...
								</div>
							</CommandGroup>
						) : null}
						<CommandEmpty>No notes found.</CommandEmpty>
						{filteredSources.length > 0 ? (
							<CommandGroup heading={searchTerm ? "Search results" : "Notes"}>
								{filteredSources.map((source) => {
									const selected = selectedSourceIds.includes(source.id);

									return (
										<CommandItem
											key={source.id}
											value={`${source.id} ${source.title}`}
											onSelect={() => {
												onSelectSource(source.id);
												onOpenChange(false);
											}}
											data-checked={selected}
											className="w-full cursor-pointer gap-1.5 overflow-hidden rounded-md px-1.5"
										>
											<div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
												<FileText className="size-4" />
											</div>
											<div
												className="min-w-0 flex-1 truncate"
												title={source.title}
											>
												{source.title}
											</div>
										</CommandItem>
									);
								})}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function NoteChips({
	sources,
	onRemoveSource,
}: {
	sources: AutomationNoteSource[];
	onRemoveSource: (sourceId: Id<"notes">) => void;
}) {
	return (
		<div className="no-scrollbar -m-1.5 flex gap-1 overflow-y-auto p-1.5">
			{sources.map((source) => (
				<InputGroupButton
					key={source.id}
					size="sm"
					variant="secondary"
					className="group/note-mention-chip max-w-48 rounded-full pl-2!"
					onClick={() => onRemoveSource(source.id)}
				>
					<FileText />
					<span className="min-w-0 truncate">{source.title}</span>
					<X className="opacity-0 transition-opacity group-hover/note-mention-chip:opacity-100 group-focus-visible/note-mention-chip:opacity-100" />
				</InputGroupButton>
			))}
		</div>
	);
}

function ConnectedAppIcon({ provider }: { provider: ChatAppSourceProvider }) {
	if (provider === "google-calendar") {
		return <Icons.googleCalendarLogo className="size-4" />;
	}

	if (provider === "google-drive") {
		return <Icons.googleDriveLogo className="size-4" />;
	}

	if (provider === "yandex-calendar") {
		return <Icons.yandexCalendarLogo className="size-4" />;
	}

	if (provider === "yandex-tracker") {
		return <Icons.yandexTrackerLogo className="size-4 text-blue-500" />;
	}

	if (provider === "jira") {
		return <Icons.jiraLogo className="size-4" />;
	}

	if (provider === "notion") {
		return <Icons.notionLogo className="size-4" />;
	}

	if (provider === "posthog") {
		return <Icons.planeLogo className="size-4" />;
	}

	return <Grid3x3 className="size-4" />;
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
				<InputGroupButton
					type="button"
					variant="ghost"
					size="sm"
					className="rounded-full gap-2 font-normal text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
					aria-label={`Model: ${selectedModel.name}`}
				>
					<Icons.codexLogo className="size-3.5" />
					<span className="max-w-[120px] truncate">{selectedModel.name}</span>
				</InputGroupButton>
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
				<InputGroupButton
					type="button"
					variant="ghost"
					size="sm"
					className={cn(AUTOMATION_PICKER_TRIGGER_CLASS_NAME)}
				>
					<span className="flex min-w-0 flex-1 items-center gap-2">
						<FolderClosed className="size-4 shrink-0 text-muted-foreground group-hover/automation-picker:text-foreground group-focus-visible/automation-picker:text-foreground group-data-[state=open]/automation-picker:text-foreground" />
						<span className="min-w-0 truncate">
							{target?.label ?? "Project"}
						</span>
					</span>
				</InputGroupButton>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-64 gap-0 border-input/30 p-0 [&_[data-slot=scroll-area]]:w-full [&_[data-slot=scroll-area-viewport]]:w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=command-list]]:w-full [&_[data-slot=command-list]]:min-w-0"
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
				<InputGroupButton
					type="button"
					variant="ghost"
					size="sm"
					className={cn(AUTOMATION_PICKER_TRIGGER_CLASS_NAME)}
				>
					<span className="flex items-center gap-2">
						<Clock className="size-4 shrink-0 text-muted-foreground group-hover/automation-picker:text-foreground group-focus-visible/automation-picker:text-foreground group-data-[state=open]/automation-picker:text-foreground" />
						<span>{scheduleLabel}</span>
					</span>
				</InputGroupButton>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				sideOffset={6}
				className="w-64 gap-0 p-1.5"
				onFocusOutside={(event) => event.preventDefault()}
				onInteractOutside={(event) => {
					const target = event.target;
					if (
						target instanceof HTMLElement &&
						target.closest("[data-slot='select-content']")
					) {
						event.preventDefault();
					}
				}}
			>
				<div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
					Schedule
				</div>
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
