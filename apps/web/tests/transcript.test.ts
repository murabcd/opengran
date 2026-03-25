import { describe, expect, it } from "vitest";
import {
	createDiarizedSpeakerUtterances,
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

	it("maps diarized segments into remote speaker utterances with absolute timing", () => {
		const diarizedUtterances = createDiarizedSpeakerUtterances({
			recordingStartedAt: 10_000,
			recordingEndedAt: 20_000,
			segments: [
				{
					speaker: "speaker_0",
					text: "First remote speaker.",
					start: 0.5,
					end: 1.4,
				},
				{
					speaker: "speaker_1",
					text: "Second remote speaker.",
					start: 1.6,
					end: 2.8,
				},
			],
		});

		expect(diarizedUtterances).toEqual([
			expect.objectContaining({
				speaker: "remote:1",
				text: "First remote speaker.",
				startedAt: 10_500,
				endedAt: 11_400,
			}),
			expect.objectContaining({
				speaker: "remote:2",
				text: "Second remote speaker.",
				startedAt: 11_600,
				endedAt: 12_800,
			}),
		]);
	});
});
