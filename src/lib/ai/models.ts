export interface ChatModel {
	id: string;
	name: string;
	model: string;
}

export const chatModels: Array<ChatModel> = [
	{
		id: "auto",
		name: "Auto",
		model: "gpt-5.4",
	},
	{
		id: "gpt-5.4",
		name: "GPT-5.4",
		model: "gpt-5.4",
	},
	{
		id: "gpt-4.1",
		name: "GPT-4.1",
		model: "gpt-4.1",
	},
	{
		id: "gpt-4.1-mini",
		name: "GPT-4.1 mini",
		model: "gpt-4.1-mini",
	},
	{
		id: "gpt-4.1-nano",
		name: "GPT-4.1 nano",
		model: "gpt-4.1-nano",
	},
];

export const DEFAULT_CHAT_MODEL = "auto";

export const fallbackChatModel =
	chatModels.find((model) => model.id === DEFAULT_CHAT_MODEL) ?? chatModels[0];

export const resolveChatModel = (value?: string | null) =>
	chatModels.find((model) => model.id === value || model.model === value) ??
	fallbackChatModel;
