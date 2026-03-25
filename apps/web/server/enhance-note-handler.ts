import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
	buildEnhancedNotePrompt,
	ENHANCED_NOTE_SYSTEM_PROMPT,
} from "../../../packages/ai/src/prompts.mjs";

type EnhanceNoteRequestBody = {
	title?: string;
	rawNotes?: string;
	transcript?: string;
	noteText?: string;
};

const structuredNoteSchema = z.object({
	title: z.string().min(1),
	overview: z.array(z.string()),
	sections: z
		.array(
			z.object({
				title: z.string().min(1),
				items: z.array(z.string()).min(1),
			}),
		)
		.min(1),
});

const readJsonBody = async (request: IncomingMessage) => {
	const chunks: Uint8Array[] = [];

	for await (const chunk of request) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");

	if (!rawBody) {
		return {};
	}

	return JSON.parse(rawBody) as EnhanceNoteRequestBody;
};

const sendJson = (
	response: ServerResponse,
	statusCode: number,
	payload: Record<string, unknown>,
) => {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json");
	response.end(JSON.stringify(payload));
};

export const handleEnhanceNoteRequest = async (
	request: IncomingMessage,
	response: ServerResponse,
) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const {
		title = "",
		rawNotes = "",
		transcript = "",
		noteText = "",
	} = await readJsonBody(request);

	const trimmedTranscript = transcript.trim();
	const trimmedNoteText = noteText.trim();

	if (!trimmedTranscript && !trimmedNoteText) {
		sendJson(response, 400, {
			error: "Transcript or note text is required.",
		});
		return;
	}

	const { output } = await generateText({
		model: openai("gpt-5.4-mini"),
		system: ENHANCED_NOTE_SYSTEM_PROMPT,
		output: Output.object({
			schema: structuredNoteSchema,
		}),
		prompt: buildEnhancedNotePrompt({
			title,
			rawNotes,
			transcript: trimmedTranscript,
			noteText: trimmedNoteText,
		}),
	});

	sendJson(response, 200, {
		note: output,
	});
};
