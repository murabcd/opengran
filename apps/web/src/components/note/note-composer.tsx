import { Button } from "@workspace/ui/components/button";
import { Card, CardContent, CardHeader } from "@workspace/ui/components/card";
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
	ChevronUp,
	Copy,
	Paperclip,
	Plus,
} from "lucide-react";
import * as React from "react";
import { SpeechInput } from "../ai-elements/speech-input";

const transcribeRecordedAudio = async (audioBlob: Blob) => {
	const response = await fetch("/api/transcribe", {
		method: "POST",
		headers: {
			"Content-Type": audioBlob.type || "audio/webm",
			"X-Audio-Filename": `speech-input-${Date.now()}.webm`,
		},
		body: audioBlob,
	});

	const payload = (await response.json().catch(() => ({}))) as {
		error?: string;
		text?: string;
	};

	if (!response.ok) {
		throw new Error(payload.error || "Transcription failed.");
	}

	return payload.text?.trim() || "";
};

export function NoteComposer() {
	const [message, setMessage] = React.useState("");
	const [isExpanded, setIsExpanded] = React.useState(false);
	const [isSpeechPanelOpen, setIsSpeechPanelOpen] = React.useState(false);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const resetTextareaHeight = React.useCallback(() => {
		if (!textareaRef.current) {
			return;
		}

		textareaRef.current.style.height = "auto";
	}, []);

	const resizeTextarea = React.useCallback(() => {
		if (!textareaRef.current) {
			return;
		}

		textareaRef.current.style.height = "auto";
		textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
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

		resizeTextarea();

		setIsExpanded(nextValue.length > 100 || nextValue.includes("\n"));
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSubmit(event);
		}
	};

	const hasMessage = message.trim().length > 0;
	const speechControls = (
		<div className="flex items-center gap-2">
			<SpeechInput
				variant="outline"
				size="icon"
				className="shrink-0 rounded-full"
				onAudioRecorded={transcribeRecordedAudio}
				onTranscriptionChange={(text) => {
					setMessage((currentValue) => {
						const nextValue = [currentValue.trim(), text.trim()]
							.filter(Boolean)
							.join(" ")
							.trim();

						setIsExpanded(nextValue.length > 100 || nextValue.includes("\n"));
						return nextValue;
					});

					window.requestAnimationFrame(() => {
						resizeTextarea();
					});
				}}
			/>

			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="shrink-0 rounded-full border-0 bg-transparent shadow-none hover:bg-transparent"
				aria-label="Expand speech controls"
				onClick={() => setIsSpeechPanelOpen((currentValue) => !currentValue)}
			>
				<ChevronUp
					className={cn(
						"size-4 transition-transform duration-200",
						isSpeechPanelOpen && "rotate-180",
					)}
				/>
			</Button>
		</div>
	);

	if (isSpeechPanelOpen) {
		return (
			<div className="relative flex items-end gap-3">
				<Card className="relative -mx-6 min-h-96 w-[calc(100%+3rem)] gap-0 py-0">
					<CardHeader className="flex items-center justify-end px-4 py-4">
						<div className="flex items-center gap-1">
							<Button type="button" variant="ghost" size="icon-sm">
								<Copy className="size-4" />
							</Button>
						</div>
					</CardHeader>

					<CardContent className="flex flex-1 items-center justify-center">
						<p className="text-center text-sm font-medium tracking-tight">
							Transcript paused
						</p>
					</CardContent>

					<div className="px-4 pb-20">
						<div className="rounded-md bg-muted px-3 py-1.5 text-center text-xs text-muted-foreground">
							Always get consent when transcribing others.
						</div>
					</div>
				</Card>

				<div className="absolute bottom-[13px] left-0">{speechControls}</div>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-3">
			{speechControls}

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
						"w-full overflow-clip rounded-xl border border-border bg-card bg-clip-padding p-2.5 shadow-sm [--radius:1rem] transition-colors outline-none has-disabled:bg-input/50 has-disabled:opacity-50 has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 dark:bg-input/30 dark:has-disabled:bg-input/80",
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
						<div className="max-h-52 min-w-0 flex-1 overflow-auto">
							<Textarea
								data-slot="input-group-control"
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
										Add photos or files
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
							{hasMessage ? (
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
									variant="default"
									size="icon-sm"
									className="rounded-full"
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
	);
}
