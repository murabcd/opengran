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
