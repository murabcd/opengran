import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const files = [
	"src/main.mjs",
	"src/local-server.mjs",
	"src/auth-client.mjs",
	"src/network.mjs",
	"src/runtime-config.mjs",
	"src/env.mjs",
	"src/preload.cjs",
	"scripts/dev.mjs",
	"scripts/dev-bundled.mjs",
	"scripts/build.mjs",
	"scripts/build-system-audio-helper.mjs",
	"scripts/forward-electron-output.mjs",
	"scripts/generate-app-icon.mjs",
	"scripts/generate-tray-icons.mjs",
];

const cwd = fileURLToPath(new URL("..", import.meta.url));

for (const file of files) {
	const result = spawnSync(process.execPath, ["--check", file], {
		cwd,
		stdio: "inherit",
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
