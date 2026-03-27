import { spawn } from "node:child_process";
import { chmod, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutDir = resolve(packageRoot, ".generated", "system-audio");
const outDirFlagIndex = process.argv.indexOf("--out-dir");
const outDir =
	outDirFlagIndex >= 0 && process.argv[outDirFlagIndex + 1]
		? resolve(process.argv[outDirFlagIndex + 1])
		: defaultOutDir;
const helpers = [
	{
		outputFile: resolve(outDir, "opengran-system-audio-helper"),
		sourceFile: resolve(packageRoot, "native", "SystemAudioCaptureCLI.swift"),
	},
	{
		outputFile: resolve(outDir, "opengran-microphone-helper"),
		sourceFile: resolve(packageRoot, "native", "MicrophoneCaptureCLI.swift"),
	},
];

const run = (cmd, args) =>
	new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(cmd, args, {
			cwd: packageRoot,
			stdio: "inherit",
		});

		child.on("error", rejectPromise);
		child.on("exit", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}

			rejectPromise(
				new Error(`${cmd} ${args.join(" ")} exited with code ${code ?? -1}.`),
			);
		});
	});

if (process.platform !== "darwin") {
	await rm(outDir, { recursive: true, force: true });
	process.exit(0);
}

await mkdir(outDir, { recursive: true });

for (const { outputFile, sourceFile } of helpers) {
	await run("swiftc", [
		"-O",
		"-parse-as-library",
		"-o",
		outputFile,
		sourceFile,
	]);
	await chmod(outputFile, 0o755);
}
