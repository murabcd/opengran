import type { ToolSet } from "ai";

export type PostHogToolConnection = {
	sourceId: string;
	provider: "posthog";
	displayName: string;
	baseUrl: string;
	projectId: string;
	projectName: string;
	token: string;
};

export declare function buildPostHogTools(
	connection: PostHogToolConnection,
): Promise<ToolSet>;
