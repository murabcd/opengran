import { FileText } from "lucide-react";
import type { ChatMessageMetadata } from "@/lib/chat-message";

export function ChatRecipeReceipt({
	recipe,
}: {
	recipe: NonNullable<ChatMessageMetadata["recipe"]>;
}) {
	return (
		<span className="inline cursor-pointer align-baseline whitespace-nowrap text-inherit">
			<FileText
				aria-hidden="true"
				className="mr-1 inline size-4 align-[-0.125em] text-blue-400"
			/>
			<span className="cursor-pointer font-medium text-blue-400 decoration-blue-300/80 decoration-dotted underline-offset-4 hover:underline">
				{recipe.name}
			</span>
		</span>
	);
}
