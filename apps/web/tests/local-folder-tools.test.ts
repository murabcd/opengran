import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLocalFolderTools } from "../../../packages/ai/src/local-folder-tools.mjs";

describe("local folder tools", () => {
	it("exposes a sandboxed local audio transcription tool", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opengran-local-tools-"));
		try {
			const filePath = join(directory, "notes.txt");
			await writeFile(filePath, "not audio");

			const tools = buildLocalFolderTools([
				{
					name: "shared",
					path: directory,
				},
			]);

			expect(Object.keys(tools)).toContain("transcribe_local_audio");
			await expect(
				tools.transcribe_local_audio.execute?.(
					{
						rootIndex: 0,
						relativePath: "notes.txt",
					},
					{
						messages: [],
						toolCallId: "test",
					},
				),
			).rejects.toThrow(
				"Only supported audio or video files can be transcribed",
			);
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});

	it("rejects local audio files that exceed the direct transcription size cap", async () => {
		const directory = await mkdtemp(join(tmpdir(), "opengran-local-tools-"));
		try {
			const filePath = join(directory, "large.m4a");
			await writeFile(filePath, "");
			await truncate(filePath, 25_000_001);

			const tools = buildLocalFolderTools([
				{
					name: "shared",
					path: directory,
				},
			]);

			await expect(
				tools.transcribe_local_audio.execute?.(
					{
						rootIndex: 0,
						relativePath: "large.m4a",
					},
					{
						messages: [],
						toolCallId: "test",
					},
				),
			).rejects.toThrow("Audio file is too large to transcribe directly");
		} finally {
			await rm(directory, { force: true, recursive: true });
		}
	});
});
