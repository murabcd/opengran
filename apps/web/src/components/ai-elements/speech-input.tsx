"use client";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { MicIcon, SquareIcon } from "lucide-react";
import type { ComponentProps } from "react";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

type SpeechInputProps = ComponentProps<typeof Button> & {
	onTranscriptionChange?: (text: string) => void;
	onTranscriptChange?: (text: string) => void;
	onListeningChange?: (isListening: boolean) => void;
	autoStartKey?: string | number | null;
	lang?: string;
};

type RealtimeSessionPayload = {
	clientSecret: string;
	expiresAt?: number | null;
};

type RealtimeTranscriptionEvent =
	| {
			type: "conversation.item.input_audio_transcription.completed";
			transcript?: string;
			text?: string;
	  }
	| {
			type: "conversation.item.input_audio_transcription.delta";
			delta?: string;
	  }
	| {
			type: "error";
			error?: {
				message?: string;
			};
	  };

const createRealtimeSession = async (
	lang?: string,
): Promise<RealtimeSessionPayload> => {
	const language = lang?.split("-")[0]?.trim();

	const response = await fetch("/api/realtime-transcription-session", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(language ? { lang: language } : {}),
	});

	const payload = (await response.json().catch(() => ({}))) as {
		clientSecret?: string;
		error?: string;
		expiresAt?: number | null;
	};

	if (!response.ok || !payload.clientSecret) {
		throw new Error(payload.error || "Failed to create transcription session.");
	}

	return {
		clientSecret: payload.clientSecret,
		expiresAt: payload.expiresAt,
	};
};

const appendText = (
	nextValue: string | undefined,
	onTranscriptionChange?: (text: string) => void,
) => {
	const trimmed = nextValue?.trim();

	if (!trimmed) {
		return;
	}

	onTranscriptionChange?.(trimmed);
};

const pulseAnimationDelays = ["0s", "0.3s", "0.6s"] as const;

const subscribeToAvailability = () => () => {};

const getRealtimeAvailability = () =>
	typeof window !== "undefined" &&
	typeof RTCPeerConnection !== "undefined" &&
	Boolean(navigator.mediaDevices?.getUserMedia);

const useRealtimeAvailability = () =>
	useSyncExternalStore(
		subscribeToAvailability,
		getRealtimeAvailability,
		() => false,
	);

export const SpeechInput = ({
	className,
	onTranscriptionChange,
	onTranscriptChange,
	onListeningChange,
	autoStartKey,
	lang,
	...props
}: SpeechInputProps) => {
	const [isListening, setIsListening] = useState(false);
	const [isConnecting, setIsConnecting] = useState(false);
	const isAvailable = useRealtimeAvailability();
	const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
	const dataChannelRef = useRef<RTCDataChannel | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const sessionNonceRef = useRef(0);
	const onTranscriptionChangeRef = useRef<
		SpeechInputProps["onTranscriptionChange"]
	>(onTranscriptionChange);
	const onTranscriptChangeRef =
		useRef<SpeechInputProps["onTranscriptChange"]>(onTranscriptChange);
	const onListeningChangeRef =
		useRef<SpeechInputProps["onListeningChange"]>(onListeningChange);
	const partialTranscriptRef = useRef("");
	const lastAutoStartKeyRef = useRef<string | number | null>(null);

	onTranscriptionChangeRef.current = onTranscriptionChange;
	onTranscriptChangeRef.current = onTranscriptChange;
	onListeningChangeRef.current = onListeningChange;

	const stopListening = useCallback(() => {
		sessionNonceRef.current += 1;

		appendText(partialTranscriptRef.current, onTranscriptionChangeRef.current);

		dataChannelRef.current?.close();
		dataChannelRef.current = null;

		peerConnectionRef.current?.close();
		peerConnectionRef.current = null;

		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) {
				track.stop();
			}
			streamRef.current = null;
		}

		partialTranscriptRef.current = "";
		onTranscriptChangeRef.current?.("");
		setIsListening(false);
		setIsConnecting(false);
		onListeningChangeRef.current?.(false);
	}, []);

	useEffect(() => stopListening, [stopListening]);

	const startListening = useCallback(async () => {
		const sessionNonce = sessionNonceRef.current + 1;
		sessionNonceRef.current = sessionNonce;
		setIsConnecting(true);

		try {
			const [{ clientSecret }, stream] = await Promise.all([
				createRealtimeSession(lang),
				navigator.mediaDevices.getUserMedia({
					audio: {
						channelCount: 1,
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
					},
				}),
			]);

			streamRef.current = stream;

			const peerConnection = new RTCPeerConnection();
			peerConnectionRef.current = peerConnection;

			for (const track of stream.getTracks()) {
				peerConnection.addTrack(track, stream);
			}

			const dataChannel = peerConnection.createDataChannel("oai-events");
			dataChannelRef.current = dataChannel;

			dataChannel.addEventListener("message", (event) => {
				try {
					const realtimeEvent = JSON.parse(
						String(event.data),
					) as RealtimeTranscriptionEvent;

					if (
						realtimeEvent.type ===
						"conversation.item.input_audio_transcription.delta"
					) {
						if (realtimeEvent.delta) {
							partialTranscriptRef.current += realtimeEvent.delta;
							onTranscriptChangeRef.current?.(partialTranscriptRef.current);
						}
						return;
					}

					if (
						realtimeEvent.type ===
						"conversation.item.input_audio_transcription.completed"
					) {
						appendText(
							realtimeEvent.transcript ??
								realtimeEvent.text ??
								partialTranscriptRef.current,
							onTranscriptionChangeRef.current,
						);
						partialTranscriptRef.current = "";
						onTranscriptChangeRef.current?.("");
						return;
					}

					if (realtimeEvent.type === "error") {
						console.error(
							"Realtime transcription error",
							realtimeEvent.error?.message ?? realtimeEvent,
						);
						stopListening();
					}
				} catch (error) {
					console.error("Failed to parse realtime transcription event", error);
				}
			});

			peerConnection.addEventListener("connectionstatechange", () => {
				if (
					peerConnection.connectionState === "failed" ||
					peerConnection.connectionState === "closed" ||
					peerConnection.connectionState === "disconnected"
				) {
					stopListening();
				}
			});

			const offer = await peerConnection.createOffer();
			await peerConnection.setLocalDescription(offer);

			const response = await fetch("https://api.openai.com/v1/realtime/calls", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${clientSecret}`,
					"Content-Type": "application/sdp",
				},
				body: offer.sdp,
			});

			if (!response.ok) {
				throw new Error("Failed to connect realtime transcription.");
			}

			const answerSdp = await response.text();

			if (sessionNonceRef.current !== sessionNonce) {
				return;
			}

			await peerConnection.setRemoteDescription({
				type: "answer",
				sdp: answerSdp,
			});

			setIsListening(true);
			onListeningChangeRef.current?.(true);
		} catch (error) {
			console.error("Failed to start realtime transcription", error);
			if (sessionNonceRef.current === sessionNonce) {
				stopListening();
			}
		} finally {
			if (sessionNonceRef.current === sessionNonce) {
				setIsConnecting(false);
			}
		}
	}, [lang, stopListening]);

	const toggleListening = useCallback(() => {
		if (isListening || isConnecting) {
			stopListening();
			return;
		}

		void startListening();
	}, [isConnecting, isListening, startListening, stopListening]);

	useEffect(() => {
		if (autoStartKey == null || !isAvailable) {
			return;
		}

		if (lastAutoStartKeyRef.current === autoStartKey) {
			return;
		}

		lastAutoStartKeyRef.current = autoStartKey;

		if (isListening || isConnecting) {
			return;
		}

		void startListening();
	}, [autoStartKey, isAvailable, isConnecting, isListening, startListening]);

	const isUnavailable = !isAvailable;

	return (
		<div className="relative inline-flex items-center justify-center">
			{isListening &&
				pulseAnimationDelays.map((delay) => (
					<div
						className="absolute inset-0 animate-ping rounded-full border-2 border-red-400/30"
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
					isListening || isConnecting
						? "!bg-destructive !text-white hover:!bg-destructive/80 hover:!text-white"
						: "!bg-background !text-foreground hover:!bg-muted hover:!text-foreground",
					isUnavailable && "cursor-not-allowed",
					className,
				)}
				aria-disabled={isUnavailable}
				onClick={() => {
					if (isUnavailable) {
						return;
					}
					toggleListening();
				}}
				{...props}
			>
				{isListening || isConnecting ? (
					<SquareIcon className="size-4 text-current" />
				) : (
					<MicIcon className="size-4 text-current" />
				)}
			</Button>
		</div>
	);
};
