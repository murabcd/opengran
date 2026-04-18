import type { ToolSet } from "ai";

export type JiraToolConnection = {
	sourceId: string;
	provider: "jira";
	displayName: string;
	baseUrl: string;
	email: string;
	token: string;
};

export type JiraIssue = {
	key: string;
	summary: string;
	description?: string;
	status?: string;
	assignee?: string;
	url: string;
};

export declare function searchJiraIssues(
	connection: JiraToolConnection,
	query: string,
	limit?: number,
): Promise<{
	connection: string;
	issues: JiraIssue[];
	sources: Array<{
		type: "url";
		url: string;
		title: string;
	}>;
}>;

export declare function getJiraIssue(
	connection: JiraToolConnection,
	issueKey: string,
): Promise<{
	connection: string;
	issue: JiraIssue;
	sources: Array<{
		type: "url";
		url: string;
		title: string;
	}>;
}>;

export declare function buildJiraTools(connection: JiraToolConnection): ToolSet;
