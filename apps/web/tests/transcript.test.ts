import { describe, expect, it } from "vitest";
import {
	createEmptyLiveTranscriptState,
	createTranscriptDisplayEntries,
} from "../src/lib/transcript";

describe("transcript display entries", () => {
	it("groups adjacent same-speaker utterances into append-only committed blocks", () => {
		expect(
			createTranscriptDisplayEntries({
				liveTranscript: createEmptyLiveTranscriptState(),
				utterances: [
					{
						id: "1",
						speaker: "them",
						text: "First question.",
						startedAt: 1_000,
						endedAt: 2_000,
					},
					{
						id: "2",
						speaker: "them",
						text: "Second question.",
						startedAt: 4_000,
						endedAt: 5_000,
					},
					{
						id: "3",
						speaker: "you",
						text: "Answer.",
						startedAt: 8_000,
						endedAt: 9_000,
					},
				],
			}),
		).toEqual([
			{
				endedAt: 5_000,
				id: "1|2",
				isLive: false,
				isProvisional: false,
				speaker: "them",
				startedAt: 1_000,
				text: "First question. Second question.",
				utteranceIds: ["1", "2"],
			},
			{
				endedAt: 9_000,
				id: "3",
				isLive: false,
				isProvisional: false,
				speaker: "you",
				startedAt: 8_000,
				text: "Answer.",
				utteranceIds: ["3"],
			},
		]);
	});

	it("appends provisional live entries after committed blocks", () => {
		expect(
			createTranscriptDisplayEntries({
				liveTranscript: {
					...createEmptyLiveTranscriptState(),
					them: {
						speaker: "them",
						startedAt: 10_000,
						text: "Still speaking",
					},
				},
				utterances: [
					{
						id: "1",
						speaker: "them",
						text: "Opening.",
						startedAt: 1_000,
						endedAt: 2_000,
					},
				],
			}),
		).toEqual([
			{
				endedAt: 2_000,
				id: "1",
				isLive: false,
				isProvisional: false,
				speaker: "them",
				startedAt: 1_000,
				text: "Opening.",
				utteranceIds: ["1"],
			},
			{
				endedAt: 10_000,
				id: "live:them:10000",
				isLive: true,
				isProvisional: true,
				speaker: "them",
				startedAt: 10_000,
				text: "Still speaking",
				utteranceIds: [],
			},
		]);
	});
});
