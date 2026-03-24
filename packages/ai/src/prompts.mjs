const joinPromptSections = (sections) => sections.filter(Boolean).join(" ");

export const BASE_CHAT_SYSTEM_PROMPT = joinPromptSections([
	"You are OpenGran AI, a concise assistant for meeting notes and chat.",
	"Answer clearly and directly.",
	"If the user asks about meetings or notes that are not available in context, say that you do not have that context yet.",
]);

export const buildChatSystemPrompt = ({
	notesContext = "",
	attachedNoteContext = "",
	webSearchEnabled = false,
} = {}) =>
	webSearchEnabled
		? joinPromptSections([
				BASE_CHAT_SYSTEM_PROMPT,
				notesContext,
				attachedNoteContext,
				"Web search is enabled.",
				"Use web search when the answer would benefit from up-to-date or verifiable information.",
				"When you use web search, rely on the tool results instead of making up citations.",
			])
		: joinPromptSections([
				BASE_CHAT_SYSTEM_PROMPT,
				notesContext,
				attachedNoteContext,
			]);

export const STRUCTURED_NOTE_SYSTEM_PROMPT = joinPromptSections([
	"You turn raw meeting transcripts into clean structured notes.",
	"Stay grounded in the transcript and the user's raw notes.",
	"Do not invent facts, decisions, owners, or dates that are not supported.",
	"Return a concise, specific note title that matches the transcript content.",
	"Prefer concise bullets over long prose.",
	"Create practical sections such as Summary, Decisions, Risks, Next steps, or Open questions when relevant.",
]);

export const buildStructuredNotePrompt = ({
	title = "",
	rawNotes = "",
	transcript = "",
} = {}) =>
	[
		title.trim() ? `Note title: ${title.trim()}` : "",
		rawNotes.trim() ? `User notes:\n${rawNotes.trim()}` : "",
		`Raw transcript:\n${transcript.trim()}`,
	]
		.filter(Boolean)
		.join("\n\n");

export const APPLY_TEMPLATE_SYSTEM_PROMPT = joinPromptSections([
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
]);

export const buildApplyTemplatePrompt = ({
	title = "",
	templateName = "",
	meetingContext = "",
	templateSections = [],
	noteText = "",
} = {}) =>
	[
		title.trim() ? `Current note title: ${title.trim()}` : "",
		templateName.trim() ? `Template name: ${templateName.trim()}` : "",
		meetingContext.trim() ? `Template context:\n${meetingContext.trim()}` : "",
		[
			"Template sections:",
			...templateSections.map(
				(section, index) =>
					`${index + 1}. ${section.title}${
						section.prompt ? `\nPrompt: ${section.prompt}` : ""
					}`,
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
		.join("\n\n");
