"use client";

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@workspace/ui/components/command";
import { Kbd } from "@workspace/ui/components/kbd";
import type { LucideIcon } from "lucide-react";

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
			<Command className="**:[[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 **:[[cmdk-input-wrapper]_svg]:size-5 **:[[cmdk-input]]:h-12 **:[[cmdk-item]]:px-2 **:[[cmdk-item]]:py-2 **:[[cmdk-item]_svg]:size-5">
				<div className="relative min-w-0">
					<CommandInput placeholder="Search notes..." className="pr-14" />
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="absolute top-5 right-4 z-10 flex -translate-y-1/2 items-center"
						aria-label="Close search"
					>
						<Kbd className="font-mono text-[10px]">Esc</Kbd>
					</button>
				</div>
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
								<span className="min-w-0 flex-1 truncate">{item.title}</span>
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
