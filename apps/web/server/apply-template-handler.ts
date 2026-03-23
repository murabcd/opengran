import type { IncomingMessage, ServerResponse } from "node:http";
import { openai } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

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

const structuredTemplateNoteSchema = z.object({
	overview: z.array(z.string()),
	sections: z
		.array(
			z.object({
				title: z.string().min(1),
				items: z.array(z.string()),
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

	const { output } = await generateText({
		model: openai("gpt-5.4-mini"),
		system: [
			"You rewrite existing notes into a selected note template.",
			"Preserve the source language used in the notes.",
			"Do not invent facts, decisions, owners, or dates.",
			"Do not rename sections unless they are explicitly provided by the template.",
			"Keep the note title unchanged; only rewrite the body.",
			"Use concise bullets and map information into the provided template sections.",
			"If a template section has no supported information, return that section with an empty items array.",
			"Only place information into overview if it is broadly useful outside the template sections.",
		].join(" "),
		output: Output.object({
			schema: structuredTemplateNoteSchema,
		}),
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
				"Each section should contain concise bullets grounded in the source note.",
			].join("\n"),
		]
			.filter(Boolean)
			.join("\n\n"),
	});

	sendJson(response, 200, {
		note: output,
	});
};
