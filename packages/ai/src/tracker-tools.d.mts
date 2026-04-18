import type { ToolSet } from "ai";

export type TrackerToolConnection = {
	sourceId: string;
	provider: "yandex-tracker";
	displayName: string;
	orgType: "x-org-id" | "x-cloud-org-id";
	orgId: string;
	token: string;
};

export type TrackerIssue = {
	key: string;
	summary: string;
	status?: string;
	assignee?: string;
	url: string;
};

export declare function searchTrackerIssues(
	connection: TrackerToolConnection,
	query: string,
	limit?: number,
): Promise<{
	connection: string;
	issues: TrackerIssue[];
	sources: Array<{
		type: "url";
		url: string;
		title: string;
	}>;
}>;

export declare function getTrackerIssue(
	connection: TrackerToolConnection,
	issueKey: string,
): Promise<{
	connection: string;
	issue: TrackerIssue;
	sources: Array<{
		type: "url";
		url: string;
		title: string;
	}>;
}>;

export declare function buildTrackerTools(
	connection: TrackerToolConnection,
): ToolSet;
