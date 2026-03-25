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

export const fallbackChatModel =
	chatModels.find((model) => model.id === DEFAULT_CHAT_MODEL) ?? chatModels[0];

export const resolveChatModel = (value?: string | null) =>
	chatModels.find((model) => model.id === value || model.model === value) ??
	fallbackChatModel;
