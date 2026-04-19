export type ChatAppSourceProvider =
	| "google-calendar"
	| "google-drive"
	| "jira"
	| "notion"
	| "posthog"
	| "yandex-calendar"
	| "yandex-tracker";

type WorkspaceSourceLike = {
	id: string;
	title: string;
};

type AppSourceLike = {
	id: string;
	provider: ChatAppSourceProvider;
};

const APP_SOURCE_LABELS: Record<ChatAppSourceProvider, string> = {
	"google-calendar": "Google Calendar",
	"google-drive": "Google Drive",
	jira: "Jira",
	notion: "Notion",
	posthog: "PostHog",
	"yandex-calendar": "Yandex Calendar",
	"yandex-tracker": "Yandex Tracker",
};

export const getAppSourceLabel = (provider: ChatAppSourceProvider) =>
	APP_SOURCE_LABELS[provider];

export const getSelectedScopeLabel = ({
	selectedSourceIds,
	workspaceSourceId,
	workspaceLabel,
	workspaceSources,
	appSources,
}: {
	selectedSourceIds: string[];
	workspaceSourceId: string | null;
	workspaceLabel: string | null;
	workspaceSources: WorkspaceSourceLike[];
	appSources: AppSourceLike[];
}) => {
	if (selectedSourceIds.length === 0) {
		return "All sources";
	}

	if (selectedSourceIds.length > 1) {
		return `${selectedSourceIds.length} sources`;
	}

	const [selectedSourceId] = selectedSourceIds;

	if (selectedSourceId && selectedSourceId === workspaceSourceId) {
		return workspaceLabel?.trim() || "Workspace";
	}

	const appSource = appSources.find((source) => source.id === selectedSourceId);

	if (appSource) {
		return getAppSourceLabel(appSource.provider);
	}

	const workspaceSource = workspaceSources.find(
		(source) => source.id === selectedSourceId,
	);

	return workspaceSource?.title ?? "1 source";
};
