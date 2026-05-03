import { describe, expect, it } from "vitest";
import {
	getAppSourceLabel,
	getSelectedScopeLabel,
} from "@/lib/chat-source-display";

describe("chat source display", () => {
	it("uses tool labels for connected app sources", () => {
		expect(getAppSourceLabel("notion")).toBe("Notion");
		expect(getAppSourceLabel("posthog")).toBe("PostHog");
		expect(getAppSourceLabel("yandex-tracker")).toBe("Yandex Tracker");
	});

	it("shows the selected tool name in the scope trigger", () => {
		expect(
			getSelectedScopeLabel({
				selectedSourceIds: ["app:notion"],
				projectSources: [],
				appSources: [
					{
						id: "app:notion",
						provider: "notion",
					},
				],
			}),
		).toBe("Notion");
	});

	it("shows the project source title", () => {
		expect(
			getSelectedScopeLabel({
				selectedSourceIds: ["project:123"],
				projectSources: [
					{
						id: "project:123",
						title: "Internal",
					},
				],
				appSources: [],
			}),
		).toBe("Internal");
	});

	it("falls back when the selected source is not in known app or project sources", () => {
		expect(
			getSelectedScopeLabel({
				selectedSourceIds: ["note-1"],
				projectSources: [],
				appSources: [],
			}),
		).toBe("1 source");
	});
});
