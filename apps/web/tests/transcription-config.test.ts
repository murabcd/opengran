import { describe, expect, it } from "vitest";
import {
	createRealtimeTranscriptionSession,
	createRealtimeTranscriptionSessionOptions,
	isLowConfidenceTranscriptLogprobs,
	resolveRealtimeNoiseReductionType,
	resolveRealtimeSilenceDurationMs,
	resolveRealtimeTranscriptionPrompt,
	shouldDropTranscriptForConfidence,
} from "../../../packages/ai/src/transcription.mjs";

describe("transcription config", () => {
	it("does not apply microphone noise reduction to system audio", () => {
		expect(resolveRealtimeNoiseReductionType("systemAudio")).toBeNull();
		expect(resolveRealtimeNoiseReductionType("system-audio")).toBeNull();
		expect(resolveRealtimeNoiseReductionType("system_audio")).toBeNull();
		expect(resolveRealtimeNoiseReductionType("microphone")).toBe("near_field");
	});

	it("serializes nullable noise reduction in realtime transcription sessions", () => {
		expect(
			createRealtimeTranscriptionSession({
				language: "en",
				noiseReductionType: null,
			}).audio.input.noise_reduction,
		).toBeNull();
	});

	it("uses source-aware prompting and VAD settings for system audio", () => {
		expect(resolveRealtimeSilenceDurationMs("systemAudio")).toBe(450);
		expect(resolveRealtimeSilenceDurationMs("microphone")).toBe(200);
		expect(
			resolveRealtimeTranscriptionPrompt({
				language: "en",
				source: "systemAudio",
			}),
		).toContain("The spoken language is English.");

		const session = createRealtimeTranscriptionSession(
			createRealtimeTranscriptionSessionOptions({
				language: "en",
				source: "systemAudio",
			}),
		);

		expect(session.audio.input.turn_detection.silence_duration_ms).toBe(450);
		expect(session.audio.input.transcription.prompt).toContain(
			"Do not translate, paraphrase, summarize, or complete a thought beyond the audio.",
		);
	});

	it("uses stricter low-confidence thresholds for system audio", () => {
		expect(
			isLowConfidenceTranscriptLogprobs({
				logprobs: [
					{ logprob: -1.8, token: "hello" },
					{ logprob: -2.4, token: "world" },
					{ logprob: -3.6, token: "today" },
				],
				source: "systemAudio",
				text: "hello world today",
			}),
		).toBe(true);

		expect(
			isLowConfidenceTranscriptLogprobs({
				logprobs: [
					{ logprob: -0.08, token: "hello" },
					{ logprob: -0.05, token: "world" },
					{ logprob: -0.09, token: "today" },
				],
				source: "systemAudio",
				text: "hello world today",
			}),
		).toBe(false);
	});

	it("drops low-confidence short and medium system-audio turns more aggressively", () => {
		expect(
			shouldDropTranscriptForConfidence({
				logprobs: Array.from({ length: 6 }, () => ({
					logprob: -2.8,
					token: "watch",
				})),
				source: "systemAudio",
				text: "Watch this",
			}),
		).toBe(true);

		expect(
			shouldDropTranscriptForConfidence({
				logprobs: [
					{ logprob: -2.8, token: "i" },
					{ logprob: -2.7, token: "am" },
					{ logprob: -2.9, token: "trying" },
				],
				source: "systemAudio",
				text: "I am trying",
			}),
		).toBe(true);

		expect(
			shouldDropTranscriptForConfidence({
				logprobs: Array.from({ length: 8 }, () => ({
					logprob: -2.6,
					token: "quality",
				})),
				source: "systemAudio",
				text: "This should probably not survive the draft lane",
			}),
		).toBe(true);
	});

	it("keeps longer system-audio answer chunks unless confidence is catastrophic", () => {
		expect(
			shouldDropTranscriptForConfidence({
				logprobs: Array.from({ length: 10 }, () => ({
					logprob: -2.8,
					token: "ideas",
				})),
				source: "systemAudio",
				text: "But if you really struggle to come up with good ideas, it's totally okay to go work somewhere else",
			}),
		).toBe(false);
	});
});
