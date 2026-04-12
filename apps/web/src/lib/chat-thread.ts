import type { UIMessage } from "ai";

export const getMessageIndex = (messages: UIMessage[], messageId: string) =>
	messages.findIndex((message) => message.id === messageId);

export const getMessagesBefore = (messages: UIMessage[], messageId: string) => {
	const targetIndex = getMessageIndex(messages, messageId);

	return targetIndex >= 0 ? messages.slice(0, targetIndex) : messages;
};
