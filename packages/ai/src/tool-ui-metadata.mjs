export const toolUiMetadata = {
	generate_image: {
		groupKey: "image",
		icon: "file-image",
		running: "Generating image",
		complete: "Generated image",
		subtitleKeys: ["prompt"],
	},
	google_calendar_list_events: {
		icon: "calendar",
		running: "Reading calendar",
		complete: "Read calendar",
	},
	google_calendar_search_events: {
		groupKey: "search",
		icon: "calendar",
		running: "Searching calendar",
		complete: "Searched calendar",
		subtitleKeys: ["query", "q"],
	},
	google_drive_get_file: {
		icon: "file-search",
		running: "Reading Drive file",
		complete: "Read Drive file",
		subtitleKeys: ["fileId", "id", "name"],
	},
	google_drive_search_files: {
		groupKey: "search",
		icon: "search",
		running: "Searching Drive",
		complete: "Searched Drive",
		subtitleKeys: ["query", "q"],
	},
	jira_get_issue: {
		icon: "database",
		running: "Reading Jira issue",
		complete: "Read Jira issue",
		subtitleKeys: ["issueKey", "key", "id"],
	},
	jira_search: {
		groupKey: "search",
		icon: "search",
		running: "Searching Jira",
		complete: "Searched Jira",
		subtitleKeys: ["query", "jql", "q"],
	},
	notion_fetch: {
		icon: "file-search",
		running: "Reading Notion",
		complete: "Read Notion",
		subtitleKeys: ["id", "pageId", "url"],
	},
	notion_search: {
		groupKey: "search",
		icon: "search",
		running: "Searching Notion",
		complete: "Searched Notion",
		subtitleKeys: ["query", "q"],
	},
	web_search: {
		groupKey: "search",
		icon: "globe",
		running: "Searching web",
		complete: "Searched web",
		subtitleKeys: ["query", "q"],
	},
	yandex_calendar_list_events: {
		icon: "calendar",
		running: "Reading calendar",
		complete: "Read calendar",
	},
	yandex_calendar_search_events: {
		groupKey: "search",
		icon: "calendar",
		running: "Searching calendar",
		complete: "Searched calendar",
		subtitleKeys: ["query", "q"],
	},
	yandex_tracker_get_issue: {
		icon: "database",
		running: "Reading Tracker issue",
		complete: "Read Tracker issue",
		subtitleKeys: ["issueKey", "key", "id"],
	},
	yandex_tracker_search: {
		groupKey: "search",
		icon: "search",
		running: "Searching Tracker",
		complete: "Searched Tracker",
		subtitleKeys: ["query", "q"],
	},
	posthog_query_generate_hogql_from_question: {
		icon: "database",
		running: "Querying PostHog",
		complete: "Queried PostHog",
		subtitleKeys: ["question"],
	},
};

export const getToolUiMetadata = (toolName) =>
	toolUiMetadata[toolName] ?? null;
