import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@workspace/ui/components/select";
import { useQuery } from "convex/react";
import { CalendarDays, Goal, UsersRound } from "lucide-react";
import * as React from "react";
import { api } from "../../../../../convex/_generated/api";

export type NoteTemplate = {
	slug: string;
	name: string;
	meetingContext: string;
	sections: Array<{
		id: string;
		title: string;
		prompt: string;
	}>;
};

const templateIcons = {
	"one-to-one": UsersRound,
	"stand-up": Goal,
	"weekly-team-meeting": CalendarDays,
} as const;

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
	const templates = React.useMemo(() => templateData ?? [], [templateData]);
	const currentSlug = selectedSlug ?? "";
	const currentTemplate = templates.find(
		(template) => template.slug === currentSlug,
	);
	const isDisabled =
		disabled ||
		isApplyingTemplate ||
		templateData === undefined ||
		templates.length === 0;
	const placeholder = isApplyingTemplate
		? "Applying..."
		: templateData === undefined
			? "Loading templates..."
			: templates.length === 0
				? "No templates"
				: (currentTemplate?.name ?? "Templates");

	return (
		<Select
			disabled={isDisabled}
			value={currentSlug || undefined}
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
				{currentTemplate ? (
					<span className="flex items-center gap-2 text-foreground">
						{(() => {
							const Icon =
								templateIcons[
									currentTemplate.slug as keyof typeof templateIcons
								];

							return Icon ? (
								<Icon className="size-4 text-muted-foreground" />
							) : null;
						})()}
						<span>{currentTemplate.name}</span>
					</span>
				) : (
					<span className="text-muted-foreground">{placeholder}</span>
				)}
			</SelectTrigger>
			<SelectContent align="end">
				{templates.map((template) => {
					const Icon =
						template.slug in templateIcons
							? templateIcons[template.slug as keyof typeof templateIcons]
							: null;

					return (
						<SelectItem key={template.slug} value={template.slug}>
							<span className="flex items-center gap-2">
								{Icon ? (
									<Icon className="size-4 text-muted-foreground" />
								) : null}
								<span>{template.name}</span>
							</span>
						</SelectItem>
					);
				})}
			</SelectContent>
		</Select>
	);
}
