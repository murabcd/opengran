import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import {
	handleApplyTemplateRequest,
	handleChatRequest,
	handleEnhanceNoteRequest,
	handleRealtimeTranscriptionSessionRequest,
	handleRefineTranscriptAudioRequest,
} from "./desktopApi";

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
	path: "/api/refine-transcript-audio",
	method: "POST",
	handler: httpAction(
		async (_ctx, request) => await handleRefineTranscriptAudioRequest(request),
	),
});

export default http;
