"use client";

import type { LucideIcon } from "lucide-react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

export interface SearchCommandItem {
	id: string;
	title: string;
	icon: LucideIcon;
}

interface SearchCommandProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: SearchCommandItem[];
	onSelectItem: (itemId: string) => void;
}

export function SearchCommand({
	open,
	onOpenChange,
	items,
	onSelectItem,
}: SearchCommandProps) {
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Search notes"
			description="Search for a note..."
			className="top-1/2 max-w-[calc(100%-2rem)] -translate-y-1/2 rounded-lg sm:max-w-lg"
		>
			<Command className="**:[[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group]]:px-2 **:[[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 **:[[cmdk-input-wrapper]_svg]:h-5 **:[[cmdk-input-wrapper]_svg]:w-5 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-3 **:[[cmdk-item]_svg]:h-5 **:[[cmdk-item]_svg]:w-5">
				<CommandInput placeholder="Search notes..." />
				<CommandList>
					<CommandEmpty>No notes found.</CommandEmpty>
					<CommandGroup>
						{items.map((item) => (
							<CommandItem
								key={item.id}
								value={`${item.id} ${item.title}`}
								onSelect={() => {
									onOpenChange(false);
									onSelectItem(item.id);
								}}
								className="cursor-pointer"
							>
								<item.icon className="size-4" />
								<span>{item.title}</span>
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
