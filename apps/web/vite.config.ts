import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { openGranChatPlugin } from "./server/chat-plugin";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	Object.assign(process.env, loadEnv(mode, workspaceRoot, ""));

	return {
		envDir: workspaceRoot,
		envPrefix: ["VITE_", "CONVEX_"],
		plugins: [react(), tailwindcss(), openGranChatPlugin()],
		resolve: {
			alias: {
				"@": path.resolve(srcDir),
			},
		},
	};
});
