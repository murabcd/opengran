import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { openGranChatPlugin } from "./server/chat-plugin";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const envFileName =
	process.env.OPENGRAN_ENV_MODE?.trim() === "production"
		? ".env"
		: ".env.local";
const envFilePath = path.resolve(workspaceRoot, envFileName);

const parseEnvLine = (line) => {
	const trimmed = line.trim();

	if (!trimmed || trimmed.startsWith("#")) {
		return null;
	}

	const separatorIndex = trimmed.indexOf("=");
	if (separatorIndex === -1) {
		return null;
	}

	const key = trimmed.slice(0, separatorIndex).trim();
	let value = trimmed.slice(separatorIndex + 1).trim();

	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		value = value.slice(1, -1);
	}

	return { key, value };
};

const loadSelectedEnvFile = () => {
	if (!fs.existsSync(envFilePath)) {
		return;
	}

	const rawEnv = fs.readFileSync(envFilePath, "utf8");

	for (const line of rawEnv.split(/\r?\n/)) {
		const entry = parseEnvLine(line);
		if (!entry || process.env[entry.key]) {
			continue;
		}

		process.env[entry.key] = entry.value;
	}
};

// https://vite.dev/config/
export default defineConfig(() => {
	loadSelectedEnvFile();
	process.env.VITE_CONVEX_URL ??= process.env.CONVEX_URL;
	process.env.VITE_CONVEX_SITE_URL ??= process.env.CONVEX_SITE_URL;

	return {
		envDir: workspaceRoot,
		envPrefix: ["VITE_"],
		plugins: [react(), tailwindcss(), openGranChatPlugin()],
		resolve: {
			alias: {
				"@": path.resolve(srcDir),
			},
		},
	};
});
