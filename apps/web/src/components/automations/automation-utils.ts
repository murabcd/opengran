import {
	AUTOMATION_SCHEDULE_PERIODS,
	type AutomationDraft,
} from "./automation-types";

const automationTimeFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "numeric",
	minute: "2-digit",
});

const scheduleLabelsByValue = Object.fromEntries(
	AUTOMATION_SCHEDULE_PERIODS.map((period) => [period.value, period.label]),
) as Record<(typeof AUTOMATION_SCHEDULE_PERIODS)[number]["value"], string>;

export function getAutomationSchedulePeriodLabel(
	automation: Pick<AutomationDraft, "schedulePeriod" | "scheduledAt">,
) {
	const label = scheduleLabelsByValue[automation.schedulePeriod];

	if (automation.schedulePeriod === "hourly") {
		return label;
	}

	return `${label} at ${automationTimeFormatter.format(
		new Date(automation.scheduledAt),
	)}`;
}
