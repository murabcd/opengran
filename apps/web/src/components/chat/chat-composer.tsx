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
	Folder,
	Globe,
	LayoutGrid,
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
import {
	type ChatAppSourceProvider,
	getAppSourceLabel,
	getSelectedScopeLabel,
} from "@/lib/chat-source-display";

type ContextPage = {
	id: string;
	title: string;
	icon: LucideIcon;
	preview: string;
};

type ProjectSource = {
	id: string;
	title: string;
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
	projectSearchTerm: string;
	onProjectSearchTermChange: (value: string) => void;
	selectedSourceIds: string[];
	projectSources: ProjectSource[];
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
	projectSearchTerm,
	onProjectSearchTermChange,
	selectedSourceIds,
	projectSources,
	appSources,
	onToggleSource,
	onClearSelectedSources,
	onOpenConnectionsSettings,
}: ChatComposerProps) {
	const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
	const noteMentionRangeRef = React.useRef<NoteMentionRange | null>(null);
	const scopesLabel = getSelectedScopeLabel({
		selectedSourceIds,
		projectSources,
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
						attachedFiles={attachedFiles}
						onRemoveMention={onRemoveMention}
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
					data-chat-prompt="true"
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
							projectSearchTerm={projectSearchTerm}
							onProjectSearchTermChange={onProjectSearchTermChange}
							projectSources={projectSources}
							appSources={appSources}
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
	attachedFiles,
	onRemoveMention,
	onRemoveAttachedFile,
	mentionPicker,
}: {
	useCompactLayout: boolean;
	mentionedPages: ContextPage[];
	attachedFiles: ChatAttachment[];
	onRemoveMention: (pageId: string) => void;
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
	projectSearchTerm,
	onProjectSearchTermChange,
	projectSources,
	appSources,
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
	projectSearchTerm: string;
	onProjectSearchTermChange: (value: string) => void;
	projectSources: ProjectSource[];
	appSources: AppSource[];
	onToggleSource: (sourceId: string) => void;
	onClearSelectedSources: () => void;
	onOpenConnectionsSettings: () => void;
}) {
	const keepScopePickerOpen = React.useCallback((event: Event) => {
		event.preventDefault();
	}, []);

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
							<Globe className="text-foreground" /> Web search
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
							<LayoutGrid aria-hidden="true" className="text-foreground" />
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
					<ProjectScopeMenu
						projectSources={projectSources}
						projectSearchTerm={projectSearchTerm}
						onProjectSearchTermChange={onProjectSearchTermChange}
						selectedSourceIds={selectedSourceIds}
						onToggleSource={onToggleSource}
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
									<LayoutGrid className="size-4" />
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

function ProjectScopeMenu({
	projectSources,
	projectSearchTerm,
	onProjectSearchTermChange,
	selectedSourceIds,
	onToggleSource,
}: {
	projectSources: ProjectSource[];
	projectSearchTerm: string;
	onProjectSearchTermChange: (value: string) => void;
	selectedSourceIds: string[];
	onToggleSource: (sourceId: string) => void;
}) {
	const filteredProjects = filterProjectSources(
		projectSources,
		projectSearchTerm,
	);

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<Folder className="size-4 text-foreground" />
				Projects
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-72 border-input/30 p-0">
				<Command>
					<div>
						<CommandInput
							placeholder="Select a project"
							value={projectSearchTerm}
							onValueChange={onProjectSearchTermChange}
						/>
					</div>
					<CommandList>
						<CommandEmpty>No projects found.</CommandEmpty>
						<CommandGroup heading="Projects">
							{filteredProjects.map((project) => {
								const selected = selectedSourceIds.includes(project.id);

								return (
									<CommandItem
										key={project.id}
										value={`${project.id} ${project.title}`}
										onSelect={() => onToggleSource(project.id)}
										className="relative w-full cursor-pointer gap-2 pr-8"
									>
										<Folder className="size-4 text-foreground" />
										<div className="min-w-0 flex-1">
											<div className="truncate">{project.title}</div>
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
					</CommandList>
				</Command>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
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

const filterProjectSources = (
	projectSources: ProjectSource[],
	query: string,
) => {
	const normalizedQuery = query.trim().toLowerCase();

	if (!normalizedQuery) {
		return projectSources;
	}

	return projectSources.filter((source) =>
		source.title.toLowerCase().includes(normalizedQuery),
	);
};
