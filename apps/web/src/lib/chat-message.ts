import type { UIMessage } from "ai";
import type { RecipeSlug } from "@/lib/recipes";

export type ChatMessageMetadata = {
	recipe?: {
		slug: RecipeSlug;
		name: string;
	};
	recipeOnly?: boolean;
};

export const extractTextParts = (message: UIMessage) =>
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
