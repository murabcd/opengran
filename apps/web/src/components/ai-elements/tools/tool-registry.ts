import {
	Calendar,
	Database,
	FileImage,
	FileSearch,
	Globe,
	Search,
} from "lucide-react";
import type React from "react";

export type ToolMeta = {
	groupKey?: string;
	icon: React.ComponentType<{ className?: string }>;
	subtitle?: (part: ToolPartLike) => string;
	title: (part: ToolPartLike) => string;
};

export type ToolPartLike = {
	callProviderMetadata?: { custom?: { startedAt?: unknown } };
	errorText?: string;
	input?: Record<string, unknown>;
	output?: Record<string, unknown>;
	result?: Record<string, unknown>;
	state?: string;
	startedAt?: unknown;
	toolCallId?: string;
	type: string;
};

const isPending = (part: ToolPartLike) =>
	part.state !== "output-available" && part.state !== "output-error";

const getString = (value: unknown) =>
	typeof value === "string" ? value.trim() : "";

const getFirstString = (
	value: Record<string, unknown> | undefined,
	keys: string[],
) => {
	if (!value) {
		return "";
	}

	for (const key of keys) {
		const candidate = getString(value[key]);
		if (candidate) {
			return candidate;
		}
	}

	return "";
};

const clamp = (value: string, maxLength = 54) =>
	value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;

const makeToolMeta = ({
	groupKey,
	icon,
	running,
	complete,
	subtitleKeys,
}: {
	complete: string;
	groupKey?: string;
	icon: React.ComponentType<{ className?: string }>;
	running: string;
	subtitleKeys?: string[];
}): ToolMeta => ({
	groupKey,
	icon,
	title: (part) => (isPending(part) ? running : complete),
	subtitle: subtitleKeys
		? (part) => clamp(getFirstString(part.input, subtitleKeys))
		: undefined,
});

const toolRegistry: Record<string, ToolMeta> = {
	"tool-generate_image": makeToolMeta({
		groupKey: "image",
		icon: FileImage,
		running: "Generating image",
		complete: "Generated image",
		subtitleKeys: ["prompt"],
	}),
	"tool-google_calendar_list_events": makeToolMeta({
		icon: Calendar,
		running: "Reading calendar",
		complete: "Read calendar",
	}),
	"tool-google_calendar_search_events": makeToolMeta({
		groupKey: "search",
		icon: Calendar,
		running: "Searching calendar",
		complete: "Searched calendar",
		subtitleKeys: ["query", "q"],
	}),
	"tool-google_drive_get_file": makeToolMeta({
		icon: FileSearch,
		running: "Reading Drive file",
		complete: "Read Drive file",
		subtitleKeys: ["fileId", "id", "name"],
	}),
	"tool-google_drive_search_files": makeToolMeta({
		groupKey: "search",
		icon: Search,
		running: "Searching Drive",
		complete: "Searched Drive",
		subtitleKeys: ["query", "q"],
	}),
	"tool-jira_get_issue": makeToolMeta({
		icon: Database,
		running: "Reading Jira issue",
		complete: "Read Jira issue",
		subtitleKeys: ["issueKey", "key", "id"],
	}),
	"tool-jira_search": makeToolMeta({
		groupKey: "search",
		icon: Search,
		running: "Searching Jira",
		complete: "Searched Jira",
		subtitleKeys: ["query", "jql", "q"],
	}),
	"tool-notion_fetch": makeToolMeta({
		icon: FileSearch,
		running: "Reading Notion",
		complete: "Read Notion",
		subtitleKeys: ["id", "pageId", "url"],
	}),
	"tool-notion_search": makeToolMeta({
		groupKey: "search",
		icon: Search,
		running: "Searching Notion",
		complete: "Searched Notion",
		subtitleKeys: ["query", "q"],
	}),
	"tool-web_search": makeToolMeta({
		groupKey: "search",
		icon: Globe,
		running: "Searching web",
		complete: "Searched web",
		subtitleKeys: ["query", "q"],
	}),
	"tool-yandex_calendar_list_events": makeToolMeta({
		icon: Calendar,
		running: "Reading calendar",
		complete: "Read calendar",
	}),
	"tool-yandex_calendar_search_events": makeToolMeta({
		groupKey: "search",
		icon: Calendar,
		running: "Searching calendar",
		complete: "Searched calendar",
		subtitleKeys: ["query", "q"],
	}),
	"tool-yandex_tracker_get_issue": makeToolMeta({
		icon: Database,
		running: "Reading Tracker issue",
		complete: "Read Tracker issue",
		subtitleKeys: ["issueKey", "key", "id"],
	}),
	"tool-yandex_tracker_search": makeToolMeta({
		groupKey: "search",
		icon: Search,
		running: "Searching Tracker",
		complete: "Searched Tracker",
		subtitleKeys: ["query", "q"],
	}),
	"tool-posthog_query_generate_hogql_from_question": makeToolMeta({
		icon: Database,
		running: "Querying PostHog",
		complete: "Queried PostHog",
		subtitleKeys: ["question"],
	}),
};

function getPostHogToolMeta(part: ToolPartLike): ToolMeta | null {
	if (!part.type.startsWith("tool-posthog_")) {
		return null;
	}

	return {
		groupKey: "posthog",
		icon: Database,
		title: () => (isPending(part) ? "Querying PostHog" : "Queried PostHog"),
		subtitle: (currentPart) =>
			clamp(
				getFirstString(currentPart.input, [
					"query",
					"question",
					"insightId",
					"event",
					"name",
				]),
			),
	};
}

export const getToolMeta = (part: ToolPartLike) =>
	toolRegistry[part.type] ?? getPostHogToolMeta(part);
