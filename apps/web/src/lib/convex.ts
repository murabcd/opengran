import { ConvexReactClient } from "convex/react";

export function initializeConvexClient(convexUrl: string) {
	return new ConvexReactClient(convexUrl, {
		unsavedChangesWarning: false,
	});
}
