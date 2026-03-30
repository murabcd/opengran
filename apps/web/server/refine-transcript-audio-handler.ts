import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024;

type DiarizedTranscriptSegment = {
	end?: number;
	speaker?: string;
	start?: number;
	text?: string;
};

const sendJson = (
	response: ServerResponse,
	statusCode: number,
	payload: Record<string, unknown>,
) => {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json");
	response.end(JSON.stringify(payload));
};

const createFormDataRequest = (request: IncomingMessage) =>
	new Request("http://127.0.0.1/api/refine-transcript-audio", {
		method: request.method,
		headers: new Headers(
			Object.entries(request.headers).flatMap(([key, value]) => {
				if (value == null) {
					return [];
				}

				return Array.isArray(value)
					? value.map((entry) => [key, entry] as const)
					: ([[key, value]] as const);
			}),
		),
		body:
			request.method === "GET" || request.method === "HEAD"
				? undefined
				: (Readable.toWeb(request) as BodyInit),
		duplex: "half",
	});

export const handleRefineTranscriptAudioRequest = async (
	request: IncomingMessage,
	response: ServerResponse,
) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const formData = await createFormDataRequest(request).formData();
	const audioValue = formData.get("audio");
	const langValue = formData.get("lang");
	const language =
		typeof langValue === "string" && langValue.trim()
			? langValue.trim().toLowerCase()
			: null;

	if (!(audioValue instanceof File)) {
		sendJson(response, 400, {
			error: "Audio file is required.",
		});
		return;
	}

	if (audioValue.size === 0) {
		sendJson(response, 400, {
			error: "Audio file is empty.",
		});
		return;
	}

	if (audioValue.size > MAX_AUDIO_FILE_SIZE_BYTES) {
		sendJson(response, 413, {
			error: "Audio file exceeds the 25 MB transcription limit.",
		});
		return;
	}

	const openAiFormData = new FormData();
	openAiFormData.append(
		"file",
		audioValue,
		audioValue.name || "system-audio.webm",
	);
	openAiFormData.append("model", "gpt-4o-transcribe-diarize");
	openAiFormData.append("response_format", "diarized_json");
	openAiFormData.append("chunking_strategy", "auto");
	if (language) {
		openAiFormData.append("language", language);
	}

	const transcriptionResponse = await fetch(
		"https://api.openai.com/v1/audio/transcriptions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
			},
			body: openAiFormData,
		},
	);
	const payload = (await transcriptionResponse.json().catch(() => ({}))) as {
		error?: {
			message?: string;
		};
		segments?: DiarizedTranscriptSegment[];
		text?: string;
	};

	if (!transcriptionResponse.ok || !payload.text?.trim()) {
		sendJson(
			response,
			transcriptionResponse.ok ? 502 : transcriptionResponse.status,
			{
				error:
					payload.error?.message ||
					"Failed to refine the system audio transcript.",
			},
		);
		return;
	}

	sendJson(response, 200, {
		segments: Array.isArray(payload.segments)
			? payload.segments
					.filter(
						(segment) =>
							typeof segment.speaker === "string" &&
							typeof segment.text === "string" &&
							typeof segment.start === "number" &&
							typeof segment.end === "number",
					)
					.map((segment) => ({
						speaker: segment.speaker,
						text: segment.text?.trim() ?? "",
						start: segment.start,
						end: segment.end,
					}))
			: [],
		text: payload.text.trim(),
	});
};
