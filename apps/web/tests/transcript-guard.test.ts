import { describe, expect, it } from "vitest";
import {
	containsTranscriptPromptLeakage,
	isSuspiciousCommittedTranscriptText,
	isSuspiciousRefinementTranscript,
} from "../src/lib/transcript-guard";

describe("transcript guard", () => {
	it("detects prompt leakage in transcript text", () => {
		expect(
			containsTranscriptPromptLeakage(
				"Transcribe speech verbatim with punctuation. Preserve names, product terms, and domain-specific vocabulary when possible.",
			),
		).toBe(true);
	});

	it("flags a long language-mismatched transcript when Russian is configured", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				language: "ru",
				text: "Good morning, this is a long English sentence that should not appear in a Russian-only meeting.",
			}),
		).toBe(true);
	});

	it("flags a long low-confidence transcript from logprobs", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				logprobs: Array.from({ length: 8 }, () => ({
					logprob: -3,
					token: "hello",
				})),
				text: "hello hello hello hello hello hello hello hello",
			}),
		).toBe(true);
	});

	it("flags placeholder transcript text", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				text: "[inaudible]",
			}),
		).toBe(true);
	});

	it("flags tiny low-confidence system audio turns", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				logprobs: [
					{ logprob: -2.2, token: "trust" },
					{ logprob: -2.5, token: "me" },
				],
				source: "systemAudio",
				text: "Trust me",
			}),
		).toBe(true);
	});

	it("keeps short but plausible low-confidence system audio turns visible", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				logprobs: [
					{ logprob: -2.2, token: "i" },
					{ logprob: -2.5, token: "am" },
					{ logprob: -3.8, token: "trying" },
				],
				source: "systemAudio",
				text: "I am trying",
			}),
		).toBe(false);
	});

	it("keeps longer low-confidence system audio turns visible", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				logprobs: Array.from({ length: 8 }, () => ({
					logprob: -2.6,
					token: "idea",
				})),
				source: "systemAudio",
				text: "But if you really struggle to come up with good ideas, it's okay to work somewhere else.",
			}),
		).toBe(false);
	});

	it("keeps short confident system audio turns", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				logprobs: [
					{ logprob: -0.08, token: "What" },
					{ logprob: -0.06, token: "you" },
					{ logprob: -0.11, token: "got" },
				],
				source: "systemAudio",
				text: "What you got?",
			}),
		).toBe(false);
	});

	it("flags a refinement result that diverges heavily from the reference transcript", () => {
		expect(
			isSuspiciousRefinementTranscript({
				candidateText:
					"Согласно данным ВЦИОМ, россияне ожидают, что также повысить возраст выхода на пенсию.",
				language: "ru",
				referenceText:
					"Мы обсуждали интеграцию HeadHunter, сообщения по статусам и настройки холодного поиска.",
			}),
		).toBe(true);
	});

	it("keeps a close Russian refinement when it stays near the source transcript", () => {
		expect(
			isSuspiciousRefinementTranscript({
				candidateText:
					"Мы обсуждали интеграцию с HeadHunter, сообщения по статусам и настройки холодного поиска.",
				language: "ru",
				referenceText:
					"Мы обсуждали интеграцию HeadHunter, сообщения по статусам и настройки холодного поиска.",
			}),
		).toBe(false);
	});
});
