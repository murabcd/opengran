import type { Doc } from "../../../../convex/_generated/dataModel";

export const getChatId = (chat: Pick<Doc<"chats">, "chatId">) => chat.chatId;
