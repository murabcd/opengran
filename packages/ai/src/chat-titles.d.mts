export declare function buildChatTitlePrompt(options?: {
	userText?: string;
	assistantText?: string;
}): string;

export declare function deriveFallbackChatTitle(options?: {
	userText?: string;
	maxLength?: number;
}): string;

export declare function finalizeGeneratedChatTitle(options?: {
	generatedTitle?: string;
	userText?: string;
	maxLength?: number;
}): string;
