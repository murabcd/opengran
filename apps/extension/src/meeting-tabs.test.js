import { describe, expect, it } from "bun:test";
import {
	getMeetingSignalPayload,
	getTrackedMeetingTabIds,
	isSupportedMeetingUrl,
} from "./meeting-tabs.js";

describe("meeting-tabs", () => {
	it("treats a Google Meet code path as an active meeting", () => {
		const payload = getMeetingSignalPayload([
			{
				active: true,
				id: 1,
				title: "Design review - Google Meet",
				url: "https://meet.google.com/abc-defg-hij",
			},
		]);

		expect(payload.active).toBe(true);
		expect(payload.providerId).toBe("google-meet");
		expect(payload.sourceName).toBe("Google Meet");
		expect(payload.tabId).toBe(1);
	});

	it("does not treat the Google Meet home page as an active meeting", () => {
		const payload = getMeetingSignalPayload([
			{
				active: true,
				id: 2,
				title: "Google Meet",
				url: "https://meet.google.com/",
			},
		]);

		expect(payload.active).toBe(false);
		expect(payload.providerId).toBeNull();
		expect(payload.tabId).toBeNull();
	});

	it("keeps a meeting signal while a matching meeting tab remains open in the background", () => {
		const payload = getMeetingSignalPayload([
			{
				active: false,
				id: 3,
				lastAccessed: 100,
				title: "Sprint planning - Google Meet",
				url: "https://meet.google.com/abc-defg-hij",
			},
			{
				active: true,
				id: 4,
				lastAccessed: 200,
				title: "Inbox",
				url: "https://mail.google.com/mail/u/0/#inbox",
			},
		]);

		expect(payload.active).toBe(true);
		expect(payload.tabId).toBe(3);
	});

	it("tracks only tabs that still qualify as live meetings", () => {
		const trackedTabIds = getTrackedMeetingTabIds([
			{
				active: false,
				id: 5,
				title: "Team sync - Google Meet",
				url: "https://meet.google.com/abc-defg-hij",
			},
			{
				active: false,
				id: 6,
				title: "Google Meet",
				url: "https://meet.google.com/",
			},
		]);

		expect(trackedTabIds.has(5)).toBe(true);
		expect(trackedTabIds.has(6)).toBe(false);
	});

	it("recognizes provider hosts for resync decisions", () => {
		expect(isSupportedMeetingUrl("https://meet.google.com/abc-defg-hij")).toBe(
			true,
		);
		expect(isSupportedMeetingUrl("https://meet.google.com/")).toBe(true);
		expect(isSupportedMeetingUrl("https://example.com/meeting")).toBe(false);
	});
});
