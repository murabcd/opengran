import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Icons } from "@workspace/ui/components/icons";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@workspace/ui/components/input-group";
import { Kbd } from "@workspace/ui/components/kbd";
import { OpenGranMark } from "@workspace/ui/components/open-gran-mark";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Switch } from "@workspace/ui/components/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import {
	ArrowUp,
	AtSign,
	Check,
	CirclePlus,
	FileText,
	Globe,
	Grid3x3,
	type LucideIcon,
	Plus,
	Square,
	X,
} from "lucide-react";
import * as React from "react";
import {
	type ChatAttachment,
	FileAttachmentButton,
	FileAttachmentChips,
	hasUploadingAttachments,
} from "@/components/ai-elements/file-attachment-controls";
import { chatModels } from "@/lib/ai/models";
import { getAvatarSrc } from "@/lib/avatar";
import {
	type ChatAppSourceProvider,
	getAppSourceLabel,
	getSelectedScopeLabel,
} from "@/lib/chat-source-display";
import type { WorkspaceRecord } from "@/lib/workspaces";

type ContextPage = {
	id: string;
	title: string;
	icon: LucideIcon;
	preview: string;
};

type WorkspaceSource = {
	id: string;
	title: string;
	preview: string;
};

type AppSource = {
	id: string;
	title: string;
	preview: string;
	provider: ChatAppSourceProvider;
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

type ChatComposerProps = {
	useCompactLayout: boolean;
	draft: string;
	editingMessageId?: string | null;
	topAccessory?: React.ReactNode;
	onDraftChange: (value: string) => void;
	onDraftKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
	onCancelEdit?: () => void;
	onSubmit: () => void | Promise<void>;
	onStop: () => void;
	attachedFiles: ChatAttachment[];
	onAttachedFilesChange: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
	isLoading: boolean;
	selectedModel: (typeof chatModels)[number];
	modelPopoverOpen: boolean;
	onModelPopoverOpenChange: (open: boolean) => void;
	onSelectedModelChange: (model: (typeof chatModels)[number]) => void;
	mentionPopoverOpen: boolean;
	onMentionPopoverOpenChange: (open: boolean) => void;
	documentSearchTerm: string;
	onDocumentSearchTermChange: (value: string) => void;
	mentions: string[];
	contextPages: ContextPage[];
	mentionableDocuments: ContextPage[];
	isNotesLoading: boolean;
	emptyStateMessage: string;
	shouldSearchDocuments: boolean;
	onAddMention: (pageId: string) => void;
	onRemoveMention: (pageId: string) => void;
	sourcesOpen: boolean;
	onSourcesOpenChange: (open: boolean) => void;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange: (value: boolean) => void;
	appsEnabled: boolean;
	onAppsEnabledChange: (value: boolean) => void;
	sourceSearchTerm: string;
	onSourceSearchTermChange: (value: string) => void;
	selectedSourceIds: string[];
	workspaceSources: WorkspaceSource[];
	workspaceSourceId: string | null;
	activeWorkspace: WorkspaceRecord | null;
	appSources: AppSource[];
	onToggleSource: (sourceId: string) => void;
	onClearSelectedSources: () => void;
	onOpenConnectionsSettings: () => void;
};

export function ChatComposer({
	useCompactLayout,
	draft,
	editingMessageId,
	topAccessory,
	onDraftChange,
	onDraftKeyDown,
	onCancelEdit,
	onSubmit,
	onStop,
	attachedFiles,
	onAttachedFilesChange,
	isLoading,
	selectedModel,
	modelPopoverOpen,
	onModelPopoverOpenChange,
	onSelectedModelChange,
	mentionPopoverOpen,
	onMentionPopoverOpenChange,
	documentSearchTerm,
	onDocumentSearchTermChange,
	mentions,
	contextPages,
	mentionableDocuments,
	isNotesLoading,
	emptyStateMessage,
	shouldSearchDocuments,
	onAddMention,
	onRemoveMention,
	sourcesOpen,
	onSourcesOpenChange,
	webSearchEnabled,
	onWebSearchEnabledChange,
	appsEnabled,
	onAppsEnabledChange,
	sourceSearchTerm,
	onSourceSearchTermChange,
	selectedSourceIds,
	workspaceSources,
	workspaceSourceId,
	activeWorkspace,
	appSources,
	onToggleSource,
	onClearSelectedSources,
	onOpenConnectionsSettings,
}: ChatComposerProps) {
	const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
	const noteMentionRangeRef = React.useRef<NoteMentionRange | null>(null);
	const filteredWorkspaceSources = filterWorkspaceSources(
		workspaceSources,
		sourceSearchTerm,
	);
	const scopesLabel = getSelectedScopeLabel({
		selectedSourceIds,
		workspaceSourceId,
		workspaceLabel: activeWorkspace?.name ?? null,
		workspaceSources,
		appSources,
	});
	const mentionedPages = React.useMemo(
		() =>
			mentions.flatMap((mentionId) => {
				const document = contextPages.find((page) => page.id === mentionId);
				return document ? [document] : [];
			}),
		[contextPages, mentions],
	);
	const selectedWorkspaceSourceChips = React.useMemo(
		() =>
			selectedSourceIds.flatMap((sourceId) => {
				if (sourceId.startsWith("app:") || sourceId.startsWith("workspace:")) {
					return [];
				}

				const source = workspaceSources.find((item) => item.id === sourceId);
				return source ? [source] : [];
			}),
		[selectedSourceIds, workspaceSources],
	);
	const showTopAddon = true;
	useChatComposerPromptFocus({
		promptRef,
		editingMessageId,
		onCancelEdit,
	});
	const handleDraftChange = React.useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>) => {
			const nextDraft = event.target.value;
			const mentionRange = findNoteMentionRange(
				nextDraft,
				event.target.selectionStart,
			);

			onDraftChange(nextDraft);
			noteMentionRangeRef.current = mentionRange;

			if (mentionRange) {
				onDocumentSearchTermChange(mentionRange.query);
				onMentionPopoverOpenChange(true);
			}
		},
		[onDocumentSearchTermChange, onDraftChange, onMentionPopoverOpenChange],
	);
	const handlePromptKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.key === "@" || (event.shiftKey && event.code === "Digit2")) {
				if (event.metaKey || event.ctrlKey || event.altKey) {
					onDraftKeyDown(event);
					return;
				}

				const selectionStart = event.currentTarget.selectionStart;
				const selectionEnd = event.currentTarget.selectionEnd;
				const nextDraft = `${event.currentTarget.value.slice(0, selectionStart)}@${event.currentTarget.value.slice(selectionEnd)}`;
				const mentionRange = findNoteMentionRange(
					nextDraft,
					selectionStart + 1,
				);

				if (mentionRange) {
					event.preventDefault();
					noteMentionRangeRef.current = {
						start: selectionStart,
						end: selectionStart,
						query: "",
					};
					onDocumentSearchTermChange("");
					onMentionPopoverOpenChange(true);
					return;
				}
			}

			onDraftKeyDown(event);
		},
		[onDocumentSearchTermChange, onDraftKeyDown, onMentionPopoverOpenChange],
	);
	const handleAddMention = React.useCallback(
		(pageId: string) => {
			const noteMentionRange = noteMentionRangeRef.current;
			onAddMention(pageId);

			if (noteMentionRange) {
				const nextCursorPosition = noteMentionRange.start;
				onDraftChange(
					`${draft.slice(0, noteMentionRange.start)}${draft.slice(noteMentionRange.end)}`,
				);
				window.requestAnimationFrame(() => {
					promptRef.current?.focus({ preventScroll: true });
					promptRef.current?.setSelectionRange(
						nextCursorPosition,
						nextCursorPosition,
					);
				});
			}

			noteMentionRangeRef.current = null;
		},
		[draft, onAddMention, onDraftChange],
	);

	return (
		<div
			className={`relative mx-auto w-full max-w-xl ${useCompactLayout ? "mt-auto" : ""}`}
		>
			<label htmlFor="chat-prompt" className="sr-only">
				Prompt
			</label>
			<ChatComposerTopAccessory
				editingMessageId={editingMessageId}
				onCancelEdit={onCancelEdit}
				topAccessory={topAccessory}
			/>
			<InputGroup
				className={`${useCompactLayout ? "min-h-[96px]" : "min-h-[148px]"} max-h-[32rem] overflow-hidden rounded-lg border-input/30 bg-background bg-clip-padding shadow-sm has-disabled:bg-background has-disabled:opacity-100 dark:bg-input/30 dark:has-disabled:bg-input/30`}
			>
				{showTopAddon ? (
					<ChatComposerTopAddon
						useCompactLayout={useCompactLayout}
						mentionedPages={mentionedPages}
						selectedWorkspaceSources={selectedWorkspaceSourceChips}
						attachedFiles={attachedFiles}
						onRemoveMention={onRemoveMention}
						onRemoveSelectedSource={onToggleSource}
						onRemoveAttachedFile={(index) =>
							onAttachedFilesChange(
								attachedFiles.filter((_, fileIndex) => fileIndex !== index),
							)
						}
						mentionPicker={
							<MentionPicker
								open={mentionPopoverOpen}
								onOpenChange={onMentionPopoverOpenChange}
								documentSearchTerm={documentSearchTerm}
								onDocumentSearchTermChange={onDocumentSearchTermChange}
								mentionableDocuments={mentionableDocuments}
								isNotesLoading={isNotesLoading}
								emptyStateMessage={emptyStateMessage}
								shouldSearchDocuments={shouldSearchDocuments}
								onAddMention={handleAddMention}
							/>
						}
					/>
				) : null}

				<InputGroupTextarea
					ref={promptRef}
					id="chat-prompt"
					value={draft}
					onChange={handleDraftChange}
					onKeyDown={handlePromptKeyDown}
					rows={useCompactLayout ? 1 : 3}
					placeholder="Ask, search, or make anything..."
					className={`${useCompactLayout ? "min-h-[40px] pt-2 pb-0" : "min-h-[64px] pt-2"} max-h-[24rem] overflow-y-auto px-4 text-base font-normal placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0`}
				/>

				<ChatComposerFooter
					useCompactLayout={useCompactLayout}
					draft={draft}
					attachedFiles={attachedFiles}
					isLoading={isLoading}
					onAttachedFilesChange={onAttachedFilesChange}
					onSubmit={onSubmit}
					onStop={onStop}
					modelPicker={
						<ModelPicker
							open={modelPopoverOpen}
							onOpenChange={onModelPopoverOpenChange}
							selectedModel={selectedModel}
							onSelectedModelChange={onSelectedModelChange}
						/>
					}
					scopePicker={
						<ScopePicker
							open={sourcesOpen}
							onOpenChange={onSourcesOpenChange}
							scopesLabel={scopesLabel}
							webSearchEnabled={webSearchEnabled}
							onWebSearchEnabledChange={onWebSearchEnabledChange}
							appsEnabled={appsEnabled}
							onAppsEnabledChange={onAppsEnabledChange}
							selectedSourceIds={selectedSourceIds}
							sourceSearchTerm={sourceSearchTerm}
							onSourceSearchTermChange={onSourceSearchTermChange}
							filteredWorkspaceSources={filteredWorkspaceSources}
							workspaceSourceId={workspaceSourceId}
							activeWorkspace={activeWorkspace}
							appSources={appSources}
							isNotesLoading={isNotesLoading}
							onToggleSource={onToggleSource}
							onClearSelectedSources={onClearSelectedSources}
							onOpenConnectionsSettings={onOpenConnectionsSettings}
						/>
					}
				/>
			</InputGroup>
		</div>
	);
}

function useChatComposerPromptFocus({
	promptRef,
	editingMessageId,
	onCancelEdit,
}: {
	promptRef: React.RefObject<HTMLTextAreaElement | null>;
	editingMessageId: string | null | undefined;
	onCancelEdit?: () => void;
}) {
	const focusPrompt = React.useCallback(() => {
		const prompt = promptRef.current;
		if (!prompt) {
			return;
		}

		const activeElement = document.activeElement;
		const isEditableElement =
			activeElement instanceof HTMLElement &&
			(activeElement instanceof HTMLInputElement ||
				activeElement instanceof HTMLTextAreaElement ||
				activeElement instanceof HTMLSelectElement ||
				activeElement.isContentEditable);

		if (isEditableElement && activeElement !== prompt) {
			return;
		}

		prompt.focus({ preventScroll: true });
		const selectionEnd = prompt.value.length;
		prompt.setSelectionRange(selectionEnd, selectionEnd);
	}, [promptRef]);

	React.useEffect(() => {
		focusPrompt();
	}, [focusPrompt]);

	React.useEffect(() => {
		if (!editingMessageId) {
			return;
		}

		focusPrompt();
	}, [editingMessageId, focusPrompt]);

	React.useEffect(() => {
		if (!editingMessageId || !onCancelEdit) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}

			event.preventDefault();
			onCancelEdit();
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [editingMessageId, onCancelEdit]);
}

function MentionPicker({
	open,
	onOpenChange,
	documentSearchTerm,
	onDocumentSearchTermChange,
	mentionableDocuments,
	isNotesLoading,
	emptyStateMessage,
	shouldSearchDocuments,
	onAddMention,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	documentSearchTerm: string;
	onDocumentSearchTermChange: (value: string) => void;
	mentionableDocuments: ContextPage[];
	isNotesLoading: boolean;
	emptyStateMessage: string;
	shouldSearchDocuments: boolean;
	onAddMention: (pageId: string) => void;
}) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger
					asChild
					onFocusCapture={(event) => event.stopPropagation()}
				>
					<PopoverTrigger asChild>
						<InputGroupButton
							variant="ghost"
							size="icon-sm"
							className="rounded-full bg-transparent text-muted-foreground transition-transform hover:bg-muted hover:text-foreground"
						>
							<AtSign />
							<span className="sr-only">Mention a page</span>
						</InputGroupButton>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Add context</TooltipContent>
			</Tooltip>

			<PopoverContent
				className="p-0 [&_[data-slot=scroll-area]]:w-full [&_[data-slot=scroll-area-viewport]]:w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:w-full [&_[data-slot=scroll-area-viewport]>div]:min-w-0 [&_[data-slot=command-list]]:w-full [&_[data-slot=command-list]]:min-w-0"
				align="start"
			>
				<Command>
					<CommandInput
						placeholder="Search notes..."
						value={documentSearchTerm}
						onValueChange={onDocumentSearchTermChange}
					/>
					<CommandList>
						{isNotesLoading ? (
							<CommandGroup heading="Notes">
								<ChatNoteListSkeleton />
							</CommandGroup>
						) : null}
						<CommandEmpty>{emptyStateMessage}</CommandEmpty>
						{mentionableDocuments.length > 0 ? (
							<CommandGroup
								heading={shouldSearchDocuments ? "Search results" : "Notes"}
							>
								{mentionableDocuments.map((document) => (
									<CommandItem
										key={document.id}
										value={`${document.id} ${document.title}`}
										onSelect={() => onAddMention(document.id)}
										className="w-full cursor-pointer gap-1.5 overflow-hidden rounded-md px-1.5"
									>
										<div className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
											<document.icon className="size-4" />
										</div>
										<div
											className="min-w-0 flex-1 truncate"
											title={document.title}
										>
											{document.title}
										</div>
									</CommandItem>
								))}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function ChatComposerTopAccessory({
	editingMessageId,
	onCancelEdit,
	topAccessory,
}: {
	editingMessageId: string | null | undefined;
	onCancelEdit?: () => void;
	topAccessory?: React.ReactNode;
}) {
	if (editingMessageId && onCancelEdit) {
		return (
			<div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-3 flex justify-center">
				<button
					type="button"
					onClick={onCancelEdit}
					className="pointer-events-auto inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-secondary/80 px-4 py-1.5 text-sm text-secondary-foreground shadow-sm hover:bg-secondary"
					aria-label="Cancel edit"
				>
					<span>Cancel edit</span>
					<Kbd className="rounded-full border border-border/60 bg-muted px-2">
						Esc
					</Kbd>
				</button>
			</div>
		);
	}

	if (!topAccessory) {
		return null;
	}

	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-3 flex justify-center">
			<div className="pointer-events-auto">{topAccessory}</div>
		</div>
	);
}

function ChatComposerTopAddon({
	useCompactLayout,
	mentionedPages,
	selectedWorkspaceSources,
	attachedFiles,
	onRemoveMention,
	onRemoveSelectedSource,
	onRemoveAttachedFile,
	mentionPicker,
}: {
	useCompactLayout: boolean;
	mentionedPages: ContextPage[];
	selectedWorkspaceSources: WorkspaceSource[];
	attachedFiles: ChatAttachment[];
	onRemoveMention: (pageId: string) => void;
	onRemoveSelectedSource: (sourceId: string) => void;
	onRemoveAttachedFile: (index: number) => void;
	mentionPicker: React.ReactNode;
}) {
	return (
		<InputGroupAddon
			align="block-start"
			className={`px-4 pb-0 ${useCompactLayout ? "pt-2.5" : "pt-4"}`}
		>
			{mentionPicker}
			{mentionedPages.length > 0 ? (
				<ChatComposerMentionChips
					mentionedPages={mentionedPages}
					onRemoveMention={onRemoveMention}
				/>
			) : null}
			{selectedWorkspaceSources.length > 0 ? (
				<ChatComposerSelectedSourceChips
					selectedWorkspaceSources={selectedWorkspaceSources}
					onRemoveSelectedSource={onRemoveSelectedSource}
				/>
			) : null}
			<FileAttachmentChips
				files={attachedFiles}
				onRemove={onRemoveAttachedFile}
			/>
		</InputGroupAddon>
	);
}

function ChatComposerMentionChips({
	mentionedPages,
	onRemoveMention,
}: {
	mentionedPages: ContextPage[];
	onRemoveMention: (pageId: string) => void;
}) {
	return (
		<div className="no-scrollbar -m-1.5 flex gap-1 overflow-y-auto p-1.5">
			{mentionedPages.map((document) => (
				<InputGroupButton
					key={document.id}
					size="sm"
					variant="secondary"
					className="group/note-mention-chip max-w-48 rounded-full pl-2!"
					onClick={() => onRemoveMention(document.id)}
				>
					<document.icon />
					<span className="min-w-0 truncate">{document.title}</span>
					<X className="opacity-0 transition-opacity group-hover/note-mention-chip:opacity-100 group-focus-visible/note-mention-chip:opacity-100" />
				</InputGroupButton>
			))}
		</div>
	);
}

function ChatComposerSelectedSourceChips({
	selectedWorkspaceSources,
	onRemoveSelectedSource,
}: {
	selectedWorkspaceSources: WorkspaceSource[];
	onRemoveSelectedSource: (sourceId: string) => void;
}) {
	return (
		<div className="no-scrollbar -m-1.5 flex gap-1 overflow-y-auto p-1.5">
			{selectedWorkspaceSources.map((source) => (
				<InputGroupButton
					key={source.id}
					size="sm"
					variant="secondary"
					className="group/source-chip max-w-48 rounded-full pl-2!"
					onClick={() => onRemoveSelectedSource(source.id)}
				>
					<FileText />
					<span className="min-w-0 truncate">{source.title}</span>
					<X className="opacity-0 transition-opacity group-hover/source-chip:opacity-100 group-focus-visible/source-chip:opacity-100" />
				</InputGroupButton>
			))}
		</div>
	);
}

function ChatComposerFooter({
	useCompactLayout,
	draft,
	attachedFiles,
	isLoading,
	onAttachedFilesChange,
	onSubmit,
	onStop,
	modelPicker,
	scopePicker,
}: {
	useCompactLayout: boolean;
	draft: string;
	attachedFiles: ChatAttachment[];
	isLoading: boolean;
	onAttachedFilesChange: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
	onSubmit: () => void | Promise<void>;
	onStop: () => void;
	modelPicker: React.ReactNode;
	scopePicker: React.ReactNode;
}) {
	return (
		<InputGroupAddon
			align="block-end"
			className={`gap-1 px-4 ${useCompactLayout ? "pb-2.5" : "pb-4"}`}
		>
			<FileAttachmentButton
				disabled={isLoading}
				onFileUploadFailed={(id) =>
					onAttachedFilesChange((files) =>
						files.filter((file) => file.id !== id),
					)
				}
				onFileUploaded={(id, uploadedFile) =>
					onAttachedFilesChange((files) =>
						files.map((file) =>
							file.id === id
								? {
										...file,
										localUrl: undefined,
										uploadStatus: "ready",
										url: uploadedFile.url,
									}
								: file,
						),
					)
				}
				onFilesAdded={(files) =>
					onAttachedFilesChange((currentFiles) => [...currentFiles, ...files])
				}
			/>
			{modelPicker}
			{scopePicker}
			<InputGroupButton
				aria-label={isLoading ? "Stop streaming" : "Send"}
				className="ml-auto rounded-full"
				variant="default"
				size="icon-sm"
				disabled={
					!isLoading &&
					((!draft.trim() && attachedFiles.length === 0) ||
						hasUploadingAttachments(attachedFiles))
				}
				onClick={() => {
					if (isLoading) {
						onStop();
						return;
					}

					void onSubmit();
				}}
			>
				{isLoading ? (
					<Square className="size-3.5 fill-current" />
				) : (
					<ArrowUp className="size-4" />
				)}
			</InputGroupButton>
		</InputGroupAddon>
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
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<InputGroupButton
							size="sm"
							className="group rounded-full gap-2 font-normal"
						>
							<Icons.codexLogo className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground group-data-[state=open]:text-foreground" />
							{selectedModel.name}
						</InputGroupButton>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Select model</TooltipContent>
			</Tooltip>
			<DropdownMenuContent side="top" align="start">
				<DropdownMenuGroup className="w-42">
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						OpenAI
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
								<Icons.codexLogo className="size-3.5 text-muted-foreground" />
								{model.name}
							</span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ScopePicker({
	open,
	onOpenChange,
	scopesLabel,
	webSearchEnabled,
	onWebSearchEnabledChange,
	appsEnabled,
	onAppsEnabledChange,
	selectedSourceIds,
	sourceSearchTerm,
	onSourceSearchTermChange,
	filteredWorkspaceSources,
	workspaceSourceId,
	activeWorkspace,
	appSources,
	isNotesLoading,
	onToggleSource,
	onClearSelectedSources,
	onOpenConnectionsSettings,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	scopesLabel: string;
	webSearchEnabled: boolean;
	onWebSearchEnabledChange: (value: boolean) => void;
	appsEnabled: boolean;
	onAppsEnabledChange: (value: boolean) => void;
	selectedSourceIds: string[];
	sourceSearchTerm: string;
	onSourceSearchTermChange: (value: string) => void;
	filteredWorkspaceSources: WorkspaceSource[];
	workspaceSourceId: string | null;
	activeWorkspace: WorkspaceRecord | null;
	appSources: AppSource[];
	isNotesLoading: boolean;
	onToggleSource: (sourceId: string) => void;
	onClearSelectedSources: () => void;
	onOpenConnectionsSettings: () => void;
}) {
	const keepScopePickerOpen = React.useCallback((event: Event) => {
		event.preventDefault();
	}, []);
	const workspaceSourceSelected = workspaceSourceId
		? selectedSourceIds.includes(workspaceSourceId)
		: false;
	const selectedWorkspaceNoteCount = selectedSourceIds.filter(
		(sourceId) =>
			!sourceId.startsWith("app:") && !sourceId.startsWith("workspace:"),
	).length;
	const hasWorkspaceScopes =
		workspaceSourceSelected || selectedWorkspaceNoteCount > 0;
	const isSearchingWorkspaceNotes = sourceSearchTerm.trim().length > 0;

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<InputGroupButton
							size="sm"
							className="group max-w-[180px] justify-start rounded-full font-normal"
						>
							<Globe className="text-muted-foreground transition-colors group-hover:text-foreground group-data-[state=open]:text-foreground" />
							<span className="max-w-[160px] truncate">{scopesLabel}</span>
						</InputGroupButton>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Select scope</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				side="top"
				align="start"
				sideOffset={4}
				className="w-72"
			>
				<DropdownMenuGroup>
					<DropdownMenuItem
						asChild
						onSelect={(event) => event.preventDefault()}
					>
						<label htmlFor="web-search">
							<Globe /> Web search
							<Switch
								id="web-search"
								className="ml-auto"
								checked={webSearchEnabled}
								onCheckedChange={onWebSearchEnabledChange}
							/>
						</label>
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<label className="sr-only" htmlFor="apps">
						Apps and integrations
					</label>
					<DropdownMenuItem
						asChild
						onSelect={(event) => event.preventDefault()}
					>
						<label htmlFor="apps">
							<Grid3x3 aria-hidden="true" />
							<span aria-hidden="true">Tools and integrations</span>
							<span className="sr-only">Apps and integrations</span>
							<Switch
								id="apps"
								className="ml-auto"
								checked={appsEnabled}
								onCheckedChange={onAppsEnabledChange}
							/>
						</label>
					</DropdownMenuItem>
					<DropdownMenuCheckboxItem
						checked={selectedSourceIds.length === 0}
						className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
						onSelect={keepScopePickerOpen}
						onCheckedChange={(checked) => {
							if (checked) {
								onClearSelectedSources();
							}
						}}
					>
						<CirclePlus /> All sources I can access
					</DropdownMenuCheckboxItem>
					<WorkspaceScopeMenu
						hasWorkspaceScopes={hasWorkspaceScopes}
						workspaceSourceId={workspaceSourceId}
						onToggleSource={onToggleSource}
						activeWorkspace={activeWorkspace}
						selectedWorkspaceNoteCount={selectedWorkspaceNoteCount}
						workspaceSourceSelected={workspaceSourceSelected}
						sourceSearchTerm={sourceSearchTerm}
						onSourceSearchTermChange={onSourceSearchTermChange}
						isSearchingWorkspaceNotes={isSearchingWorkspaceNotes}
						isNotesLoading={isNotesLoading}
						filteredWorkspaceSources={filteredWorkspaceSources}
						selectedSourceIds={selectedSourceIds}
					/>
					{appSources.map((source, index) => {
						const selected = selectedSourceIds.includes(source.id);
						const sourceKey = source.id
							? `${source.provider ?? "app"}:${source.id}`
							: `app-source-${index}`;

						return (
							<DropdownMenuCheckboxItem
								key={sourceKey}
								checked={selected}
								className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
								onSelect={keepScopePickerOpen}
								onCheckedChange={() => onToggleSource(source.id)}
							>
								{source.provider === "google-calendar" ? (
									<Icons.googleCalendarLogo className="size-4" />
								) : source.provider === "google-drive" ? (
									<Icons.googleDriveLogo className="size-4" />
								) : source.provider === "yandex-calendar" ? (
									<Icons.yandexCalendarLogo className="size-4" />
								) : source.provider === "yandex-tracker" ? (
									<Icons.yandexTrackerLogo className="size-4 text-blue-500" />
								) : source.provider === "jira" ? (
									<Icons.jiraLogo className="size-4" />
								) : source.provider === "notion" ? (
									<Icons.notionLogo className="size-4" />
								) : source.provider === "posthog" ? (
									<Icons.planeLogo className="size-4" />
								) : (
									<Grid3x3 className="size-4" />
								)}
								<div className="min-w-0">
									<div className="truncate">
										{getAppSourceLabel(source.provider)}
									</div>
								</div>
							</DropdownMenuCheckboxItem>
						);
					})}
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						aria-label="Connect apps"
						onClick={onOpenConnectionsSettings}
					>
						<Plus aria-hidden="true" />
						<span aria-hidden="true">Connect tools</span>
						<span className="sr-only">Connect apps</span>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function WorkspaceScopeMenu({
	hasWorkspaceScopes,
	workspaceSourceId,
	onToggleSource,
	activeWorkspace,
	selectedWorkspaceNoteCount,
	workspaceSourceSelected,
	sourceSearchTerm,
	onSourceSearchTermChange,
	isSearchingWorkspaceNotes,
	isNotesLoading,
	filteredWorkspaceSources,
	selectedSourceIds,
}: {
	hasWorkspaceScopes: boolean;
	workspaceSourceId: string | null;
	onToggleSource: (sourceId: string) => void;
	activeWorkspace: WorkspaceRecord | null;
	selectedWorkspaceNoteCount: number;
	workspaceSourceSelected: boolean;
	sourceSearchTerm: string;
	onSourceSearchTermChange: (value: string) => void;
	isSearchingWorkspaceNotes: boolean;
	isNotesLoading: boolean;
	filteredWorkspaceSources: WorkspaceSource[];
	selectedSourceIds: string[];
}) {
	const activeWorkspaceAvatarSrc = activeWorkspace
		? (activeWorkspace.iconUrl ??
			getAvatarSrc({
				name: activeWorkspace.name,
			}))
		: null;
	const activeWorkspaceInitials = activeWorkspace
		? activeWorkspace.name
				.split(" ")
				.map((part) => part[0])
				.join("")
				.slice(0, 2)
				.toUpperCase()
		: "WG";

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger
				className={hasWorkspaceScopes ? "[&>svg:last-child]:ml-2!" : ""}
				onClick={() => {
					if (workspaceSourceId) {
						onToggleSource(workspaceSourceId);
					}
				}}
			>
				<WorkspaceScopeAvatar
					activeWorkspace={activeWorkspace}
					activeWorkspaceAvatarSrc={activeWorkspaceAvatarSrc}
					activeWorkspaceInitials={activeWorkspaceInitials}
				/>
				{activeWorkspace?.name ?? "Workspace"}
				{hasWorkspaceScopes ? (
					<span className="ml-auto flex items-center gap-2">
						{!workspaceSourceSelected ? (
							<span className="text-xs text-muted-foreground tabular-nums">
								{selectedWorkspaceNoteCount === 1
									? "1 source"
									: `${selectedWorkspaceNoteCount} sources`}
							</span>
						) : null}
						<Check className="size-4 text-muted-foreground" />
					</span>
				) : null}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-72 border-input/30 p-0">
				<Command>
					<div>
						<CommandInput
							placeholder="Select a note"
							value={sourceSearchTerm}
							onValueChange={onSourceSearchTermChange}
						/>
					</div>
					<CommandList>
						<CommandGroup>
							<CommandItem
								value={activeWorkspace?.name ?? "workspace"}
								onSelect={() => {
									if (workspaceSourceId) {
										onToggleSource(workspaceSourceId);
									}
								}}
								className="relative w-full gap-2 pr-8"
							>
								<WorkspaceScopeAvatar
									activeWorkspace={activeWorkspace}
									activeWorkspaceAvatarSrc={activeWorkspaceAvatarSrc}
									activeWorkspaceInitials={activeWorkspaceInitials}
								/>
								<div className="min-w-0 flex-1">
									<div className="truncate">
										{activeWorkspace?.name ?? "Workspace"}
									</div>
								</div>
								{workspaceSourceSelected ? (
									<span className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center">
										<Check className="size-4" />
									</span>
								) : null}
							</CommandItem>
						</CommandGroup>
						{isSearchingWorkspaceNotes && isNotesLoading ? (
							<CommandGroup heading="Notes">
								<ChatNoteListSkeleton />
							</CommandGroup>
						) : null}
						{isSearchingWorkspaceNotes ? (
							<CommandEmpty>No notes found.</CommandEmpty>
						) : (
							<div className="px-3 py-2 text-xs text-muted-foreground">
								Type to find notes in this workspace.
							</div>
						)}
						{isSearchingWorkspaceNotes ? (
							<CommandGroup heading="Notes">
								{filteredWorkspaceSources.map((source) => {
									const selected = selectedSourceIds.includes(source.id);

									return (
										<CommandItem
											key={source.id}
											value={`${source.id} ${source.title}`}
											onSelect={() => onToggleSource(source.id)}
											className="relative w-full gap-2 pr-8"
										>
											<FileText className="size-4" />
											<div className="min-w-0 flex-1">
												<div className="truncate">{source.title}</div>
											</div>
											{selected ? (
												<span className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center">
													<Check className="size-4" />
												</span>
											) : null}
										</CommandItem>
									);
								})}
							</CommandGroup>
						) : null}
					</CommandList>
				</Command>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function WorkspaceScopeAvatar({
	activeWorkspace,
	activeWorkspaceAvatarSrc,
	activeWorkspaceInitials,
}: {
	activeWorkspace: WorkspaceRecord | null;
	activeWorkspaceAvatarSrc: string | null;
	activeWorkspaceInitials: string;
}) {
	if (!activeWorkspace) {
		return (
			<span className="flex size-4 items-center justify-center text-muted-foreground">
				<OpenGranMark className="size-4" />
			</span>
		);
	}

	return (
		<Avatar className="size-4 rounded-sm">
			<AvatarImage
				src={activeWorkspaceAvatarSrc ?? undefined}
				alt={activeWorkspace.name}
			/>
			<AvatarFallback className="rounded-sm text-[8px]">
				{activeWorkspaceInitials}
			</AvatarFallback>
		</Avatar>
	);
}

function ChatNoteListSkeleton() {
	return (
		<div className="space-y-2 px-1 py-1">
			{["primary", "secondary"].map((item) => (
				<div
					key={item}
					className="flex items-center gap-2 rounded-md px-2 py-2"
				>
					<Skeleton className="size-4 rounded-sm" />
					<Skeleton className="h-4 w-32 max-w-full" />
				</div>
			))}
		</div>
	);
}

const filterWorkspaceSources = (
	workspaceSources: WorkspaceSource[],
	query: string,
) => {
	const normalizedQuery = query.trim().toLowerCase();

	if (!normalizedQuery) {
		return workspaceSources;
	}

	return workspaceSources.filter((source) =>
		[source.title, source.preview]
			.join(" ")
			.toLowerCase()
			.includes(normalizedQuery),
	);
};
