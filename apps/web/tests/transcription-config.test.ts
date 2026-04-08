import { describe, expect, it } from "vitest";
import {
	createRealtimeTranscriptionSession,
	createRealtimeTranscriptionSessionOptions,
	isLowConfidenceTranscriptLogprobs,
	resolveDesktopRealtimeProfile,
	resolveRealtimeNoiseReductionType,
	resolveRealtimeSilenceDurationMs,
	resolveRealtimeTranscriptionPrompt,
	TRANSCRIPTION_MODEL,
} from "../../../packages/ai/src/transcription.mjs";

describe("transcription config", () => {
	it("uses the current recommended OpenAI transcription model", () => {
		expect(TRANSCRIPTION_MODEL).toBe("gpt-4o-transcribe");
	});

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

		expect(session.audio.input.turn_detection.type).toBe("server_vad");
		if (session.audio.input.turn_detection.type !== "server_vad") {
			throw new Error("Expected server_vad turn detection for system audio");
		}
		expect(session.audio.input.turn_detection.silence_duration_ms).toBe(450);
		expect(session.audio.input.transcription.prompt).toContain(
			"Do not translate, paraphrase, summarize, or complete a thought beyond the audio.",
		);
	});

	it("uses standard server vad for them on system audio across realtime sessions", () => {
		const session = createRealtimeTranscriptionSession(
			createRealtimeTranscriptionSessionOptions({
				language: "en",
				source: "systemAudio",
				speaker: "them",
			}),
		);

		expect(session.audio.input.turn_detection).toEqual({
			type: "server_vad",
			threshold: 0.5,
			prefix_padding_ms: 300,
			silence_duration_ms: 450,
		});
		expect(
			resolveDesktopRealtimeProfile({
				source: "systemAudio",
				speaker: "them",
			}),
		).toBe("default");
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
});
