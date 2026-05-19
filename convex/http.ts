import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import {
	handleApplyTemplateRequest,
	handleChatRequest,
	handleEnhanceNoteRequest,
	handleRealtimeTranscriptionSessionRequest,
} from "./desktopApi";
import { handleJiraWebhookRequest } from "./jiraWebhook";
import { handleNotionOAuthCallbackRequest } from "./notionOAuth";
import { handleZoomOAuthCallbackRequest } from "./zoomOAuth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

http.route({
	path: "/api/chat",
	method: "POST",
	handler: httpAction(async (_ctx, request) => await handleChatRequest(request)),
});

http.route({
	path: "/api/apply-template",
	method: "POST",
	handler: httpAction(
		async (_ctx, request) => await handleApplyTemplateRequest(request),
	),
});

http.route({
	path: "/api/enhance-note",
	method: "POST",
	handler: httpAction(
		async (_ctx, request) => await handleEnhanceNoteRequest(request),
	),
});

http.route({
	path: "/api/realtime-transcription-session",
	method: "POST",
	handler: httpAction(
		async (_ctx, request) =>
			await handleRealtimeTranscriptionSessionRequest(request),
	),
});

http.route({
	path: "/api/webhooks/jira",
	method: "POST",
	handler: httpAction(
		async (ctx, request) => await handleJiraWebhookRequest(ctx, request),
	),
});

http.route({
	path: "/api/oauth/zoom/callback",
	method: "GET",
	handler: httpAction(
		async (ctx, request) => await handleZoomOAuthCallbackRequest(ctx, request),
	),
});

http.route({
	path: "/api/oauth/notion/callback",
	method: "GET",
	handler: httpAction(
		async (ctx, request) => await handleNotionOAuthCallbackRequest(ctx, request),
	),
});

export default http;
