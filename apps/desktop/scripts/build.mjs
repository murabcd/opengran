import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./build-system-audio-helper.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(packageRoot, "src");
const distDir = resolve(packageRoot, "dist");
const webDistDir = resolve(packageRoot, "../web/dist");
const bundleRootDir = resolve(packageRoot, ".bundle-root");
const bundleDesktopDistDir = resolve(bundleRootDir, "apps", "desktop", "dist");
const bundleWebDistDir = resolve(bundleRootDir, "apps", "web", "dist");
const bundleConvexGeneratedDir = resolve(bundleRootDir, "convex", "_generated");
const bundlePromptsDir = resolve(bundleRootDir, "packages", "ai", "src");
const desktopAssetsDir = resolve(sourceDir, "assets");

if (!existsSync(resolve(webDistDir, "index.html"))) {
	throw new Error(
		"Web build output is missing. Run `bun run build --filter=web` before building the desktop shell.",
	);
}

await rm(distDir, { recursive: true, force: true });
await rm(bundleRootDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const file of [
	"auth-client.mjs",
	"env.mjs",
	"local-server.mjs",
	"main.mjs",
	"preload.cjs",
	"runtime-config.mjs",
]) {
	await cp(resolve(sourceDir, file), resolve(distDir, file));
}

await cp(desktopAssetsDir, resolve(distDir, "assets"), { recursive: true });

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

await mkdir(bundleDesktopDistDir, { recursive: true });
await mkdir(bundleWebDistDir, { recursive: true });
await mkdir(bundleConvexGeneratedDir, { recursive: true });
await mkdir(bundlePromptsDir, { recursive: true });

await cp(distDir, bundleDesktopDistDir, { recursive: true });
await cp(webDistDir, bundleWebDistDir, { recursive: true });
await cp(
	resolve(packageRoot, "../../convex/_generated/api.js"),
	resolve(bundleConvexGeneratedDir, "api.js"),
);
await cp(
	resolve(packageRoot, "../../packages/ai/src/prompts.mjs"),
	resolve(bundlePromptsDir, "prompts.mjs"),
);
