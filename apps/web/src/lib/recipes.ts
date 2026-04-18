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

export const getRecipeIcon = (slug: string): LucideIcon =>
	RECIPE_ICONS[slug as keyof typeof RECIPE_ICONS] ?? FileText;

export type RecipeSlug = string;

export type RecipePrompt = {
	slug: RecipeSlug;
	name: string;
	prompt: string;
};
