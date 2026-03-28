import { CalendarDays, Goal, UsersRound, WandSparkles } from "lucide-react";

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

export const ENHANCED_NOTE_TEMPLATE_SLUG = "enhanced";

const ENHANCED_NOTE_TEMPLATE: NoteTemplate = {
	slug: ENHANCED_NOTE_TEMPLATE_SLUG,
	name: "Enhanced",
	meetingContext:
		"Turn raw notes into a clean, high-signal note with a concise title, a short overview when useful, and topic-based sections grounded in the source material.",
	sections: [],
};

export const NOTE_TEMPLATE_ICONS = {
	[ENHANCED_NOTE_TEMPLATE_SLUG]: WandSparkles,
	"one-to-one": UsersRound,
	"stand-up": Goal,
	"weekly-team-meeting": CalendarDays,
} as const;

export const getSelectableNoteTemplates = (
	templates: NoteTemplate[] | undefined,
): NoteTemplate[] => [
	ENHANCED_NOTE_TEMPLATE,
	...(templates ?? []).filter(
		(template) => template.slug !== ENHANCED_NOTE_TEMPLATE_SLUG,
	),
];

export const isEnhancedNoteTemplate = (template: Pick<NoteTemplate, "slug">) =>
	template.slug === ENHANCED_NOTE_TEMPLATE_SLUG;
