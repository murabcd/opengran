import { describe, expect, it } from "vitest";
import {
	createRefinedSpeakerUtterances,
	shouldSuppressEchoUtterance,
	type TranscriptUtterance,
} from "../src/lib/transcript";

describe("transcript utilities", () => {
	it("suppresses a microphone utterance that mirrors recent system audio", () => {
		const utterances: TranscriptUtterance[] = [
			{
				id: "them-1",
				speaker: "them",
				text: "We should ship the transcript recovery work before expanding the feature.",
				startedAt: 1_000,
				endedAt: 4_000,
			},
		];
		const candidate: TranscriptUtterance = {
			id: "you-1",
			speaker: "you",
			text: "We should ship the transcript recovery work before expanding the feature.",
			startedAt: 4_200,
			endedAt: 5_200,
		};

		expect(
			shouldSuppressEchoUtterance({
				candidate,
				utterances,
			}),
		).toBe(true);
	});

	it("maps refined text back onto the original speaker timing windows", () => {
		const referenceUtterances: TranscriptUtterance[] = [
			{
				id: "them-1",
				speaker: "them",
				text: "rough one",
				startedAt: 1_000,
				endedAt: 2_000,
			},
			{
				id: "them-2",
				speaker: "them",
				text: "rough two",
				startedAt: 2_100,
				endedAt: 3_000,
			},
		];

		const refinedUtterances = createRefinedSpeakerUtterances({
			referenceUtterances,
			refinedText:
				"First refined sentence. Second refined sentence. Third refined sentence.",
			speaker: "them",
		});

		expect(refinedUtterances).toHaveLength(2);
		expect(refinedUtterances[0]).toMatchObject({
			speaker: "them",
			startedAt: 1_000,
			endedAt: 2_000,
		});
		expect(refinedUtterances[1]).toMatchObject({
			speaker: "them",
			startedAt: 2_100,
			endedAt: 3_000,
		});
		expect(refinedUtterances[0].text).toContain("First refined sentence.");
		expect(refinedUtterances[1].text).toContain("Third refined sentence.");
	});
});
