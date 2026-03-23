import { cn } from "@workspace/ui/lib/utils";
import type { UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { ShimmerText } from "@/components/ai-elements/shimmer";
import {
	Source,
	Sources,
	SourcesContent,
	SourcesTrigger,
} from "@/components/ai-elements/sources";

const extractTextParts = (message: UIMessage) =>
	message.parts.filter(
		(part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
			part.type === "text" &&
			typeof part.text === "string" &&
			part.text.length > 0,
	);

type ToolSource = {
	href: string;
	title: string;
};

const tryParseJson = (value: string): unknown => {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
};

const collectToolSources = (message: UIMessage): ToolSource[] => {
	const sources: ToolSource[] = [];

	const addSourcesFromToolOutput = (toolName: string, output: unknown) => {
		if (!output || typeof output !== "object") {
			return;
		}

		if (toolName !== "web_search") {
			return;
		}

		const resultSources =
			"sources" in output
				? (output as { sources?: unknown }).sources
				: undefined;

		if (!Array.isArray(resultSources)) {
			return;
		}

		for (const source of resultSources) {
			if (!source || typeof source !== "object") {
				continue;
			}

			const type =
				"type" in source ? (source as { type?: unknown }).type : undefined;
			const url =
				"url" in source ? (source as { url?: unknown }).url : undefined;

			if (type === "url" && typeof url === "string" && url) {
				sources.push({
					href: url,
					title: new URL(url).hostname.replace(/^www\./, ""),
				});
			}
		}
	};

	for (const part of message.parts) {
		if (!part.type.startsWith("tool-")) {
			continue;
		}

		const toolName = part.type.slice("tool-".length);

		if (!("output" in part) || typeof part.output !== "string") {
			continue;
		}

		addSourcesFromToolOutput(toolName, tryParseJson(part.output));
	}

	const seen = new Set<string>();

	return sources.filter((source) => {
		const key = `${source.href}::${source.title}`;

		if (seen.has(key)) {
			return false;
		}

		seen.add(key);
		return true;
	});
};

export function ChatMessages({
	messages,
	error,
	isLoading,
}: {
	messages: UIMessage[];
	error?: Error;
	isLoading?: boolean;
}) {
	const lastMessage = messages[messages.length - 1];
	const showLoadingIndicator =
		isLoading &&
		(lastMessage === undefined || lastMessage.role !== "assistant");

	return (
		<div className="flex-1 h-full overflow-y-auto py-8">
			<div className="mx-auto w-full max-w-xl space-y-4 pt-8">
				{messages.map((message) => {
					const textParts = extractTextParts(message);
					const toolSources =
						message.role === "assistant" ? collectToolSources(message) : [];
					const isStreamingAssistantMessage =
						isLoading &&
						message.role === "assistant" &&
						message.id === lastMessage?.id;
					const isEmpty = textParts.length === 0;

					if (isEmpty && !isStreamingAssistantMessage) {
						return null;
					}

					return (
						<div key={message.id} className="mx-auto w-full px-4">
							<div
								className={cn(
									"flex w-full gap-4",
									message.role === "user" && "ml-auto w-fit max-w-2xl",
								)}
							>
								<div className="flex w-full flex-col space-y-4">
									<div className="flex w-full flex-row items-start gap-2 pb-4">
										<div
											className={cn(
												"flex flex-col gap-4 text-sm leading-6",
												message.role === "user" &&
													"rounded-tl-xl rounded-tr-xl rounded-bl-xl bg-secondary px-3 py-2 text-secondary-foreground",
											)}
										>
											{isStreamingAssistantMessage && isEmpty ? (
												<div className="text-sm text-muted-foreground">
													<ShimmerText>Thinking</ShimmerText>
												</div>
											) : (
												<Streamdown
													isAnimating={isStreamingAssistantMessage}
													caret="block"
													controls={false}
												>
													{textParts.map((part) => part.text).join("\n\n")}
												</Streamdown>
											)}
										</div>
									</div>
									{message.role === "assistant" && toolSources.length > 0 ? (
										<Sources defaultOpen={false}>
											<SourcesTrigger count={toolSources.length} />
											<SourcesContent>
												{toolSources.map((source) => (
													<Source
														key={`${message.id}:${source.href}`}
														href={source.href}
														title={source.title}
													/>
												))}
											</SourcesContent>
										</Sources>
									) : null}
								</div>
							</div>
						</div>
					);
				})}

				{showLoadingIndicator ? (
					<div className="mx-auto w-full px-4">
						<div className="flex w-full gap-4">
							<div className="flex w-full flex-col space-y-4">
								<div className="flex w-full flex-row items-start gap-2 pb-4">
									<div className="flex flex-col gap-4 text-sm leading-6 text-muted-foreground">
										<ShimmerText>Thinking</ShimmerText>
									</div>
								</div>
							</div>
						</div>
					</div>
				) : null}

				{error ? (
					<p className="px-4 text-sm text-destructive">{error.message}</p>
				) : null}
			</div>
		</div>
	);
}
