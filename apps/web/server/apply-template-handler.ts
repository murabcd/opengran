import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import { smoothStream, streamText } from "ai";
import {
	parseTemplateStreamToStructuredNote,
	validateTemplateStream,
} from "../src/lib/note-template-stream";

type ApplyTemplateRequestBody = {
	title?: string;
	noteText?: string;
	template?: {
		slug?: string;
		name?: string;
		meetingContext?: string;
		sections?: Array<{
			id?: string;
			title?: string;
			prompt?: string;
		}>;
	};
};

const readJsonBody = async (request: IncomingMessage) => {
	const chunks: Uint8Array[] = [];

	for await (const chunk of request) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");

	if (!rawBody) {
		return {};
	}

	return JSON.parse(rawBody) as ApplyTemplateRequestBody;
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

export const handleApplyTemplateRequest = async (
	request: IncomingMessage,
	response: ServerResponse,
) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const { title = "", noteText = "", template } = await readJsonBody(request);

	if (!noteText.trim()) {
		sendJson(response, 400, {
			error: "Note text is required.",
		});
		return;
	}

	if (!template?.name || !template.sections || template.sections.length === 0) {
		sendJson(response, 400, {
			error: "A valid template is required.",
		});
		return;
	}

	const templateSections = template.sections
		.map((section) => ({
			title: section.title?.trim() ?? "",
			prompt: section.prompt?.trim() ?? "",
		}))
		.filter((section) => section.title);

	if (templateSections.length === 0) {
		sendJson(response, 400, {
			error: "The selected template does not have usable sections.",
		});
		return;
	}

	response.statusCode = 200;
	response.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
	response.setHeader("Cache-Control", "no-cache, no-transform");
	response.flushHeaders?.();

	const result = streamText({
		model: openai("gpt-5.4-mini"),
		system: [
			"You rewrite existing notes into a selected note template.",
			"Preserve the source language used in the notes.",
			"Do not invent facts, decisions, owners, or dates.",
			"Keep the note title unchanged and do not output it.",
			"Output only the rewritten note body as plain text.",
			"Before the first section, you may include short bullet points only if they are broadly useful.",
			"Then output every template section in the same order using the exact format `## Section title` on its own line.",
			"Under each section heading, use concise bullet points prefixed with `- `.",
			"If a section has no grounded information, keep the heading and leave it empty.",
			"Do not add commentary, markdown code fences, or extra headings.",
		].join(" "),
		prompt: [
			title.trim() ? `Current note title: ${title.trim()}` : "",
			template.name.trim() ? `Template name: ${template.name.trim()}` : "",
			template.meetingContext?.trim()
				? `Template context:\n${template.meetingContext.trim()}`
				: "",
			[
				"Template sections:",
				...templateSections.map(
					(section, index) =>
						`${index + 1}. ${section.title}${section.prompt ? `\nPrompt: ${section.prompt}` : ""}`,
				),
			].join("\n"),
			`Source note:\n${noteText.trim()}`,
			[
				"Return every template section in the same order.",
				"Use exact section titles from the template.",
				"Each section should contain concise bullets grounded only in the source note.",
				"Output plain text only in this format:",
				"- optional overview bullet",
				"## First section title",
				"- bullet",
				"## Second section title",
				"- bullet",
			].join("\n"),
		]
			.filter(Boolean)
			.join("\n\n"),
		experimental_transform: smoothStream({
			chunking: "line",
		}),
	});

	const writeEvent = (payload: Record<string, unknown>) => {
		response.write(`${JSON.stringify(payload)}\n`);
	};

	try {
		let streamedText = "";

		for await (const delta of result.textStream) {
			streamedText += delta;
			writeEvent({
				type: "text-delta",
				delta,
			});
		}

		const parsed = parseTemplateStreamToStructuredNote({
			text: streamedText,
			template: {
				sections: templateSections,
			},
			isFinal: true,
		});
		const validationError = validateTemplateStream({
			template: {
				sections: templateSections,
			},
			parsed,
		});

		if (validationError) {
			writeEvent({
				type: "error",
				error: validationError,
			});
			response.end();
			return;
		}

		writeEvent({
			type: "final-note",
			note: parsed.note,
		});
		response.end();
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "Failed to apply note template rewrite.";
		writeEvent({
			type: "error",
			error: message,
		});
		response.end();
	}
};
