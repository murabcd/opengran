import type { UIMessage } from "ai";

type TimestampedUIMessage = UIMessage & {
	createdAt?: Date | string | number;
};

export type StoredChatMessage = {
	id: string;
	role: "system" | "user" | "assistant";
	partsJson: string;
	metadataJson?: string;
	createdAt?: number;
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
		createdAt: message.createdAt,
	}));

export const getUIMessageSeedKey = (messages: UIMessage[]) =>
	messages
		.map((message) =>
			JSON.stringify({
				id: message.id,
				role: message.role,
				parts: message.parts,
				createdAt: (message as TimestampedUIMessage).createdAt,
			}),
		)
		.join("|");
