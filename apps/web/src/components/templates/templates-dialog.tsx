import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldGroup } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@workspace/ui/components/sidebar";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
	CalendarDays,
	Goal,
	GripVertical,
	Plus,
	UsersRound,
	X,
} from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

const templateIcons = {
	"one-to-one": UsersRound,
	"stand-up": Goal,
	"weekly-team-meeting": CalendarDays,
} as const;

type TemplateSlug = keyof typeof templateIcons;

type TemplateDraft = {
	slug: TemplateSlug;
	name: string;
	meetingContext: string;
	sections: Array<{
		id: string;
		title: string;
		prompt: string;
	}>;
};

type TemplatesDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

type TemplateEditorState = {
	templates: TemplateDraft[];
	activeTemplate: TemplateSlug | null;
};

const toTemplateDrafts = (
	templates: Array<{
		slug: string;
		name: string;
		meetingContext: string;
		sections: Array<{
			id: string;
			title: string;
			prompt: string;
		}>;
	}>,
): TemplateDraft[] =>
	templates.flatMap((template) =>
		template.slug in templateIcons
			? [
					{
						slug: template.slug as TemplateSlug,
						name: template.name,
						meetingContext: template.meetingContext,
						sections: template.sections.map((section) => ({
							id: section.id,
							title: section.title,
							prompt: section.prompt,
						})),
					},
				]
			: [],
	);

const getNextActiveTemplate = ({
	currentActiveTemplate,
	templates,
	resetSelection,
}: {
	currentActiveTemplate: TemplateSlug | null;
	templates: TemplateDraft[];
	resetSelection: boolean;
}) => {
	if (!resetSelection && currentActiveTemplate) {
		const matchingTemplate = templates.find(
			(template) => template.slug === currentActiveTemplate,
		);

		if (matchingTemplate) {
			return matchingTemplate.slug;
		}
	}

	return templates[0]?.slug ?? null;
};

const syncTemplateEditorState = ({
	currentState,
	templates,
	resetSelection,
}: {
	currentState: TemplateEditorState;
	templates: TemplateDraft[];
	resetSelection: boolean;
}): TemplateEditorState => ({
	templates,
	activeTemplate: getNextActiveTemplate({
		currentActiveTemplate: currentState.activeTemplate,
		templates,
		resetSelection,
	}),
});

type TemplateEditorAction =
	| {
			type: "sync";
			templates: TemplateDraft[];
			resetSelection: boolean;
	  }
	| {
			type: "select";
			slug: TemplateSlug | null;
	  }
	| {
			type: "update";
			updater: (templates: TemplateDraft[]) => TemplateDraft[];
	  };

const templateEditorReducer = (
	state: TemplateEditorState,
	action: TemplateEditorAction,
): TemplateEditorState => {
	if (action.type === "sync") {
		return syncTemplateEditorState({
			currentState: state,
			templates: action.templates,
			resetSelection: action.resetSelection,
		});
	}

	if (action.type === "select") {
		return {
			...state,
			activeTemplate: action.slug,
		};
	}

	const templates = action.updater(state.templates);
	return syncTemplateEditorState({
		currentState: state,
		templates,
		resetSelection: false,
	});
};

const useTemplateEditorState = ({
	open,
	templateData,
}: {
	open: boolean;
	templateData:
		| Array<{
				slug: string;
				name: string;
				meetingContext: string;
				sections: Array<{
					id: string;
					title: string;
					prompt: string;
				}>;
		  }>
		| undefined;
}) => {
	const [state, dispatch] = useReducer(templateEditorReducer, {
		templates: [],
		activeTemplate: null,
	});

	useEffect(() => {
		if (!templateData) {
			return;
		}

		dispatch({
			type: "sync",
			templates: toTemplateDrafts(templateData),
			resetSelection: false,
		});
	}, [templateData]);

	useEffect(() => {
		if (!open) {
			return;
		}

		dispatch({
			type: "sync",
			templates: templateData ? toTemplateDrafts(templateData) : [],
			resetSelection: true,
		});
	}, [open, templateData]);

	return {
		activeTemplate: state.activeTemplate,
		templates: state.templates,
		selectTemplate: (slug: TemplateSlug | null) =>
			dispatch({ type: "select", slug }),
		updateTemplates: (
			updater: (templates: TemplateDraft[]) => TemplateDraft[],
		) => dispatch({ type: "update", updater }),
	};
};

const useTemplateDraftEditor = ({
	activeTemplate,
	activeWorkspaceId,
	onOpenChange,
	saveTemplates,
	selectTemplate,
	templateData,
	templates,
	updateTemplates,
}: {
	activeTemplate: TemplateSlug | null;
	activeWorkspaceId: Id<"workspaces"> | null;
	onOpenChange: (open: boolean) => void;
	saveTemplates: ReturnType<typeof useMutation<typeof api.templates.saveAll>>;
	selectTemplate: (slug: TemplateSlug | null) => void;
	templateData:
		| Array<{
				slug: string;
				name: string;
				meetingContext: string;
				sections: Array<{
					id: string;
					title: string;
					prompt: string;
				}>;
		  }>
		| undefined;
	templates: TemplateDraft[];
	updateTemplates: (
		updater: (templates: TemplateDraft[]) => TemplateDraft[],
	) => void;
}) => {
	const [isSaving, setIsSaving] = useState(false);
	const selectedTemplate = useMemo(
		() =>
			templates.find((template) => template.slug === activeTemplate) ??
			templates[0] ??
			null,
		[activeTemplate, templates],
	);

	const updateSelectedTemplate = (
		updater: (template: TemplateDraft) => TemplateDraft,
	) => {
		if (!selectedTemplate) {
			return;
		}

		updateTemplates((currentTemplates) =>
			currentTemplates.map((template) =>
				template.slug === selectedTemplate.slug ? updater(template) : template,
			),
		);
	};

	const updateMeetingContext = (value: string) => {
		updateSelectedTemplate((template) => ({
			...template,
			meetingContext: value,
		}));
	};

	const updateSectionPrompt = (sectionId: string, value: string) => {
		updateSelectedTemplate((template) => ({
			...template,
			sections: template.sections.map((section) =>
				section.id === sectionId ? { ...section, prompt: value } : section,
			),
		}));
	};

	const updateSectionTitle = (sectionId: string, value: string) => {
		updateSelectedTemplate((template) => ({
			...template,
			sections: template.sections.map((section) =>
				section.id === sectionId ? { ...section, title: value } : section,
			),
		}));
	};

	const removeSection = (sectionId: string) => {
		updateSelectedTemplate((template) => ({
			...template,
			sections: template.sections.filter((section) => section.id !== sectionId),
		}));
	};

	const addSection = () => {
		updateSelectedTemplate((template) => ({
			...template,
			sections: [
				...template.sections,
				{
					id: crypto.randomUUID(),
					title: "New section",
					prompt: "",
				},
			],
		}));
	};

	const handleSectionDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || !selectedTemplate || String(active.id) === String(over.id)) {
			return;
		}

		updateSelectedTemplate((template) => {
			const oldIndex = template.sections.findIndex(
				(section) => section.id === String(active.id),
			);
			const newIndex = template.sections.findIndex(
				(section) => section.id === String(over.id),
			);

			if (oldIndex < 0 || newIndex < 0) {
				return template;
			}

			return {
				...template,
				sections: arrayMove(template.sections, oldIndex, newIndex),
			};
		});
	};

	const handleCancel = () => {
		if (templateData) {
			const nextTemplates = toTemplateDrafts(templateData);
			selectTemplate(nextTemplates[0]?.slug ?? null);
			updateTemplates(() => nextTemplates);
		}

		onOpenChange(false);
	};

	const handleSave = async () => {
		setIsSaving(true);

		try {
			if (!activeWorkspaceId) {
				return;
			}

			const savedTemplates = await saveTemplates({
				workspaceId: activeWorkspaceId,
				templates: templates.map((template) => ({
					slug: template.slug,
					name: template.name,
					meetingContext: template.meetingContext,
					sections: template.sections.map((section) => ({
						id: section.id,
						title: section.title,
						prompt: section.prompt,
					})),
				})),
			});
			const nextTemplates = toTemplateDrafts(savedTemplates);
			updateTemplates(() => nextTemplates);
			selectTemplate(nextTemplates[0]?.slug ?? null);
			toast.success("Templates saved");
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to save templates", error);
			toast.error("Failed to save templates");
		} finally {
			setIsSaving(false);
		}
	};

	return {
		addSection,
		handleCancel,
		handleSave,
		handleSectionDragEnd,
		isSaving,
		removeSection,
		selectedTemplate,
		updateMeetingContext,
		updateSectionPrompt,
		updateSectionTitle,
	};
};

function TemplatesSidebarNav({
	activeTemplate,
	selectTemplate,
	templates,
}: {
	activeTemplate: TemplateSlug | null;
	selectTemplate: (slug: TemplateSlug) => void;
	templates: TemplateDraft[];
}) {
	return (
		<Sidebar collapsible="none" className="hidden md:flex">
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{templates.map((item) => {
								const Icon = templateIcons[item.slug];

								return (
									<SidebarMenuItem key={item.slug}>
										<SidebarMenuButton
											asChild
											isActive={activeTemplate === item.slug}
										>
											<button
												type="button"
												onClick={() => selectTemplate(item.slug)}
											>
												<Icon />
												<span>{item.name}</span>
											</button>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
}

function TemplatesHeader({
	activeTemplate,
	selectTemplate,
	templates,
}: {
	activeTemplate: TemplateSlug | null;
	selectTemplate: (slug: TemplateSlug) => void;
	templates: TemplateDraft[];
}) {
	const activeTemplateName =
		templates.find((template) => template.slug === activeTemplate)?.name ??
		"Templates";

	return (
		<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
			<div className="flex items-center gap-2 px-4">
				<Breadcrumb className="hidden md:block">
					<BreadcrumbList>
						<BreadcrumbItem className="hidden md:block">
							<BreadcrumbLink href="#">Templates</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden md:block" />
						<BreadcrumbItem>
							<BreadcrumbPage>{activeTemplateName}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
				<div className="flex gap-2 md:hidden">
					{templates.map((item) => {
						const Icon = templateIcons[item.slug];

						return (
							<Button
								key={item.slug}
								variant={activeTemplate === item.slug ? "secondary" : "ghost"}
								size="sm"
								onClick={() => selectTemplate(item.slug)}
								className="whitespace-nowrap"
							>
								<Icon />
								{item.name}
							</Button>
						);
					})}
				</div>
			</div>
		</header>
	);
}

function TemplatesEditor({
	isSaving,
	onAddSection,
	onCancel,
	onMeetingContextChange,
	onPromptChange,
	onRemoveSection,
	onSave,
	onSectionDragEnd,
	onTitleChange,
	selectedTemplate,
	sensors,
	templatesCount,
}: {
	isSaving: boolean;
	onAddSection: () => void;
	onCancel: () => void;
	onMeetingContextChange: (value: string) => void;
	onPromptChange: (sectionId: string, value: string) => void;
	onRemoveSection: (sectionId: string) => void;
	onSave: () => void;
	onSectionDragEnd: (event: DragEndEvent) => void;
	onTitleChange: (sectionId: string, value: string) => void;
	selectedTemplate: TemplateDraft | null;
	sensors: ReturnType<typeof useSensors>;
	templatesCount: number;
}) {
	return (
		<ScrollArea
			className="flex flex-1"
			viewportClassName="flex flex-col gap-6 p-4 pt-0"
		>
			{selectedTemplate ? (
				<FieldGroup className="gap-2">
					<Field>
						<Label
							htmlFor="template-meeting-context"
							className="text-xs text-muted-foreground"
						>
							Meeting context
						</Label>
						<Textarea
							id="template-meeting-context"
							value={selectedTemplate.meetingContext}
							onChange={(event) => onMeetingContextChange(event.target.value)}
							className="h-32 resize-none border-border/70 bg-background/30 text-sm leading-6"
						/>
					</Field>
					<Field>
						<Label className="text-xs text-muted-foreground">Sections</Label>
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={onSectionDragEnd}
						>
							<SortableContext
								items={selectedTemplate.sections.map((section) => section.id)}
								strategy={verticalListSortingStrategy}
							>
								{selectedTemplate.sections.map((section) => (
									<SortableTemplateSectionCard
										key={section.id}
										section={section}
										canRemove={selectedTemplate.sections.length > 1}
										onTitleChange={onTitleChange}
										onPromptChange={onPromptChange}
										onRemove={onRemoveSection}
									/>
								))}
							</SortableContext>
						</DndContext>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="w-fit"
							onClick={onAddSection}
						>
							<Plus />
							Add section
						</Button>
					</Field>
				</FieldGroup>
			) : (
				<div className="text-sm text-muted-foreground">
					Loading templates...
				</div>
			)}
			<div className="flex justify-end gap-2 pb-1">
				<Button variant="ghost" onClick={onCancel} disabled={isSaving}>
					Cancel
				</Button>
				<Button onClick={onSave} disabled={isSaving || templatesCount === 0}>
					{isSaving ? "Saving..." : "Save"}
				</Button>
			</div>
		</ScrollArea>
	);
}

export function TemplatesDialog({ open, onOpenChange }: TemplatesDialogProps) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const templateData = useQuery(
		api.templates.list,
		activeWorkspaceId ? { workspaceId: activeWorkspaceId } : "skip",
	);
	const saveTemplates = useMutation(api.templates.saveAll);
	const { activeTemplate, templates, selectTemplate, updateTemplates } =
		useTemplateEditorState({
			open,
			templateData,
		});
	const editor = useTemplateDraftEditor({
		activeTemplate,
		activeWorkspaceId,
		onOpenChange,
		saveTemplates,
		selectTemplate,
		templateData,
		templates,
		updateTemplates,
	});
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 6,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]">
				<DialogHeader className="sr-only">
					<DialogTitle>Manage templates</DialogTitle>
					<DialogDescription>
						Browse and manage your note templates.
					</DialogDescription>
				</DialogHeader>
				<DialogDescription className="sr-only">
					Browse and manage your note templates.
				</DialogDescription>
				<SidebarProvider className="items-start">
					<TemplatesSidebarNav
						activeTemplate={activeTemplate}
						selectTemplate={selectTemplate}
						templates={templates}
					/>
					<main className="flex h-[480px] flex-1 flex-col overflow-hidden">
						<TemplatesHeader
							activeTemplate={activeTemplate}
							selectTemplate={selectTemplate}
							templates={templates}
						/>
						<TemplatesEditor
							isSaving={editor.isSaving}
							onAddSection={editor.addSection}
							onCancel={editor.handleCancel}
							onMeetingContextChange={editor.updateMeetingContext}
							onPromptChange={editor.updateSectionPrompt}
							onRemoveSection={editor.removeSection}
							onSave={editor.handleSave}
							onSectionDragEnd={editor.handleSectionDragEnd}
							onTitleChange={editor.updateSectionTitle}
							selectedTemplate={editor.selectedTemplate}
							sensors={sensors}
							templatesCount={templates.length}
						/>
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
}

function SortableTemplateSectionCard({
	section,
	canRemove,
	onTitleChange,
	onPromptChange,
	onRemove,
}: {
	section: TemplateDraft["sections"][number];
	canRemove: boolean;
	onTitleChange: (sectionId: string, value: string) => void;
	onPromptChange: (sectionId: string, value: string) => void;
	onRemove: (sectionId: string) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: section.id,
	});

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			className={cn(
				"group w-full max-w-[512px] rounded-lg border border-input bg-transparent px-3 py-2 dark:bg-input/30",
				isDragging && "z-10 opacity-90 shadow-lg",
			)}
		>
			<div className="flex items-start gap-3">
				<button
					ref={setActivatorNodeRef}
					type="button"
					className="cursor-grab pt-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 active:cursor-grabbing"
					aria-label={`Drag ${section.title || "section"}`}
					{...attributes}
					{...listeners}
				>
					<GripVertical className="size-4" />
				</button>
				<div className="min-w-0 flex-1 space-y-1">
					<Input
						id={`template-section-title-${section.id}`}
						value={section.title}
						onChange={(event) => onTitleChange(section.id, event.target.value)}
						className="h-7 border-0 bg-transparent px-0 py-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
					/>
					<Textarea
						id={`template-section-prompt-${section.id}`}
						value={section.prompt}
						onChange={(event) => onPromptChange(section.id, event.target.value)}
						className="h-[72px] resize-none border-0 bg-transparent px-0 py-0 text-sm leading-6 shadow-none focus-visible:ring-0 dark:bg-transparent"
					/>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
					onClick={() => onRemove(section.id)}
					disabled={!canRemove}
					aria-label={`Remove ${section.title || "section"}`}
				>
					<X className="size-4" />
				</Button>
			</div>
		</div>
	);
}
