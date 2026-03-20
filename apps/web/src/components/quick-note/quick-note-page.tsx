import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";
import {
	ArrowUp,
	AudioLines,
	Paperclip,
	Plus,
	Search,
	Sparkles,
} from "lucide-react";
import * as React from "react";

export function QuickNotePage() {
	const [message, setMessage] = React.useState("");
	const [isExpanded, setIsExpanded] = React.useState(false);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const resetTextareaHeight = React.useCallback(() => {
		if (!textareaRef.current) {
			return;
		}

		textareaRef.current.style.height = "auto";
	}, []);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();

		if (!message.trim()) {
			return;
		}

		setMessage("");
		setIsExpanded(false);
		resetTextareaHeight();
	};

	const handleTextareaChange = (
		event: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		const nextValue = event.target.value;
		setMessage(nextValue);

		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}

		setIsExpanded(nextValue.length > 100 || nextValue.includes("\n"));
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSubmit(event);
		}
	};

	return (
		<div className="flex flex-1 justify-center px-4 pb-6 md:px-6">
			<div className="flex w-full max-w-5xl flex-1 flex-col pt-2 md:pt-4">
				<div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-end">
					<form onSubmit={handleSubmit} className="group/composer w-full">
						<input
							ref={fileInputRef}
							type="file"
							multiple
							className="sr-only"
							onChange={() => {}}
						/>

						<div
							className={cn(
								"w-full overflow-clip rounded-3xl border border-border bg-card bg-clip-padding p-2.5 shadow-sm transition-[border-radius] duration-200 ease-out",
								isExpanded
									? "grid [grid-template-areas:'header'_'primary'_'footer'] [grid-template-columns:1fr] [grid-template-rows:auto_1fr_auto]"
									: "grid [grid-template-areas:'header_header_header'_'leading_primary_trailing'_'._footer_.'] [grid-template-columns:auto_1fr_auto] [grid-template-rows:auto_1fr_auto]",
							)}
						>
							<div
								className={cn("flex min-h-14 items-center overflow-x-hidden", {
									"-my-2.5 px-1.5": !isExpanded,
									"mb-0 px-2 py-1": isExpanded,
								})}
								style={{ gridArea: "primary" }}
							>
								<div className="max-h-52 flex-1 overflow-auto">
									<Textarea
										ref={textareaRef}
										value={message}
										onChange={handleTextareaChange}
										onKeyDown={handleKeyDown}
										placeholder="Ask anything"
										className="min-h-0 resize-none rounded-none border-0 !bg-transparent p-0 text-base placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 dark:!bg-transparent"
										rows={1}
									/>
								</div>
							</div>

							<div
								className={cn("flex items-center", { hidden: isExpanded })}
								style={{ gridArea: "leading" }}
							>
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="rounded-full text-muted-foreground outline-none ring-0"
											aria-label="Add attachments"
										>
											<Plus className="size-4" />
										</Button>
									</DropdownMenuTrigger>

									<DropdownMenuContent
										align="start"
										className="max-w-xs rounded-2xl p-1.5"
									>
										<DropdownMenuGroup className="space-y-1">
											<DropdownMenuItem
												className="rounded-md"
												onClick={() => fileInputRef.current?.click()}
											>
												<Paperclip size={20} className="opacity-60" />
												Add photos & files
											</DropdownMenuItem>
											<DropdownMenuItem className="rounded-md">
												<Sparkles size={20} className="opacity-60" />
												Agent mode
											</DropdownMenuItem>
											<DropdownMenuItem className="rounded-md">
												<Search size={20} className="opacity-60" />
												Deep research
											</DropdownMenuItem>
										</DropdownMenuGroup>
									</DropdownMenuContent>
								</DropdownMenu>
							</div>

							<div
								className="flex items-center gap-2"
								style={{ gridArea: isExpanded ? "footer" : "trailing" }}
							>
								<div className="ms-auto flex items-center gap-1.5">
									{message.trim() ? (
										<Button
											type="submit"
											variant="default"
											size="icon-sm"
											className="rounded-full"
											aria-label="Send message"
										>
											<ArrowUp className="size-4" />
										</Button>
									) : (
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="rounded-full text-muted-foreground"
											aria-label="Audio visualization"
										>
											<AudioLines className="size-4" />
										</Button>
									)}
								</div>
							</div>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
