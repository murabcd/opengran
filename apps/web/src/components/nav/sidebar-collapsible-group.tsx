import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@workspace/ui/components/collapsible";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "@workspace/ui/components/sidebar";
import { cn } from "@workspace/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import * as React from "react";

export function SidebarCollapsibleGroup({
	children,
	className,
	contentClassName,
	defaultOpen = true,
	labelClassName,
	title,
}: {
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
	defaultOpen?: boolean;
	labelClassName?: string;
	title: string;
}) {
	const [open, setOpen] = React.useState(defaultOpen);
	const contentId = React.useId();

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<SidebarGroup className={className}>
				<SidebarGroupLabel asChild>
					<CollapsibleTrigger
						aria-controls={contentId}
						className={cn(
							"group/label w-full cursor-pointer justify-start gap-1.5 px-2 text-sidebar-foreground/60 [&>svg]:!size-3",
							labelClassName,
						)}
					>
						<span>{title}</span>
						<ChevronRight
							className={cn(
								"mt-px shrink-0 opacity-0 transition-[opacity,transform] group-hover/label:opacity-100 group-focus-visible/label:opacity-100",
								open ? "rotate-90" : undefined,
							)}
						/>
					</CollapsibleTrigger>
				</SidebarGroupLabel>
				<CollapsibleContent id={contentId}>
					<SidebarGroupContent className={contentClassName}>
						{children}
					</SidebarGroupContent>
				</CollapsibleContent>
			</SidebarGroup>
		</Collapsible>
	);
}
