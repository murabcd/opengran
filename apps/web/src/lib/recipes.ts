import {
	CalendarDays,
	FileText,
	Handshake,
	type LucideIcon,
} from "lucide-react";

export const RECIPE_ICONS = {
	"write-prd": FileText,
	"sales-questions": Handshake,
	"write-weekly-recap": CalendarDays,
} as const satisfies Record<string, LucideIcon>;

export type RecipeSlug = keyof typeof RECIPE_ICONS;

export type RecipePrompt = {
	slug: RecipeSlug;
	name: string;
	prompt: string;
};
