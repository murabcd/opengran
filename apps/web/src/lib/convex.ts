import { ConvexReactClient } from "convex/react";

export let convex!: ConvexReactClient;

export function initializeConvexClient(convexUrl: string) {
	convex = new ConvexReactClient(convexUrl, {
		unsavedChangesWarning: false,
	});

	return convex;
}
