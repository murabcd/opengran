import { isToolUIPart, type UIMessage } from "ai";
import { memo, useEffect, useMemo, useState } from "react";
import { GenericTool } from "@/components/ai-elements/tools/generic-tool";
import {
	getToolMeta,
	type ToolPartLike,
} from "@/components/ai-elements/tools/tool-registry";
import { getToolStatus } from "@/components/ai-elements/utils/format-tool";
import {
	formatElapsedTime,
	getToolDurationMs,
	getToolStartedAt,
} from "@/components/ai-elements/utils/tool-display";
import { normalizeToolPart } from "@/components/ai-elements/utils/tool-part-normalizer";

export type ToolRendererProps = {
	chatStatus?: string;
	part: UIMessage["parts"][number];
};

export const toToolPartLike = (
	part: UIMessage["parts"][number],
): ToolPartLike => {
	const normalized = normalizeToolPart(part) as {
		input?: unknown;
		output?: unknown;
		result?: unknown;
		state?: string;
		toolCallId?: string;
		type: string;
	};

	return {
		...normalized,
		input:
			normalized.input &&
			typeof normalized.input === "object" &&
			!Array.isArray(normalized.input)
				? (normalized.input as Record<string, unknown>)
				: undefined,
		output:
			normalized.output &&
			typeof normalized.output === "object" &&
			!Array.isArray(normalized.output)
				? (normalized.output as Record<string, unknown>)
				: undefined,
		result:
			normalized.result &&
			typeof normalized.result === "object" &&
			!Array.isArray(normalized.result)
				? (normalized.result as Record<string, unknown>)
				: undefined,
	};
};

export const ToolRenderer = memo(function ToolRenderer({
	chatStatus,
	part,
}: ToolRendererProps) {
	if (!isToolUIPart(part)) {
		return null;
	}

	return <ToolRendererContent part={part} chatStatus={chatStatus} />;
});

function ToolRendererContent({ chatStatus, part }: ToolRendererProps) {
	const toolPart = toToolPartLike(part);
	const meta = getToolMeta(toolPart);
	if (!meta) {
		return null;
	}

	return (
		<KnownToolRenderer
			part={part}
			toolPart={toolPart}
			meta={meta}
			chatStatus={chatStatus}
		/>
	);
}

function KnownToolRenderer({
	chatStatus,
	meta,
	toolPart,
}: ToolRendererProps & {
	meta: NonNullable<ReturnType<typeof getToolMeta>>;
	toolPart: ToolPartLike;
}) {
	const { isPending, isError } = getToolStatus(toolPart, chatStatus);
	const durationLabel = useToolDurationLabel(toolPart, isPending);
	const title = meta.title(toolPart);

	return (
		<GenericTool
			icon={meta.icon}
			title={title || toolPart.type.replace(/^tool-/, "")}
			subtitle={meta.subtitle?.(toolPart)}
			isPending={isPending}
			isError={isError}
			part={toolPart}
			durationLabel={durationLabel}
		/>
	);
}

function useToolDurationLabel(part: ToolPartLike, isPending: boolean) {
	const startedAt = useMemo(() => getToolStartedAt(part), [part]);
	const completedDuration = getToolDurationMs(part);
	const [elapsedMs, setElapsedMs] = useState(() =>
		startedAt ? Date.now() - startedAt : 0,
	);

	useEffect(() => {
		if (!isPending || !startedAt) {
			return;
		}

		setElapsedMs(Date.now() - startedAt);
		const interval = window.setInterval(() => {
			setElapsedMs(Date.now() - startedAt);
		}, 1000);

		return () => window.clearInterval(interval);
	}, [isPending, startedAt]);

	if (!isPending && completedDuration) {
		return formatElapsedTime(completedDuration);
	}

	return isPending ? formatElapsedTime(elapsedMs) : "";
}
