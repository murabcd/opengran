export declare const BASE_CHAT_SYSTEM_PROMPT: string;
export declare const ENHANCED_NOTE_SYSTEM_PROMPT: string;
export declare const APPLY_TEMPLATE_SYSTEM_PROMPT: string;

export declare function buildChatSystemPrompt(options?: {
	notesContext?: string;
	attachedNoteContext?: string;
	webSearchEnabled?: boolean;
}): string;

export declare function buildEnhancedNotePrompt(options?: {
	title?: string;
	rawNotes?: string;
	transcript?: string;
	noteText?: string;
}): string;

export declare function buildApplyTemplatePrompt(options?: {
	title?: string;
	templateName?: string;
	meetingContext?: string;
	templateSections?: Array<{
		title: string;
		prompt?: string;
	}>;
	noteText?: string;
}): string;
