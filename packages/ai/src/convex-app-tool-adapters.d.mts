import type { ConvexHttpClient } from "convex/browser";
import type { ToolSet } from "ai";
import type { Id } from "../../../convex/_generated/dataModel";
import type { ConnectedAppToolConnection } from "./app-tools.mjs";

export declare function buildConvexConnectedAppTools(args: {
	connections: ConnectedAppToolConnection[];
	convexClient: ConvexHttpClient | null;
	workspaceId: Id<"workspaces"> | null;
}): Promise<ToolSet>;
