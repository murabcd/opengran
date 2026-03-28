import { existsSync, watch } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(runtimeDir, "..");
const distDir = resolve(appDir, "dist");
const watchMode = process.argv.includes("--watch");

const buildOnce = async () => {
	await mkdir(resolve(distDir, "icons"), { recursive: true });
	const buildResult = await Bun.build({
		entrypoints: [resolve(appDir, "src/background.js")],
		outdir: distDir,
		target: "browser",
		format: "esm",
		minify: false,
	});

	if (!buildResult.success) {
		for (const message of buildResult.logs) {
			console.error(message);
		}

		throw new Error("Failed to build OpenGran extension");
	}

	await copyFile(
		resolve(appDir, "manifest.json"),
		resolve(distDir, "manifest.json"),
	);

	const iconSource = resolve(appDir, "../desktop/src/assets/OpenGranDock.png");
	if (existsSync(iconSource)) {
		await copyFile(iconSource, resolve(distDir, "icons/opengran.png"));
	}
};

await buildOnce();

if (watchMode) {
	const srcDir = resolve(appDir, "src");
	const manifestPath = resolve(appDir, "manifest.json");
	console.log("[extension] watching for changes...");

	let rebuildTimeoutId = null;
	const scheduleRebuild = () => {
		if (rebuildTimeoutId !== null) {
			clearTimeout(rebuildTimeoutId);
		}

		rebuildTimeoutId = setTimeout(async () => {
			rebuildTimeoutId = null;
			await buildOnce();
			console.log("[extension] rebuilt");
		}, 75);
	};

	watch(srcDir, { recursive: true }, scheduleRebuild);
	watch(manifestPath, scheduleRebuild);
	await new Promise(() => {});
}
