import type { UIMessage } from "ai";

export type StoredChatMessage = {
	id: string;
	role: "system" | "user" | "assistant";
	partsJson: string;
	metadataJson?: string;
};

export const toStoredChatMessages = (
	messages: StoredChatMessage[],
): UIMessage[] =>
	messages.map((message) => ({
		id: message.id,
		role: message.role,
		metadata: message.metadataJson
			? (JSON.parse(message.metadataJson) as UIMessage["metadata"])
			: undefined,
		parts: JSON.parse(message.partsJson) as UIMessage["parts"],
	}));

export const getUIMessageSeedKey = (messages: UIMessage[]) =>
	messages
		.map((message) =>
			JSON.stringify({
				id: message.id,
				role: message.role,
				parts: message.parts,
			}),
		)
		.join("|");
