import { createDesktopNativeAudioStream } from "@/lib/capture/desktop-native-audio";

export const createDesktopSystemAudioStream = async () =>
	await createDesktopNativeAudioStream("systemAudio");
