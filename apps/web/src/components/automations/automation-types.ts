import type { Id } from "../../../../../convex/_generated/dataModel";

export const AUTOMATION_SCHEDULE_PERIODS = [
	{ value: "hourly", label: "Hourly" },
	{ value: "daily", label: "Daily" },
	{ value: "weekdays", label: "Weekdays" },
	{ value: "weekly", label: "Weekly" },
] as const;

export type AutomationSchedulePeriod =
	(typeof AUTOMATION_SCHEDULE_PERIODS)[number]["value"];

export type AutomationTarget = {
	kind: "project";
	label: string;
	projectId: Id<"projects">;
};

export type AutomationDraft = {
	title: string;
	prompt: string;
	model: string;
	authorName?: string;
	schedulePeriod: AutomationSchedulePeriod;
	scheduledAt: number;
	timezone: string;
	target: AutomationTarget;
};

export type AutomationListItem = AutomationDraft & {
	id: Id<"automations">;
	chatId: string;
	createdAt: number;
	updatedAt: number;
	isPaused: boolean;
	lastRunAt: number | null;
	nextRunAt: number | null;
};
