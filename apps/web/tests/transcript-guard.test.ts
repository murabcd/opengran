import { describe, expect, it } from "vitest";
import {
	containsTranscriptPromptLeakage,
	isSuspiciousCommittedTranscriptText,
} from "../src/lib/transcript-guard";

describe("transcript guard", () => {
	it("detects prompt leakage in transcript text", () => {
		expect(
			containsTranscriptPromptLeakage(
				"Transcribe speech verbatim with punctuation. Preserve names, product terms, and domain-specific vocabulary when possible.",
			),
		).toBe(true);
	});

	it("does not flag transcript text only because it uses a different script", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				text: "Good morning, this is a long English sentence that should not appear in a Russian-only meeting.",
			}),
		).toBe(false);
	});

	it("does not flag text only because confidence is low", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				text: "hello hello hello hello hello hello hello hello",
			}),
		).toBe(false);
	});

	it("flags placeholder transcript text", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				text: "[inaudible]",
			}),
		).toBe(true);
	});

	it("does not flag short committed turns only because they are short", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				text: "Trust me",
			}),
		).toBe(false);
	});

	it("keeps longer captured turns visible", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				text: "But if you really struggle to come up with good ideas, it's okay to work somewhere else.",
			}),
		).toBe(false);
	});

	it("keeps short ordinary committed turns", () => {
		expect(
			isSuspiciousCommittedTranscriptText({
				text: "What you got?",
			}),
		).toBe(false);
	});
});
