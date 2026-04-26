import { cn } from "@workspace/ui/lib/utils";
import type { ChatMessageMetadata } from "@/lib/chat-message";
import { getRecipeIcon } from "@/lib/recipes";

export function ChatRecipeReceipt({
	isUserMessage,
	recipe,
}: {
	isUserMessage: boolean;
	recipe: NonNullable<ChatMessageMetadata["recipe"]>;
}) {
	const Icon = getRecipeIcon(recipe.slug);

	return (
		<div
			className={cn("flex", isUserMessage ? "justify-end" : "justify-start")}
		>
			<div
				className={cn(
					"inline-flex max-w-full items-center gap-2 rounded-lg border border-border/60 bg-transparent px-2.5 py-1.5 text-sm font-medium",
					isUserMessage ? "text-secondary-foreground" : "text-foreground",
				)}
			>
				<span className="flex size-5 shrink-0 items-center justify-center rounded-md text-primary">
					<Icon className="size-3.5" />
				</span>
				<span className="truncate">{recipe.name}</span>
			</div>
		</div>
	);
}
