import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { handleChatRequest } from "./chat-handler";

const isChatRoute = (url: string | undefined) =>
	Boolean(url && url.split("?")[0] === "/api/chat");

const createChatMiddleware = (): Connect.NextHandleFunction => {
	return (request, response, next) => {
		if (!isChatRoute(request.url)) {
			next();
			return;
		}

		if (request.method !== "POST") {
			response.statusCode = 405;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ error: "Method not allowed." }));
			return;
		}

		void handleChatRequest(
			request as IncomingMessage,
			response as ServerResponse,
		).catch((error: unknown) => {
			const message =
				error instanceof Error ? error.message : "Unexpected server error.";
			response.statusCode = 500;
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ error: message }));
		});
	};
};

export const openMeetChatPlugin = (): Plugin => {
	const middleware = createChatMiddleware();

	return {
		name: "openmeet-chat-api",
		configureServer(server) {
			server.middlewares.use(middleware);
		},
		configurePreviewServer(server) {
			server.middlewares.use(middleware);
		},
	};
};
