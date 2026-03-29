import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@workspace/ui/components/select";
import { useQuery } from "convex/react";
import * as React from "react";
import {
	ENHANCED_NOTE_TEMPLATE_SLUG,
	getSelectableNoteTemplates,
	NOTE_TEMPLATE_ICONS,
	type NoteTemplate,
} from "@/lib/note-templates";
import { api } from "../../../../../convex/_generated/api";

export function NoteTemplateSelect({
	disabled = false,
	selectedSlug = null,
	onTemplateSelect,
}: {
	disabled?: boolean;
	selectedSlug?: string | null;
	onTemplateSelect: (template: NoteTemplate) => Promise<boolean>;
}) {
	const templateData = useQuery(api.templates.list);
	const [isApplyingTemplate, setIsApplyingTemplate] = React.useState(false);
	const templates = React.useMemo(
		() => getSelectableNoteTemplates(templateData),
		[templateData],
	);
	const currentSlug = selectedSlug;
	const currentTemplate = templates.find(
		(template) => currentSlug !== null && template.slug === currentSlug,
	);
	const isDisabled = disabled || isApplyingTemplate || templates.length === 0;
	const triggerLabel = isApplyingTemplate
		? "Applying..."
		: templates.length === 0
			? "No templates"
			: (currentTemplate?.name ?? "Enhance");
	const triggerIcon =
		currentTemplate?.slug ??
		(currentSlug === null ? ENHANCED_NOTE_TEMPLATE_SLUG : null);

	return (
		<Select
			disabled={isDisabled}
			value={currentSlug ?? undefined}
			onValueChange={async (value) => {
				const selectedTemplate = templates.find(
					(template) => template.slug === value,
				);

				if (!selectedTemplate) {
					return;
				}

				setIsApplyingTemplate(true);

				try {
					await onTemplateSelect(selectedTemplate);
				} finally {
					setIsApplyingTemplate(false);
				}
			}}
		>
			<SelectTrigger
				size="sm"
				className="h-9 w-auto min-w-0 cursor-pointer border-transparent !bg-transparent pr-2 pl-2 shadow-none dark:!bg-transparent hover:!bg-accent/50 dark:hover:!bg-accent/50 focus-visible:ring-0"
				aria-label="Select note template"
			>
				<span
					className={
						currentTemplate || currentSlug === null
							? "flex items-center gap-2 text-foreground"
							: "text-muted-foreground"
					}
				>
					{(() => {
						if (!triggerIcon) {
							return null;
						}

						const Icon =
							NOTE_TEMPLATE_ICONS[
								triggerIcon as keyof typeof NOTE_TEMPLATE_ICONS
							];

						return Icon ? (
							<Icon className="size-4 text-muted-foreground" />
						) : null;
					})()}
					<span>{triggerLabel}</span>
				</span>
			</SelectTrigger>
			<SelectContent align="end">
				{templates.map((template) => {
					const Icon =
						template.slug in NOTE_TEMPLATE_ICONS
							? NOTE_TEMPLATE_ICONS[
									template.slug as keyof typeof NOTE_TEMPLATE_ICONS
								]
							: null;

					return (
						<SelectItem key={template.slug} value={template.slug}>
							<span className="flex items-center gap-2">
								{Icon ? (
									<Icon className="size-4 text-muted-foreground" />
								) : null}
								<span>
									{template.slug === ENHANCED_NOTE_TEMPLATE_SLUG &&
									currentSlug === null
										? "Enhance"
										: template.name}
								</span>
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
