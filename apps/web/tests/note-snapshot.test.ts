import { describe, expect, it } from "vitest";
import {
	canFlushQueuedNoteSnapshot,
	createNoteSnapshot,
	isLatestNoteSnapshot,
} from "../src/lib/note-snapshot";

describe("note snapshot coordination", () => {
	it("treats only the newest snapshot as saveable", () => {
		const staleSnapshot = createNoteSnapshot({
			title: "Interview",
			content: '{"type":"doc","content":[{"type":"paragraph"}]}',
			searchableText: "",
		});
		const latestSnapshot = createNoteSnapshot({
			title: "Generated title",
			content:
				'{"type":"doc","content":[{"type":"heading","attrs":{"level":2}}]}',
			searchableText: "Overview\nDecisions\nShip autosave fix",
		});

		expect(isLatestNoteSnapshot(staleSnapshot, latestSnapshot)).toBe(false);
		expect(isLatestNoteSnapshot(latestSnapshot, latestSnapshot)).toBe(true);
	});

	it("flushes only queued snapshots that are still current and unsaved", () => {
		const staleSnapshot = createNoteSnapshot({
			title: "Interview",
			content: '{"type":"doc","content":[{"type":"paragraph"}]}',
			searchableText: "",
		});
		const latestSnapshot = createNoteSnapshot({
			title: "Generated title",
			content:
				'{"type":"doc","content":[{"type":"heading","attrs":{"level":2}}]}',
			searchableText: "Overview\nDecisions\nShip autosave fix",
		});

		expect(
			canFlushQueuedNoteSnapshot({
				queuedSnapshot: staleSnapshot,
				latestSnapshot,
				lastSavedSnapshot: null,
			}),
		).toBe(false);

		expect(
			canFlushQueuedNoteSnapshot({
				queuedSnapshot: latestSnapshot,
				latestSnapshot,
				lastSavedSnapshot: null,
			}),
		).toBe(true);

		expect(
			canFlushQueuedNoteSnapshot({
				queuedSnapshot: latestSnapshot,
				latestSnapshot,
				lastSavedSnapshot: latestSnapshot,
			}),
		).toBe(false);
	});
});
