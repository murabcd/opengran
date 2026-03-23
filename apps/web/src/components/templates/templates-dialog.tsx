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
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";

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

export function TemplatesDialog({ open, onOpenChange }: TemplatesDialogProps) {
	const templateData = useQuery(api.templates.list);
	const saveTemplates = useMutation(api.templates.saveAll);
	const [templates, setTemplates] = useState<TemplateDraft[]>([]);
	const [activeTemplate, setActiveTemplate] = useState<TemplateSlug | null>(
		null,
	);
	const [isSaving, setIsSaving] = useState(false);
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

	useEffect(() => {
		if (!templateData) {
			return;
		}

		const nextTemplates = toTemplateDrafts(templateData);
		setTemplates(nextTemplates);
		setActiveTemplate((currentActiveTemplate) => {
			if (
				currentActiveTemplate &&
				nextTemplates.some(
					(template) => template.slug === currentActiveTemplate,
				)
			) {
				return currentActiveTemplate;
			}

			return nextTemplates[0]?.slug ?? null;
		});
	}, [templateData]);

	useEffect(() => {
		if (!open) {
			return;
		}

		if (templateData) {
			const nextTemplates = toTemplateDrafts(templateData);
			setTemplates(nextTemplates);
			setActiveTemplate(nextTemplates[0]?.slug ?? null);
			return;
		}

		setActiveTemplate(null);
	}, [open, templateData]);

	const selectedTemplate = useMemo(
		() =>
			templates.find((template) => template.slug === activeTemplate) ??
			templates[0] ??
			null,
		[activeTemplate, templates],
	);

	const updateMeetingContext = (value: string) => {
		if (!selectedTemplate) {
			return;
		}

		setTemplates((currentTemplates) =>
			currentTemplates.map((template) =>
				template.slug === selectedTemplate.slug
					? {
							...template,
							meetingContext: value,
						}
					: template,
			),
		);
	};

	const updateSectionPrompt = (sectionId: string, value: string) => {
		if (!selectedTemplate) {
			return;
		}

		setTemplates((currentTemplates) =>
			currentTemplates.map((template) =>
				template.slug === selectedTemplate.slug
					? {
							...template,
							sections: template.sections.map((section) =>
								section.id === sectionId
									? {
											...section,
											prompt: value,
										}
									: section,
							),
						}
					: template,
			),
		);
	};

	const updateSectionTitle = (sectionId: string, value: string) => {
		if (!selectedTemplate) {
			return;
		}

		setTemplates((currentTemplates) =>
			currentTemplates.map((template) =>
				template.slug === selectedTemplate.slug
					? {
							...template,
							sections: template.sections.map((section) =>
								section.id === sectionId
									? {
											...section,
											title: value,
										}
									: section,
							),
						}
					: template,
			),
		);
	};

	const removeSection = (sectionId: string) => {
		if (!selectedTemplate) {
			return;
		}

		setTemplates((currentTemplates) =>
			currentTemplates.map((template) =>
				template.slug === selectedTemplate.slug
					? {
							...template,
							sections: template.sections.filter(
								(section) => section.id !== sectionId,
							),
						}
					: template,
			),
		);
	};

	const addSection = () => {
		if (!selectedTemplate) {
			return;
		}

		setTemplates((currentTemplates) =>
			currentTemplates.map((template) =>
				template.slug === selectedTemplate.slug
					? {
							...template,
							sections: [
								...template.sections,
								{
									id: crypto.randomUUID(),
									title: "New section",
									prompt: "",
								},
							],
						}
					: template,
			),
		);
	};

	const reorderSections = (activeSectionId: string, overSectionId: string) => {
		if (!selectedTemplate || activeSectionId === overSectionId) {
			return;
		}

		setTemplates((currentTemplates) =>
			currentTemplates.map((template) => {
				if (template.slug !== selectedTemplate.slug) {
					return template;
				}

				const oldIndex = template.sections.findIndex(
					(section) => section.id === activeSectionId,
				);
				const newIndex = template.sections.findIndex(
					(section) => section.id === overSectionId,
				);

				if (oldIndex < 0 || newIndex < 0) {
					return template;
				}

				return {
					...template,
					sections: arrayMove(template.sections, oldIndex, newIndex),
				};
			}),
		);
	};

	const handleSectionDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over) {
			return;
		}

		reorderSections(String(active.id), String(over.id));
	};

	const handleCancel = () => {
		if (templateData) {
			const nextTemplates = toTemplateDrafts(templateData);
			setTemplates(nextTemplates);
			setActiveTemplate(nextTemplates[0]?.slug ?? null);
		}

		onOpenChange(false);
	};

	const handleSave = async () => {
		setIsSaving(true);

		try {
			const savedTemplates = await saveTemplates({
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
			setTemplates(nextTemplates);
			setActiveTemplate(nextTemplates[0]?.slug ?? null);
			toast.success("Templates saved");
			onOpenChange(false);
		} catch (error) {
			console.error("Failed to save templates", error);
			toast.error("Failed to save templates");
		} finally {
			setIsSaving(false);
		}
	};

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
															onClick={() => setActiveTemplate(item.slug)}
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
					<main className="flex h-[480px] flex-1 flex-col overflow-hidden">
						<header className="flex h-16 shrink-0 items-center gap-2 px-4">
							<Breadcrumb className="hidden md:block">
								<BreadcrumbList>
									<BreadcrumbItem className="hidden md:block">
										<BreadcrumbLink href="#">Templates</BreadcrumbLink>
									</BreadcrumbItem>
									<BreadcrumbSeparator className="hidden md:block" />
									<BreadcrumbItem>
										<BreadcrumbPage>
											{selectedTemplate?.name ?? "Templates"}
										</BreadcrumbPage>
									</BreadcrumbItem>
								</BreadcrumbList>
							</Breadcrumb>
							<div className="flex gap-2 md:hidden">
								{templates.map((item) => {
									const Icon = templateIcons[item.slug];

									return (
										<Button
											key={item.slug}
											variant={
												activeTemplate === item.slug ? "secondary" : "ghost"
											}
											size="sm"
											onClick={() => setActiveTemplate(item.slug)}
											className="whitespace-nowrap"
										>
											<Icon />
											{item.name}
										</Button>
									);
								})}
							</div>
						</header>
						<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 pt-0">
							{selectedTemplate ? (
								<>
									<FieldGroup>
										<Field>
											<FieldLabel htmlFor="template-meeting-context">
												Meeting context
											</FieldLabel>
											<Textarea
												id="template-meeting-context"
												value={selectedTemplate.meetingContext}
												onChange={(event) =>
													updateMeetingContext(event.target.value)
												}
												className="h-32 resize-none border-border/70 bg-background/30 text-sm leading-6"
											/>
										</Field>
									</FieldGroup>
									<div className="space-y-3">
										<FieldLabel>Sections</FieldLabel>
										<DndContext
											sensors={sensors}
											collisionDetection={closestCenter}
											onDragEnd={handleSectionDragEnd}
										>
											<SortableContext
												items={selectedTemplate.sections.map(
													(section) => section.id,
												)}
												strategy={verticalListSortingStrategy}
											>
												{selectedTemplate.sections.map((section) => (
													<SortableTemplateSectionCard
														key={section.id}
														section={section}
														canRemove={selectedTemplate.sections.length > 1}
														onTitleChange={updateSectionTitle}
														onPromptChange={updateSectionPrompt}
														onRemove={removeSection}
													/>
												))}
											</SortableContext>
										</DndContext>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="w-fit"
											onClick={addSection}
										>
											<Plus />
											Add section
										</Button>
									</div>
								</>
							) : (
								<div className="text-sm text-muted-foreground">
									Loading templates...
								</div>
							)}
							<div className="flex justify-end gap-2 pb-1">
								<Button
									variant="ghost"
									onClick={handleCancel}
									disabled={isSaving}
								>
									Cancel
								</Button>
								<Button
									onClick={handleSave}
									disabled={isSaving || templates.length === 0}
								>
									{isSaving ? "Saving..." : "Save"}
								</Button>
							</div>
						</div>
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
				"group w-full max-w-[512px] rounded-xl border border-input bg-transparent px-3 py-2 dark:bg-input/30",
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
