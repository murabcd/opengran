import { ArrowUp, AtSign, Globe } from "lucide-react";
import * as React from "react";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";

export function ChatPage() {
	const [draft, setDraft] = React.useState("");
	const [sourcesOpen, setSourcesOpen] = React.useState(false);
	const [webSearchEnabled, setWebSearchEnabled] = React.useState(false);
	const [appsEnabled, setAppsEnabled] = React.useState(true);
	const [allSourcesEnabled, setAllSourcesEnabled] = React.useState(true);

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-col gap-6 pt-2 md:pt-4">
				<div className="mx-auto w-full max-w-4xl">
					<h1 className="text-lg md:text-xl">Ask anything</h1>
				</div>
				<form
					className="mx-auto w-full max-w-4xl"
					onSubmit={(event) => {
						event.preventDefault();
					}}
				>
					<label htmlFor="chat-prompt" className="sr-only">
						Prompt
					</label>
					<InputGroup className="min-h-[308px] rounded-[2rem] border-border bg-card px-0 py-0 shadow-sm [--radius:1.2rem]">
						<InputGroupAddon align="block-start" className="px-5 pt-5 pb-0">
							<InputGroupButton
								variant="outline"
								size="icon-sm"
								className="rounded-full transition-transform"
							>
								<AtSign />
								<span className="sr-only">Mention a page</span>
							</InputGroupButton>
						</InputGroupAddon>

						<InputGroupTextarea
							id="chat-prompt"
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Ask, search, or make anything..."
							className="min-h-[176px] px-5 pt-2"
						/>

						<InputGroupAddon
							align="block-end"
							className="items-center gap-1 px-5 pb-5 pt-0"
						>
							<InputGroupButton size="sm" className="rounded-full">
								Auto
							</InputGroupButton>
							<DropdownMenu open={sourcesOpen} onOpenChange={setSourcesOpen}>
								<DropdownMenuTrigger asChild>
									<InputGroupButton size="sm" className="rounded-full">
										<Globe />
										Sources
									</InputGroupButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									side="top"
									align="start"
									className="min-w-72"
								>
									<DropdownMenuGroup>
										<DropdownMenuItem
											onSelect={(event) => event.preventDefault()}
										>
											<Globe />
											Web search
											<Switch
												className="ml-auto"
												checked={webSearchEnabled}
												onCheckedChange={setWebSearchEnabled}
											/>
										</DropdownMenuItem>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										<DropdownMenuItem
											onSelect={(event) => event.preventDefault()}
										>
											<Globe />
											Apps and integrations
											<Switch
												className="ml-auto"
												checked={appsEnabled}
												onCheckedChange={setAppsEnabled}
											/>
										</DropdownMenuItem>
										<DropdownMenuCheckboxItem
											checked={allSourcesEnabled}
											onCheckedChange={(checked) => {
												setAllSourcesEnabled(Boolean(checked));
											}}
										>
											All sources I can access
										</DropdownMenuCheckboxItem>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuGroup>
										<DropdownMenuLabel>
											We&apos;ll only search in the sources selected here.
										</DropdownMenuLabel>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
							<InputGroupButton
								aria-label="Send"
								className="ml-auto rounded-full"
								variant="default"
								size="icon-sm"
								disabled={!draft.trim()}
							>
								<ArrowUp />
							</InputGroupButton>
						</InputGroupAddon>
					</InputGroup>
				</form>
			</div>
		</div>
	);
}
