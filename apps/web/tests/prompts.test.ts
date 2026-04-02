import { describe, expect, it } from "vitest";
import {
	buildApplyTemplatePrompt,
	buildChatSystemPrompt,
	buildEnhancedNotePrompt,
} from "../../../packages/ai/src/prompts.mjs";

describe("prompt helpers", () => {
	it("skips nullable user profile fields in the chat system prompt", () => {
		expect(() =>
			buildChatSystemPrompt({
				userProfileContext: {
					name: null,
					jobTitle: null,
					companyName: null,
				},
			}),
		).not.toThrow();
	});

	it("accepts nullable note fields in note prompts", () => {
		expect(() =>
			buildEnhancedNotePrompt({
				title: null,
				rawNotes: null,
				transcript: null,
				noteText: null,
			}),
		).not.toThrow();
		expect(() =>
			buildApplyTemplatePrompt({
				title: null,
				templateName: null,
				meetingContext: null,
				templateSections: [],
				noteText: null,
			}),
		).not.toThrow();
	});
});
