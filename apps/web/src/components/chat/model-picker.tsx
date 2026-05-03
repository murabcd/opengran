import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Icons } from "@workspace/ui/components/icons";
import { InputGroupButton } from "@workspace/ui/components/input-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import { cn } from "@workspace/ui/lib/utils";
import { chatModels } from "@/lib/ai/models";

export type ChatModel = (typeof chatModels)[number];

type ChatModelPickerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedModel: ChatModel;
	onSelectedModelChange: (model: ChatModel) => void;
	triggerClassName?: string;
	triggerIconClassName?: string;
	modelNameClassName?: string;
	contentClassName?: string;
	menuLabel?: string;
};

export function ChatModelPicker({
	open,
	onOpenChange,
	selectedModel,
	onSelectedModelChange,
	triggerClassName,
	triggerIconClassName,
	modelNameClassName,
	contentClassName,
	menuLabel = "OpenAI",
}: ChatModelPickerProps) {
	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<InputGroupButton
							type="button"
							size="sm"
							className={cn(
								"group rounded-full gap-2 font-normal",
								triggerClassName,
							)}
							aria-label={`Model: ${selectedModel.name}`}
						>
							<Icons.codexLogo
								className={cn(
									"size-3.5 text-muted-foreground transition-colors group-hover:text-foreground group-data-[state=open]:text-foreground",
									triggerIconClassName,
								)}
							/>
							<span className={modelNameClassName}>{selectedModel.name}</span>
						</InputGroupButton>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Select model</TooltipContent>
			</Tooltip>
			<DropdownMenuContent
				side="top"
				align="start"
				className={contentClassName}
			>
				<DropdownMenuGroup className={contentClassName ? undefined : "w-42"}>
					<DropdownMenuLabel className="text-muted-foreground text-xs">
						{menuLabel}
					</DropdownMenuLabel>
					{chatModels.map((model) => (
						<DropdownMenuCheckboxItem
							key={model.id}
							checked={model.id === selectedModel.id}
							onCheckedChange={(checked) => {
								if (checked) {
									onSelectedModelChange(model);
								}
							}}
							className="pl-2 *:[span:first-child]:right-2 *:[span:first-child]:left-auto"
						>
							<span className="inline-flex items-center gap-2">
								<Icons.codexLogo className="size-3.5 text-muted-foreground" />
								{model.name}
							</span>
						</DropdownMenuCheckboxItem>
					))}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
