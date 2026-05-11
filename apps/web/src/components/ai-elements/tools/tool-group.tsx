import type { UIMessage } from "ai";
import { memo, useMemo, useState } from "react";
import { ToolDetails } from "@/components/ai-elements/tools/tool-details";
import { getToolMeta } from "@/components/ai-elements/tools/tool-registry";
import { toToolPartLike } from "@/components/ai-elements/tools/tool-renderer";
import { ToolRowBase } from "@/components/ai-elements/tools/tool-row-base";
import { getToolStatus } from "@/components/ai-elements/utils/format-tool";
import {
	formatElapsedTime,
	getToolDurationMs,
} from "@/components/ai-elements/utils/tool-display";

export type ToolGroupProps = {
	chatStatus: "streaming" | "ready";
	parts: UIMessage["parts"];
};

const formatCallCount = (count: number) =>
	`${count} ${count === 1 ? "call" : "calls"}`;

const getGroupSummary = ({
	failedCount,
	totalCount,
}: {
	failedCount: number;
	totalCount: number;
}) => {
	const segments = [formatCallCount(totalCount)];

	if (failedCount > 0) {
		segments.push(`${failedCount} failed`);
	}

	return segments.join(", ");
};

export const ToolGroup = memo(function ToolGroup({
	chatStatus,
	parts,
}: ToolGroupProps) {
	const [expanded, setExpanded] = useState(false);
	const summary = useMemo(() => {
		const toolParts = parts.map(toToolPartLike);
		const failedCount = toolParts.filter(
			(part) => getToolStatus(part, chatStatus).isError,
		).length;
		const pendingCount = toolParts.filter(
			(part) => getToolStatus(part, chatStatus).isPending,
		).length;
		const durationMs = toolParts.reduce(
			(total, part) => total + (getToolDurationMs(part) ?? 0),
			0,
		);

		return {
			durationLabel: durationMs > 0 ? formatElapsedTime(durationMs) : "",
			failedCount,
			isPending: pendingCount > 0,
			summary: getGroupSummary({
				failedCount,
				totalCount: toolParts.length,
			}),
		};
	}, [chatStatus, parts]);

	return (
		<ToolRowBase
			shimmerLabel="Working"
			completeLabel="Worked"
			isAnimating={summary.isPending}
			detail={summary.summary}
			expandable
			expanded={expanded}
			onToggleExpand={() => setExpanded((value) => !value)}
			trailingContent={
				summary.durationLabel ? (
					<span className="shrink-0 font-normal tabular-nums text-muted-foreground/60">
						{summary.durationLabel}
					</span>
				) : undefined
			}
		>
			<div className="flex flex-col gap-1.5">
				{parts.map((part, index) => (
					<NestedToolRow
						key={getToolPartKey(part, index)}
						part={part}
						chatStatus={chatStatus}
					/>
				))}
			</div>
		</ToolRowBase>
	);
});

const getToolPartKey = (part: UIMessage["parts"][number], index: number) =>
	"toolCallId" in part && typeof part.toolCallId === "string"
		? part.toolCallId
		: `${part.type}:${index}`;

const NestedToolRow = memo(function NestedToolRow({
	chatStatus,
	part,
}: {
	chatStatus: "streaming" | "ready";
	part: UIMessage["parts"][number];
}) {
	const toolPart = toToolPartLike(part);
	const meta = getToolMeta(toolPart);
	if (!meta) {
		return null;
	}

	const { isError, isPending } = getToolStatus(toolPart, chatStatus);
	const Icon = meta.icon;
	const title = meta.title(toolPart);
	const hasDetails = Boolean(
		toolPart.input || toolPart.output || toolPart.result || toolPart.errorText,
	);

	return (
		<ToolRowBase
			icon={
				Icon ? (
					<Icon className="size-full shrink-0 text-muted-foreground" />
				) : undefined
			}
			shimmerLabel={title}
			completeLabel={getNestedLabel({ isError, title })}
			isAnimating={isPending}
			detail={meta.subtitle?.(toolPart)}
			expandable={hasDetails}
			hideChevronUntilHover
		>
			<ToolDetails
				input={toolPart.input}
				output={toolPart.output ?? toolPart.result}
				errorText={toolPart.errorText}
			/>
		</ToolRowBase>
	);
});

const getNestedLabel = ({
	isError,
	title,
}: {
	isError: boolean;
	title: string;
}) => {
	if (isError) {
		return `${title} failed`;
	}

	return title;
};
