import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES } from "../src/lib/transcript";
import { refineSystemAudioTranscript } from "../src/lib/transcript-refinement-service";

const createWaveBlob = (pcmByteLength: number, sampleRate = 24_000) => {
	const pcmData = new Uint8Array(pcmByteLength);
	const header = new ArrayBuffer(44);
	const view = new DataView(header);
	const byteRate = sampleRate * 2;

	view.setUint32(0, 0x52494646, false);
	view.setUint32(4, 36 + pcmData.byteLength, true);
	view.setUint32(8, 0x57415645, false);
	view.setUint32(12, 0x666d7420, false);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	view.setUint32(36, 0x64617461, false);
	view.setUint32(40, pcmData.byteLength, true);

	return new Blob([header, pcmData], {
		type: "audio/wav",
	});
};

describe("refineSystemAudioTranscript", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("batches recorded media chunks into multiple refinement uploads", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce({
				json: async () => ({
					text: "first refined sentence.",
				}),
				ok: true,
			} as Awaited<ReturnType<typeof fetch>>)
			.mockResolvedValueOnce({
				json: async () => ({
					text: "second refined sentence.",
				}),
				ok: true,
			} as Awaited<ReturnType<typeof fetch>>);

		const result = await refineSystemAudioTranscript({
			blob: new Blob([
				new Uint8Array(MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES + 2_048),
			]),
			chunks: [
				{
					blob: new Blob([
						new Uint8Array(MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES - 1_024),
					]),
					endedAt: 1_000,
					startedAt: 0,
				},
				{
					blob: new Blob([new Uint8Array(2_048)]),
					endedAt: 2_000,
					startedAt: 1_000,
				},
			],
			currentUtterances: [
				{
					endedAt: 900,
					id: "utt-1",
					speaker: "them",
					startedAt: 0,
					text: "old first",
				},
				{
					endedAt: 1_900,
					id: "utt-2",
					speaker: "them",
					startedAt: 1_100,
					text: "old second",
				},
			],
			endedAt: 2_000,
			startedAt: 0,
		});

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const firstRequest = fetchSpy.mock.calls[0]?.[1];
		const secondRequest = fetchSpy.mock.calls[1]?.[1];
		const firstFormData = firstRequest?.body as FormData;
		const secondFormData = secondRequest?.body as FormData;
		expect(firstFormData.get("prompt")).toBeNull();
		expect(secondFormData.get("prompt")).toBeNull();
		expect(result?.targetUtteranceIds).toEqual(["utt-1", "utt-2"]);
		expect(result?.nextTranscript).toContain("first refined sentence.");
		expect(result?.nextTranscript).toContain("second refined sentence.");
	});

	it("splits oversized wav recordings into multiple refinement uploads", async () => {
		const maxPcmBytes =
			Math.floor((MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES - 44) / 2) * 2;
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce({
				json: async () => ({
					text: "wav first half.",
				}),
				ok: true,
			} as Awaited<ReturnType<typeof fetch>>)
			.mockResolvedValueOnce({
				json: async () => ({
					text: "wav second half.",
				}),
				ok: true,
			} as Awaited<ReturnType<typeof fetch>>);

		const result = await refineSystemAudioTranscript({
			blob: createWaveBlob(maxPcmBytes * 2),
			currentUtterances: [
				{
					endedAt: 1_900,
					id: "wav-1",
					speaker: "them",
					startedAt: 0,
					text: "old wav first",
				},
				{
					endedAt: 3_900,
					id: "wav-2",
					speaker: "them",
					startedAt: 2_100,
					text: "old wav second",
				},
			],
			endedAt: 4_000,
			startedAt: 0,
		});

		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const firstRequest = fetchSpy.mock.calls[0]?.[1];
		const secondRequest = fetchSpy.mock.calls[1]?.[1];
		const firstFormData = firstRequest?.body as FormData;
		const secondFormData = secondRequest?.body as FormData;
		const uploadedAudio = firstFormData.get("audio");
		expect(uploadedAudio).toBeInstanceOf(File);
		if (uploadedAudio instanceof File) {
			expect(uploadedAudio.name).toBe("system-audio.wav");
		}
		expect(firstFormData.get("prompt")).toBeNull();
		expect(secondFormData.get("prompt")).toBeNull();
		expect(result?.targetUtteranceIds).toEqual(["wav-1", "wav-2"]);
		expect(result?.nextTranscript).toContain("wav first half.");
		expect(result?.nextTranscript).toContain("wav second half.");
	});

	it("drops suspicious refinement output instead of overwriting the live transcript", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue({
			json: async () => ({
				text: "Transcribe speech verbatim with punctuation. Preserve names, product terms, and domain-specific vocabulary when possible.",
			}),
			ok: true,
		} as Awaited<ReturnType<typeof fetch>>);

		const result = await refineSystemAudioTranscript({
			blob: new Blob([new Uint8Array(2_048)]),
			currentUtterances: [
				{
					endedAt: 900,
					id: "utt-1",
					speaker: "them",
					startedAt: 0,
					text: "Мы обсуждали интеграцию с HeadHunter и сообщения по статусам.",
				},
			],
			endedAt: 1_000,
			language: "ru",
			startedAt: 0,
		});

		expect(result).toBeNull();
	});
});
