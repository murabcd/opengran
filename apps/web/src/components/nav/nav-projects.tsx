import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import {
	Collapsible,
	CollapsibleContent,
} from "@workspace/ui/components/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Icons } from "@workspace/ui/components/icons";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@workspace/ui/components/popover";
import {
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
} from "@workspace/ui/components/sidebar";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import {
	ChevronRight,
	FileText,
	FolderClosed,
	FolderOpen,
	LoaderCircle,
	MoreHorizontal,
	Pencil,
	Plus,
	Trash2,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { NoteActionsMenu } from "@/components/note/note-actions-menu";
import { NoteTitleEditInput } from "@/components/note/note-title-edit-input";
import { ProjectComposer } from "@/components/projects/project-composer";
import { getNoteDisplayTitle } from "@/lib/note-title";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { SidebarCollapsibleGroup } from "./sidebar-collapsible-group";

const SIDEBAR_PROJECT_SKELETON_IDS = [
	"sidebar-project-skeleton-1",
	"sidebar-project-skeleton-2",
] as const;
const MAX_PROJECT_NAME_LENGTH = 48;

type ProjectWithNotes = {
	project: Doc<"projects">;
	notes: Array<Doc<"notes">>;
};

type ProjectItemState = {
	confirmOpen: boolean;
	isOpen: boolean;
	menuOpen: boolean;
	renameOpen: boolean;
	renameValue: string;
};

type ProjectItemAction =
	| { type: "setConfirmOpen"; value: boolean }
	| { type: "setOpen"; value: boolean }
	| { type: "setMenuOpen"; value: boolean }
	| { type: "setRenameOpen"; value: boolean }
	| { type: "setRenameValue"; value: string }
	| { type: "openRename"; value: string }
	| { type: "closeRename"; value: string };

const createProjectItemState = (projectName: string): ProjectItemState => ({
	confirmOpen: false,
	isOpen: false,
	menuOpen: false,
	renameOpen: false,
	renameValue: projectName,
});

function projectItemReducer(
	state: ProjectItemState,
	action: ProjectItemAction,
): ProjectItemState {
	switch (action.type) {
		case "setConfirmOpen":
			return {
				...state,
				confirmOpen: action.value,
			};
		case "setOpen":
			return {
				...state,
				isOpen: action.value,
			};
		case "setMenuOpen":
			return {
				...state,
				menuOpen: action.value,
			};
		case "setRenameOpen":
			return {
				...state,
				renameOpen: action.value,
			};
		case "setRenameValue":
			return {
				...state,
				renameValue: action.value,
			};
		case "openRename":
			return {
				...state,
				menuOpen: false,
				renameOpen: true,
				renameValue: action.value,
			};
		case "closeRename":
			return {
				...state,
				renameOpen: false,
				renameValue: action.value,
			};
	}
}

export function NavProjects({
	projects,
	notes,
	currentNoteId,
	currentNoteTitle,
	recordingNoteId = null,
	workspaceId,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
}: {
	projects: Array<Doc<"projects">> | undefined;
	notes: Array<Doc<"notes">> | undefined;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	recordingNoteId?: Id<"notes"> | null;
	workspaceId: Id<"workspaces"> | null;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	const [createOpen, setCreateOpen] = React.useState(false);
	const [name, setName] = React.useState("");
	const [createError, setCreateError] = React.useState<string | null>(null);
	const [isCreatingProject, startProjectCreation] = React.useTransition();
	const createProject = useMutation(api.projects.create);
	const projectEntries = React.useMemo(
		() => buildProjectEntries(projects ?? [], notes ?? []),
		[notes, projects],
	);
	const isPending = projects === undefined || notes === undefined;

	React.useEffect(() => {
		if (createOpen) {
			return;
		}

		setName("");
		setCreateError(null);
	}, [createOpen]);

	const handleCreateProject = React.useCallback(() => {
		if (!workspaceId) {
			return;
		}

		startProjectCreation(async () => {
			try {
				setCreateError(null);
				await createProject({
					workspaceId,
					name,
				});
				setCreateOpen(false);
			} catch (error) {
				setCreateError(
					error instanceof Error ? error.message : "Failed to create project.",
				);
			}
		});
	}, [createProject, name, workspaceId]);

	return (
		<>
			<SidebarCollapsibleGroup
				title="Projects"
				className="group-data-[collapsible=icon]:hidden"
				actionClassName="opacity-0 transition-opacity pointer-events-none group-hover/header:opacity-100 group-hover/header:pointer-events-auto group-focus-within/header:opacity-100 group-focus-within/header:pointer-events-auto"
				actionTooltip="Add project"
				actions={
					<button
						type="button"
						aria-label="Add project"
						className="cursor-pointer"
						onClick={() => setCreateOpen(true)}
					>
						<Plus />
					</button>
				}
			>
				{isPending ? <NavProjectsSkeleton /> : null}
				{!isPending && projectEntries.length === 0 ? (
					<div className="px-2 text-xs text-muted-foreground/50">
						No projects yet
					</div>
				) : null}
				{isPending ? null : (
					<SidebarMenu>
						{projectEntries.map(({ project, notes: projectNotes }) => (
							<ProjectSidebarItem
								key={project._id}
								project={project}
								notes={projectNotes}
								workspaceId={workspaceId}
								currentNoteId={currentNoteId}
								currentNoteTitle={currentNoteTitle}
								recordingNoteId={recordingNoteId}
								onNoteSelect={onNoteSelect}
								onNoteTitleChange={onNoteTitleChange}
								onNoteTrashed={onNoteTrashed}
							/>
						))}
					</SidebarMenu>
				)}
			</SidebarCollapsibleGroup>
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create a project</DialogTitle>
						<DialogDescription>
							Projects group notes in the sidebar without changing what a note
							is.
						</DialogDescription>
					</DialogHeader>
					<ProjectComposer
						name={name}
						onNameChange={setName}
						error={createError}
						nameInputId="project-dialog-name"
					/>
					<div className="flex items-center justify-end gap-2">
						<Button variant="ghost" onClick={() => setCreateOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleCreateProject}
							disabled={isCreatingProject || name.trim().length < 1}
						>
							{isCreatingProject ? (
								<LoaderCircle
									data-icon="inline-start"
									className="animate-spin"
								/>
							) : null}
							Create project
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

function ProjectSidebarItem({
	project,
	notes,
	workspaceId,
	currentNoteId,
	currentNoteTitle,
	recordingNoteId,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
}: {
	project: Doc<"projects">;
	notes: Array<Doc<"notes">>;
	workspaceId: Id<"workspaces"> | null;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	recordingNoteId: Id<"notes"> | null;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	const hasNotes = notes.length > 0;
	const hasActiveNote = notes.some((note) => note._id === currentNoteId);
	const [state, dispatch] = React.useReducer(
		projectItemReducer,
		project.name,
		createProjectItemState,
	);
	const renameInputRef = React.useRef<HTMLInputElement>(null);
	const preventMenuCloseAutoFocusRef = React.useRef(false);
	const ignoreInitialRenameInteractOutsideRef = React.useRef(false);
	const [isRenaming, setIsRenaming] = React.useState(false);
	const [isRemoving, setIsRemoving] = React.useState(false);
	const open = hasActiveNote || state.isOpen;
	const renameValue = state.renameOpen ? state.renameValue : project.name;
	const renameProject = useMutation(api.projects.rename).withOptimisticUpdate(
		(localStore, args) => {
			optimisticUpdateProjectList(localStore, args.workspaceId, (projects) =>
				projects.map((entry) =>
					entry._id === args.id
						? {
								...entry,
								name: normalizeProjectName(args.name),
								normalizedName: toNormalizedProjectKey(args.name),
							}
						: entry,
				),
			);
		},
	);
	const removeProject = useMutation(api.projects.remove).withOptimisticUpdate(
		(localStore, args) => {
			optimisticUpdateProjectList(localStore, args.workspaceId, (projects) =>
				projects.filter((entry) => entry._id !== args.id),
			);
			optimisticClearProjectFromNotes(localStore, args.workspaceId, args.id);
		},
	);

	const handleRename = React.useCallback(async () => {
		if (!workspaceId || isRenaming) {
			return;
		}

		const nextName = normalizeProjectName(renameValue);
		if (nextName.length < 1) {
			toast.error("Project name is required");
			return;
		}

		if (nextName.length > MAX_PROJECT_NAME_LENGTH) {
			toast.error(
				`Project name must be ${MAX_PROJECT_NAME_LENGTH} characters or fewer`,
			);
			return;
		}

		if (nextName === project.name) {
			dispatch({ type: "closeRename", value: nextName });
			return;
		}

		setIsRenaming(true);

		try {
			await renameProject({
				workspaceId,
				id: project._id,
				name: nextName,
			});
			dispatch({ type: "closeRename", value: nextName });
			toast.success("Project renamed");
		} catch (error) {
			console.error("Failed to rename project", error);
			toast.error("Failed to rename project");
		} finally {
			setIsRenaming(false);
		}
	}, [
		isRenaming,
		project._id,
		project.name,
		renameProject,
		renameValue,
		workspaceId,
	]);

	const handleRenameOpenChange = React.useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				dispatch({ type: "setRenameOpen", value: true });
				return;
			}

			void handleRename();
		},
		[handleRename],
	);

	const handleRenameCancel = React.useCallback(() => {
		dispatch({ type: "closeRename", value: project.name });
	}, [project.name]);

	const handleStartRename = React.useCallback(() => {
		preventMenuCloseAutoFocusRef.current = true;
		ignoreInitialRenameInteractOutsideRef.current = true;
		dispatch({ type: "openRename", value: project.name });
	}, [project.name]);

	const handleDeleteProject = React.useCallback(async () => {
		if (!workspaceId || isRemoving) {
			return;
		}

		setIsRemoving(true);

		try {
			await removeProject({
				workspaceId,
				id: project._id,
			});
			dispatch({ type: "setConfirmOpen", value: false });
			toast.success("Project deleted");
		} catch (error) {
			console.error("Failed to delete project", error);
			toast.error("Failed to delete project");
		} finally {
			setIsRemoving(false);
		}
	}, [isRemoving, project._id, removeProject, workspaceId]);

	return (
		<>
			<Collapsible
				open={open}
				onOpenChange={(nextOpen) =>
					dispatch({ type: "setOpen", value: nextOpen })
				}
				className="group/collapsible"
			>
				<SidebarMenuItem className="group/project-item">
					<ProjectSidebarRow
						projectName={project.name}
						workspaceId={workspaceId}
						isOpen={open}
						menuOpen={state.menuOpen}
						renameOpen={state.renameOpen}
						renameValue={renameValue}
						renameInputRef={renameInputRef}
						preventMenuCloseAutoFocusRef={preventMenuCloseAutoFocusRef}
						ignoreInitialRenameInteractOutsideRef={
							ignoreInitialRenameInteractOutsideRef
						}
						onMenuOpenChange={(nextOpen) =>
							dispatch({ type: "setMenuOpen", value: nextOpen })
						}
						onToggleOpen={() => dispatch({ type: "toggleOpen" })}
						onRenameOpenChange={handleRenameOpenChange}
						onStartRename={handleStartRename}
						onRenameValueChange={(value) =>
							dispatch({ type: "setRenameValue", value })
						}
						onRenameCommit={() => {
							void handleRename();
						}}
						onRenameCancel={handleRenameCancel}
						onDeleteSelect={() => {
							dispatch({ type: "setMenuOpen", value: false });
							dispatch({ type: "setConfirmOpen", value: true });
						}}
					/>
					<ProjectSidebarContent
						hasNotes={hasNotes}
						notes={notes}
						currentNoteId={currentNoteId}
						currentNoteTitle={currentNoteTitle}
						recordingNoteId={recordingNoteId}
						onNoteSelect={onNoteSelect}
						onNoteTitleChange={onNoteTitleChange}
						onNoteTrashed={onNoteTrashed}
					/>
				</SidebarMenuItem>
			</Collapsible>
			<ProjectDeleteDialog
				open={state.confirmOpen}
				isRemoving={isRemoving}
				onOpenChange={(nextOpen) =>
					dispatch({ type: "setConfirmOpen", value: nextOpen })
				}
				onConfirm={handleDeleteProject}
			/>
		</>
	);
}

function ProjectSidebarRow({
	projectName,
	workspaceId,
	isOpen,
	menuOpen,
	renameOpen,
	renameValue,
	renameInputRef,
	preventMenuCloseAutoFocusRef,
	ignoreInitialRenameInteractOutsideRef,
	onMenuOpenChange,
	onToggleOpen,
	onRenameOpenChange,
	onStartRename,
	onRenameValueChange,
	onRenameCommit,
	onRenameCancel,
	onDeleteSelect,
}: {
	projectName: string;
	workspaceId: Id<"workspaces"> | null;
	isOpen: boolean;
	menuOpen: boolean;
	renameOpen: boolean;
	renameValue: string;
	renameInputRef: React.RefObject<HTMLInputElement | null>;
	preventMenuCloseAutoFocusRef: React.MutableRefObject<boolean>;
	ignoreInitialRenameInteractOutsideRef: React.MutableRefObject<boolean>;
	onMenuOpenChange: (open: boolean) => void;
	onToggleOpen: () => void;
	onRenameOpenChange: (open: boolean) => void;
	onStartRename: () => void;
	onRenameValueChange: (value: string) => void;
	onRenameCommit: () => void;
	onRenameCancel: () => void;
	onDeleteSelect: () => void;
}) {
	return (
		<Popover open={renameOpen} onOpenChange={onRenameOpenChange}>
			<PopoverAnchor asChild>
				<div className="relative">
					<SidebarMenuButton
						className="pr-8"
						aria-expanded={isOpen}
						onClick={onToggleOpen}
					>
						<span className="relative size-4 shrink-0">
							<span className="absolute inset-0 flex items-center justify-center transition-opacity opacity-100 group-hover/menu-button:opacity-0">
								{isOpen ? <FolderOpen /> : <FolderClosed />}
							</span>
							<ChevronRight
								className={
									isOpen
										? "absolute inset-0 m-auto size-4 rotate-90 text-sidebar-foreground/50 opacity-0 transition-[opacity,transform] group-hover/menu-button:opacity-100"
										: "absolute inset-0 m-auto size-4 text-sidebar-foreground/50 opacity-0 transition-[opacity,transform] group-hover/menu-button:opacity-100"
								}
							/>
						</span>
						<span className="truncate">{projectName}</span>
					</SidebarMenuButton>
					<ProjectActionsMenu
						projectName={projectName}
						workspaceId={workspaceId}
						menuOpen={menuOpen}
						preventMenuCloseAutoFocusRef={preventMenuCloseAutoFocusRef}
						onMenuOpenChange={onMenuOpenChange}
						onStartRename={onStartRename}
						onDeleteSelect={onDeleteSelect}
					/>
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="start"
				side="bottom"
				sideOffset={8}
				className="w-[340px] rounded-lg border-sidebar-border/70 bg-sidebar p-1.5 shadow-2xl ring-1 ring-border/60"
				onOpenAutoFocus={(event) => {
					event.preventDefault();
					requestAnimationFrame(() => {
						const input = renameInputRef.current;
						if (!input) {
							return;
						}

						input.focus();
						input.setSelectionRange(0, input.value.length);
					});
				}}
				onInteractOutside={(event) => {
					if (ignoreInitialRenameInteractOutsideRef.current) {
						event.preventDefault();
						ignoreInitialRenameInteractOutsideRef.current = false;
					}
				}}
			>
				<div className="flex items-center gap-2">
					<NoteTitleEditInput
						focusOnMount
						commitOnBlur={false}
						inputRef={renameInputRef}
						value={renameValue}
						placeholder="Project name"
						maxLength={MAX_PROJECT_NAME_LENGTH}
						onValueChange={onRenameValueChange}
						onCommit={onRenameCommit}
						onCancel={onRenameCancel}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ProjectActionsMenu({
	projectName,
	workspaceId,
	menuOpen,
	preventMenuCloseAutoFocusRef,
	onMenuOpenChange,
	onStartRename,
	onDeleteSelect,
}: {
	projectName: string;
	workspaceId: Id<"workspaces"> | null;
	menuOpen: boolean;
	preventMenuCloseAutoFocusRef: React.MutableRefObject<boolean>;
	onMenuOpenChange: (open: boolean) => void;
	onStartRename: () => void;
	onDeleteSelect: () => void;
}) {
	return (
		<DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
			<DropdownMenuTrigger asChild>
				<SidebarMenuAction
					className="cursor-pointer opacity-0 pointer-events-none transition-opacity group-hover/project-item:opacity-100 group-hover/project-item:pointer-events-auto"
					aria-label={`Open actions for ${projectName}`}
					onPointerDown={(event) => {
						event.stopPropagation();
					}}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
				>
					<MoreHorizontal />
				</SidebarMenuAction>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="w-48 rounded-lg"
				side="right"
				align="start"
				onCloseAutoFocus={(event) => {
					if (preventMenuCloseAutoFocusRef.current) {
						event.preventDefault();
						preventMenuCloseAutoFocusRef.current = false;
					}
				}}
			>
				<DropdownMenuItem disabled={!workspaceId} onClick={onStartRename}>
					<Pencil />
					Rename
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					variant="destructive"
					disabled={!workspaceId}
					onSelect={(event) => {
						event.preventDefault();
						onDeleteSelect();
					}}
				>
					<Trash2 />
					Delete project
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ProjectSidebarContent({
	hasNotes,
	notes,
	currentNoteId,
	currentNoteTitle,
	recordingNoteId,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
}: {
	hasNotes: boolean;
	notes: Array<Doc<"notes">>;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	recordingNoteId: Id<"notes"> | null;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	return (
		<CollapsibleContent
			forceMount
			className="group/project-folder-content data-[state=closed]:block grid overflow-hidden transition-[grid-template-rows,opacity] duration-220 ease-[cubic-bezier(0.23,1,0.32,1)] data-[state=closed]:pointer-events-none data-[state=closed]:grid-rows-[0fr] data-[state=closed]:opacity-0 data-[state=open]:grid-rows-[1fr] data-[state=open]:opacity-100"
		>
			<div className="min-h-0 overflow-hidden">
				{hasNotes ? (
					<SidebarMenuSub className="mr-0 translate-x-0 pr-0 transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-data-[state=closed]/project-folder-content:-translate-y-1 group-data-[state=open]/project-folder-content:translate-y-0">
						{notes.map((note) => (
							<ProjectNoteItem
								key={note._id}
								note={note}
								currentNoteId={currentNoteId}
								currentNoteTitle={currentNoteTitle}
								recordingNoteId={recordingNoteId}
								onNoteSelect={onNoteSelect}
								onNoteTitleChange={onNoteTitleChange}
								onNoteTrashed={onNoteTrashed}
							/>
						))}
					</SidebarMenuSub>
				) : (
					<div className="px-8 py-2 text-xs text-sidebar-foreground/50">
						No notes in project yet
					</div>
				)}
			</div>
		</CollapsibleContent>
	);
}

function ProjectDeleteDialog({
	open,
	isRemoving,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	isRemoving: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. The project will be removed and its
						notes will move back to Home.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
						onClick={onConfirm}
						disabled={isRemoving}
					>
						{isRemoving ? "Deleting..." : "Delete project"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function ProjectNoteItem({
	note,
	currentNoteId,
	currentNoteTitle,
	recordingNoteId,
	onNoteSelect,
	onNoteTitleChange,
	onNoteTrashed,
}: {
	note: Doc<"notes">;
	currentNoteId: Id<"notes"> | null;
	currentNoteTitle?: string;
	recordingNoteId: Id<"notes"> | null;
	onNoteSelect: (noteId: Id<"notes">) => void;
	onNoteTitleChange?: (title: string) => void;
	onNoteTrashed?: (noteId: Id<"notes">) => void;
}) {
	const isActive = note._id === currentNoteId;
	const isRecording = note._id === recordingNoteId;
	const title =
		isActive && currentNoteTitle?.trim() ? currentNoteTitle : note.title;
	const displayTitle = getNoteDisplayTitle(title);

	return (
		<SidebarMenuItem className="group/project-note-item list-none">
			<NoteActionsMenu
				noteId={note._id}
				onMoveToTrash={onNoteTrashed}
				align="start"
				side="right"
				renameAnchor={
					<SidebarMenuButton
						isActive={isActive}
						onClick={() => onNoteSelect(note._id)}
					>
						{isRecording ? <Icons.sidebarRecordingSpinner /> : <FileText />}
						<span>{displayTitle}</span>
					</SidebarMenuButton>
				}
				renamePopoverAlign="start"
				renamePopoverSide="bottom"
				renamePopoverSideOffset={6}
				renamePopoverClassName="w-[340px] rounded-lg border-sidebar-border/70 bg-sidebar p-1.5 shadow-2xl ring-1 ring-border/60"
				onRenamePreviewChange={isActive ? onNoteTitleChange : undefined}
				onRenamePreviewReset={
					isActive ? () => onNoteTitleChange?.(note.title) : undefined
				}
			>
				<SidebarMenuAction
					className="cursor-pointer opacity-0 pointer-events-none transition-opacity group-hover/project-note-item:opacity-100 group-hover/project-note-item:pointer-events-auto"
					aria-label={`Open actions for ${displayTitle}`}
				>
					<MoreHorizontal />
				</SidebarMenuAction>
			</NoteActionsMenu>
		</SidebarMenuItem>
	);
}

function NavProjectsSkeleton() {
	return (
		<div className="px-2">
			<div className="flex flex-col gap-2">
				{SIDEBAR_PROJECT_SKELETON_IDS.map((id) => (
					<div key={id} className="flex items-center gap-2 rounded-md py-1">
						<Skeleton className="size-4 rounded-sm" />
						<Skeleton className="h-4 flex-1" />
					</div>
				))}
			</div>
		</div>
	);
}

function buildProjectEntries(
	projects: Array<Doc<"projects">>,
	notes: Array<Doc<"notes">>,
): Array<ProjectWithNotes> {
	const notesByProjectId = new Map<Id<"projects">, Array<Doc<"notes">>>();

	for (const note of notes) {
		if (!note.projectId) {
			continue;
		}

		const projectNotes = notesByProjectId.get(note.projectId) ?? [];
		projectNotes.push(note);
		notesByProjectId.set(note.projectId, projectNotes);
	}

	return projects.map((project) => ({
		project,
		notes: notesByProjectId.get(project._id) ?? [],
	}));
}

const normalizeProjectName = (value: string) =>
	value.replace(/\s+/g, " ").trim();

const toNormalizedProjectKey = (value: string) =>
	normalizeProjectName(value).toLowerCase();

function sortProjectsByNormalizedName(projects: Array<Doc<"projects">>) {
	return [...projects].sort((left, right) => {
		const normalizedComparison = left.normalizedName.localeCompare(
			right.normalizedName,
		);
		if (normalizedComparison !== 0) {
			return normalizedComparison;
		}

		return left._creationTime - right._creationTime;
	});
}

function optimisticUpdateProjectList(
	localStore: OptimisticLocalStore,
	workspaceId: Id<"workspaces">,
	updateProjects: (projects: Array<Doc<"projects">>) => Array<Doc<"projects">>,
) {
	const projects = localStore.getQuery(api.projects.list, { workspaceId });
	if (projects === undefined) {
		return;
	}

	localStore.setQuery(
		api.projects.list,
		{ workspaceId },
		sortProjectsByNormalizedName(updateProjects(projects)),
	);
}

function optimisticClearProjectFromNotes(
	localStore: OptimisticLocalStore,
	workspaceId: Id<"workspaces">,
	projectId: Id<"projects">,
) {
	const noteQueries = [
		api.notes.list,
		api.notes.listShared,
		api.notes.listArchived,
	] as const;
	const matchedNoteIds = new Set<Id<"notes">>();

	for (const noteQuery of noteQueries) {
		const notes = localStore.getQuery(noteQuery, { workspaceId });
		if (notes === undefined) {
			continue;
		}

		localStore.setQuery(
			noteQuery,
			{ workspaceId },
			notes.map((note) => {
				if (note.projectId !== projectId) {
					return note;
				}

				matchedNoteIds.add(note._id);
				return {
					...note,
					projectId: undefined,
				};
			}),
		);
	}

	for (const noteId of matchedNoteIds) {
		const activeNote = localStore.getQuery(api.notes.get, {
			workspaceId,
			id: noteId,
		});
		if (!activeNote || activeNote.projectId !== projectId) {
			continue;
		}

		localStore.setQuery(
			api.notes.get,
			{ workspaceId, id: noteId },
			{
				...activeNote,
				projectId: undefined,
			},
		);
	}

	const latestNote = localStore.getQuery(api.notes.getLatest, { workspaceId });
	if (latestNote?.projectId === projectId) {
		localStore.setQuery(
			api.notes.getLatest,
			{ workspaceId },
			{
				...latestNote,
				projectId: undefined,
			},
		);
	}
}
