"use client";

import { BookIcon, ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => (
	<Collapsible
		className={cn("mt-4 mb-4 text-xs text-muted-foreground", className)}
		{...props}
	/>
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
	count: number;
};

export const SourcesTrigger = ({
	className,
	count,
	children,
	...props
}: SourcesTriggerProps) => (
	<CollapsibleTrigger
		className={cn(
			"flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground",
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

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
	className,
	...props
}: SourcesContentProps) => (
	<CollapsibleContent
		className={cn(
			"mt-3 flex w-fit flex-col gap-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2",
			className,
		)}
		{...props}
	/>
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
	<a
		className="flex items-start gap-2 text-muted-foreground transition-colors hover:text-foreground"
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
