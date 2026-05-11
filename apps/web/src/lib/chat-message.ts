import type { UIMessage } from "ai";
import type { ChatAppSourceProvider } from "@/lib/chat-source-display";
import type { RecipeSlug } from "@/lib/recipes";

export type ChatMessageMetadata = {
	recipe?: {
		slug: RecipeSlug;
		name: string;
	};
	recipeOnly?: boolean;
	mentionPositions?: Array<{
		id: string;
		label: string;
		from: number;
		to: number;
		type?: "note" | "tool";
		provider?: ChatAppSourceProvider;
	}>;
};

const extractTextParts = (message: UIMessage) =>
	message.parts.filter(
		(part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
			part.type === "text" &&
			typeof part.text === "string" &&
			part.text.length > 0,
	);

export const extractFileParts = (message: UIMessage) =>
	message.parts.filter(
		(part): part is Extract<(typeof message.parts)[number], { type: "file" }> =>
			part.type === "file" &&
			typeof part.url === "string" &&
			part.url.length > 0,
	);

export const extractToolParts = (message: UIMessage) =>
	message.parts.filter((part) => part.type.startsWith("tool-"));

export const extractReasoningParts = (message: UIMessage) =>
	message.parts.filter((part) => part.type === "reasoning");

export const getChatText = (message: UIMessage) =>
	extractTextParts(message)
		.map((part) => part.text)
		.join("\n\n")
		.trim();

export const getChatMessageMetadata = (
	message: UIMessage,
): ChatMessageMetadata | null => {
	const metadata = message.metadata;

	if (!metadata || typeof metadata !== "object") {
		return null;
	}

	return metadata as ChatMessageMetadata;
};
