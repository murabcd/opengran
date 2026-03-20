import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { openMeetChatPlugin } from "./server/chat-plugin";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss(), openMeetChatPlugin()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
