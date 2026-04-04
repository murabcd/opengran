"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { MicIcon, SquareIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { useEffect } from "react";
import { useTranscriptionControls } from "@/hooks/use-transcription-controls";
import { useTranscriptionSession } from "@/hooks/use-transcription-session";
import type {
	LiveTranscriptState,
	SystemAudioCaptureStatus,
	TranscriptRecoveryStatus,
	TranscriptUtterance,
} from "@/lib/transcript";
import { transcriptionSessionManager } from "@/lib/transcription-session-manager";

type SpeechInputProps = ComponentProps<typeof Button> & {
	autoStartKey?: string | number | null;
	lang?: string;
	onListeningChange?: (isListening: boolean) => void;
	onLiveTranscriptChange?: (state: LiveTranscriptState) => void;
	onRecoveryStatusChange?: (status: TranscriptRecoveryStatus) => void;
	onSystemAudioStatusChange?: (status: SystemAudioCaptureStatus) => void;
	onUtterance?: (utterance: TranscriptUtterance) => void;
	scopeKey?: string | null;
};

const pulseAnimationDelays = ["0s", "0.3s", "0.6s"] as const;

export const SpeechInput = ({
	autoStartKey,
	className,
	lang,
	onListeningChange,
	onLiveTranscriptChange,
	onRecoveryStatusChange,
	onSystemAudioStatusChange,
	onUtterance,
	scopeKey = null,
	...props
}: SpeechInputProps) => {
	const session = useTranscriptionSession();
	const controls = useTranscriptionControls({
		autoStartKey,
		lang,
		scopeKey,
	});

	useEffect(() => {
		onListeningChange?.(session.isListening);
	}, [onListeningChange, session.isListening]);

	useEffect(() => {
		onLiveTranscriptChange?.(session.liveTranscript);
	}, [onLiveTranscriptChange, session.liveTranscript]);

	useEffect(() => {
		onSystemAudioStatusChange?.(session.systemAudioStatus);
	}, [onSystemAudioStatusChange, session.systemAudioStatus]);

	useEffect(() => {
		onRecoveryStatusChange?.(session.recoveryStatus);
	}, [onRecoveryStatusChange, session.recoveryStatus]);

	useEffect(() => {
		if (!onUtterance) {
			return;
		}

		return transcriptionSessionManager.store.subscribeToEvents((event) => {
			if (event.type === "session.utterance_committed") {
				onUtterance(event.utterance);
			}
		});
	}, [onUtterance]);

	return (
		<div className="relative inline-flex items-center justify-center">
			{session.isListening &&
				pulseAnimationDelays.map((delay) => (
					<div
						className="absolute inset-0 animate-ping rounded-full border-2 border-destructive/30"
						key={delay}
						style={{
							animationDelay: delay,
							animationDuration: "2s",
						}}
					/>
				))}

			<Button
				className={cn(
					"relative z-10 rounded-full transition-all duration-300",
					session.isListening || session.isConnecting
						? "!bg-destructive/15 !text-destructive hover:!bg-destructive/20 hover:!text-destructive"
						: "!bg-background !text-foreground hover:!bg-muted hover:!text-foreground",
					!session.isAvailable && "cursor-not-allowed",
					className,
				)}
				aria-disabled={!session.isAvailable}
				onClick={() => {
					if (!session.isAvailable) {
						return;
					}

					if (session.isListening || session.isConnecting) {
						void controls.stop();
						return;
					}

					void controls.start();
				}}
				{...props}
			>
				{session.isListening || session.isConnecting ? (
					<SquareIcon className="size-4 text-current" />
				) : (
					<MicIcon className="size-4 text-current" />
				)}
			</Button>
		</div>
	);
};
