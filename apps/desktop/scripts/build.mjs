import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./build-system-audio-helper.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(packageRoot, "src");
const distDir = resolve(packageRoot, "dist");
const webDistDir = resolve(packageRoot, "../web/dist");

if (!existsSync(resolve(webDistDir, "index.html"))) {
	throw new Error(
		"Web build output is missing. Run `bun run build --filter=web` before building the desktop shell.",
	);
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const file of ["env.mjs", "local-server.mjs", "main.mjs", "preload.cjs"]) {
	await cp(resolve(sourceDir, file), resolve(distDir, file));
}

if (process.platform === "darwin") {
	await mkdir(resolve(distDir, "bin"), { recursive: true });
	await cp(
		resolve(
			packageRoot,
			".generated",
			"system-audio",
			"opengran-system-audio-helper",
		),
		resolve(distDir, "bin", "opengran-system-audio-helper"),
	);
}
