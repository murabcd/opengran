import type { ChatMessageMetadata } from "@/lib/chat-message";

export function ChatRecipeReceipt({
	recipe,
}: {
	recipe: NonNullable<ChatMessageMetadata["recipe"]>;
}) {
	return (
		<span className="inline cursor-pointer align-baseline whitespace-nowrap text-inherit">
			@
			<span className="cursor-pointer font-medium text-blue-400 decoration-blue-300/80 decoration-dotted underline-offset-4 hover:underline">
				{recipe.name}
			</span>
		</span>
	);
}
