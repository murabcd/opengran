"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import { cn } from "@workspace/ui/lib/utils";
import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

export const Sources = ({
	className,
	...props
}: ComponentProps<typeof Collapsible>) => (
	<Collapsible
		className={cn("text-xs text-muted-foreground", className)}
		{...props}
	/>
);

export const SourcesTrigger = ({
	className,
	count,
	children,
	...props
}: ComponentProps<typeof CollapsibleTrigger> & {
	count: number;
}) => (
	<CollapsibleTrigger
		className={cn(
			"flex cursor-pointer items-center gap-1 text-muted-foreground transition-colors hover:text-foreground",
			className,
		)}
		{...props}
	>
		{children ?? (
			<>
				<p className="font-medium">Used {count} sources</p>
				<ChevronDownIcon className="size-3.5 shrink-0" />
			</>
		)}
	</CollapsibleTrigger>
);

export const SourcesContent = ({
	className,
	...props
}: ComponentProps<typeof CollapsibleContent>) => (
	<CollapsibleContent
		className={cn(
			"mt-3 flex w-fit flex-col gap-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
			className,
		)}
		{...props}
	/>
);

export const Source = ({
	href,
	title,
	children,
	...props
}: ComponentProps<"a">) => (
	<a
		className="flex cursor-pointer items-start gap-2 text-muted-foreground transition-colors hover:text-foreground"
		href={href}
		rel="noreferrer"
		target="_blank"
		{...props}
	>
		{children ?? (
			<>
				<BookIcon className="mt-0.5 size-3.5 shrink-0" />
				<span className="block font-medium">{title}</span>
			</>
		)}
	</a>
);
