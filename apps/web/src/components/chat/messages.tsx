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

const toDisplayTitle = (url: string, title?: string | null) => {
	if (typeof title === "string" && title.trim()) {
		return title;
	}

	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
};

const tryParseJson = (value: unknown): unknown => {
	if (typeof value !== "string") {
		return value;
	}

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

		if (
			toolName !== "web_search" &&
			toolName !== "yandex_tracker_search" &&
			toolName !== "yandex_tracker_get_issue" &&
			toolName !== "jira_search" &&
			toolName !== "jira_get_issue"
		) {
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

			const url =
				"url" in source ? (source as { url?: unknown }).url : undefined;
			const title =
				"title" in source ? (source as { title?: unknown }).title : undefined;

			if (typeof url === "string" && url) {
				sources.push({
					href: url,
					title: toDisplayTitle(url, typeof title === "string" ? title : null),
				});
			}
		}
	};

	for (const part of message.parts) {
		if (!part.type.startsWith("tool-")) {
			continue;
		}

		const toolName = part.type.slice("tool-".length);

		if (
			!("output" in part) ||
			!("state" in part) ||
			part.state !== "output-available"
		) {
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

const collectMessageSources = (message: UIMessage): ToolSource[] => {
	const sources: ToolSource[] = [];

	for (const part of message.parts) {
		if (part.type !== "source-url") {
			continue;
		}

		sources.push({
			href: part.url,
			title: toDisplayTitle(part.url, part.title),
		});
	}

	sources.push(...collectToolSources(message));

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
		<div className="space-y-4">
			{messages.map((message) => {
				const textParts = extractTextParts(message);
				const messageSources =
					message.role === "assistant" ? collectMessageSources(message) : [];
				const isStreamingAssistantMessage =
					isLoading &&
					message.role === "assistant" &&
					message.id === lastMessage?.id;
				const isEmpty = textParts.length === 0;

				if (isEmpty && !isStreamingAssistantMessage) {
					return null;
				}

				return (
					<div key={message.id} className="mx-auto w-full">
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
												"rounded-lg bg-secondary px-4 py-3 text-secondary-foreground",
											isStreamingAssistantMessage &&
												isEmpty &&
												"text-right text-muted-foreground",
										)}
									>
										{isStreamingAssistantMessage && isEmpty ? (
											<div className="text-sm text-muted-foreground">
												<ShimmerText>Thinking</ShimmerText>
											</div>
										) : (
											<Streamdown
												className="note-streamdown"
												isAnimating={isStreamingAssistantMessage}
												caret="block"
												controls={false}
											>
												{textParts.map((part) => part.text).join("\n\n")}
											</Streamdown>
										)}
									</div>
								</div>
								{message.role === "assistant" && messageSources.length > 0 ? (
									<Sources defaultOpen={false}>
										<SourcesTrigger count={messageSources.length} />
										<SourcesContent>
											{messageSources.map((source) => (
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
	);
}
