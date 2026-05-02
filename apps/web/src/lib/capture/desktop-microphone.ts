import { createDesktopNativeAudioStream } from "@/lib/capture/desktop-native-audio";

export const createDesktopMicrophoneInputStream = async () =>
	await createDesktopNativeAudioStream("microphone");
