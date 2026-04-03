import { describe, expect, it } from "vitest";
import {
	createRealtimeTranscriptionSession,
	createRealtimeTranscriptionSessionOptions,
	resolveRealtimeNoiseReductionType,
	resolveRealtimeSilenceDurationMs,
	resolveRealtimeTranscriptionPrompt,
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
			"Do not translate or paraphrase.",
		);
	});
});
