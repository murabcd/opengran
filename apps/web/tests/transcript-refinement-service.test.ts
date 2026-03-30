import { describe, expect, it, vi } from "vitest";
import { MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES } from "../src/lib/transcript";
import { refineSystemAudioTranscript } from "../src/lib/transcript-refinement-service";

describe("refineSystemAudioTranscript", () => {
	it("skips refinement when the recorded system audio exceeds the upload limit", async () => {
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue({} as Awaited<ReturnType<typeof fetch>>);

		const result = await refineSystemAudioTranscript({
			blob: new Blob([
				new Uint8Array(MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES + 1),
			]),
			currentUtterances: [
				{
					endedAt: 2,
					id: "utt-1",
					speaker: "them",
					startedAt: 1,
					text: "Привет",
				},
			],
			endedAt: 2,
			startedAt: 1,
		});

		expect(result).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();

		fetchSpy.mockRestore();
	});
});
