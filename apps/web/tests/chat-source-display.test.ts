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
				workspaceSourceId: "workspace:123",
				workspaceLabel: "Murad's workspace",
				workspaceSources: [],
				appSources: [
					{
						id: "app:notion",
						provider: "notion",
					},
				],
			}),
		).toBe("Notion");
	});

	it("shows the workspace label instead of the workspace name", () => {
		expect(
			getSelectedScopeLabel({
				selectedSourceIds: ["workspace:123"],
				workspaceSourceId: "workspace:123",
				workspaceLabel: "Murad's workspace",
				workspaceSources: [],
				appSources: [],
			}),
		).toBe("Murad's workspace");
	});

	it("falls back to the note title for note-specific selections", () => {
		expect(
			getSelectedScopeLabel({
				selectedSourceIds: ["note-1"],
				workspaceSourceId: "workspace:123",
				workspaceLabel: "Murad's workspace",
				workspaceSources: [
					{
						id: "note-1",
						title: "Launch plan",
					},
				],
				appSources: [],
			}),
		).toBe("Launch plan");
	});
});
