interface ChatModel {
	id: string;
	name: string;
	model: string;
}

export const chatModels: Array<ChatModel> = [
	{
		id: "gpt-5.4",
		name: "GPT-5.4",
		model: "gpt-5.4",
	},
	{
		id: "gpt-5.4-mini",
		name: "GPT-5.4 mini",
		model: "gpt-5.4-mini",
	},
	{
		id: "gpt-5.4-nano",
		name: "GPT-5.4 nano",
		model: "gpt-5.4-nano",
	},
];

const DEFAULT_CHAT_MODEL = "gpt-5.4";

export const defaultChatModel = chatModels.find(
	(model) => model.id === DEFAULT_CHAT_MODEL,
);

if (!defaultChatModel) {
	throw new Error(
		`Default chat model "${DEFAULT_CHAT_MODEL}" is not configured.`,
	);
}

export const findChatModel = (value?: string | null) =>
	chatModels.find((model) => model.id === value || model.model === value);

export const getChatModel = (value: string) => {
	const model = findChatModel(value);

	if (!model) {
		throw new Error(`Unsupported chat model: ${value}`);
	}

	return model;
};
