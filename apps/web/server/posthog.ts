import {
	buildPostHogTools as buildSharedPostHogTools,
	type PostHogToolConnection,
} from "../../../packages/ai/src/posthog-tools.mjs";

export const buildPostHogTools = (connection: PostHogToolConnection) =>
	buildSharedPostHogTools(connection);
