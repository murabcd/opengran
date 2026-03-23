import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

type EnhanceNoteRequestBody = {
	title?: string;
	rawNotes?: string;
	transcript?: string;
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
	} = await readJsonBody(request);

	if (!transcript.trim()) {
		sendJson(response, 400, {
			error: "Transcript is required.",
		});
		return;
	}

	const { output } = await generateText({
		model: openai("gpt-5.4-mini"),
		system: [
			"You turn raw meeting transcripts into clean structured notes.",
			"Stay grounded in the transcript and the user's raw notes.",
			"Do not invent facts, decisions, owners, or dates that are not supported.",
			"Return a concise, specific note title that matches the transcript content.",
			"Prefer concise bullets over long prose.",
			"Create practical sections such as Summary, Decisions, Risks, Next steps, or Open questions when relevant.",
		].join(" "),
		output: Output.object({
			schema: structuredNoteSchema,
		}),
		prompt: [
			title.trim() ? `Note title: ${title.trim()}` : "",
			rawNotes.trim() ? `User notes:\n${rawNotes.trim()}` : "",
			`Raw transcript:\n${transcript.trim()}`,
		]
			.filter(Boolean)
			.join("\n\n"),
	});

	sendJson(response, 200, {
		note: output,
	});
};
