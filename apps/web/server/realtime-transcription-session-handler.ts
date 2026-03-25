import type { IncomingMessage, ServerResponse } from "node:http";

const sendJson = (
	response: ServerResponse,
	statusCode: number,
	payload: Record<string, string | number | null>,
) => {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json");
	response.end(JSON.stringify(payload));
};

const readJsonBody = async (request: IncomingMessage) => {
	const chunks: Uint8Array[] = [];

	for await (const chunk of request) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}

	const rawBody = Buffer.concat(chunks).toString("utf8");

	if (!rawBody) {
		return {};
	}

	return JSON.parse(rawBody) as {
		lang?: string;
	};
};

export const handleRealtimeTranscriptionSessionRequest = async (
	request: IncomingMessage,
	response: ServerResponse,
) => {
	if (!process.env.OPENAI_API_KEY) {
		sendJson(response, 500, {
			error: "OPENAI_API_KEY is not configured.",
		});
		return;
	}

	const { lang } = await readJsonBody(request);
	const language = lang?.trim().toLowerCase();

	const sessionResponse = await fetch(
		"https://api.openai.com/v1/realtime/client_secrets",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				expires_after: {
					anchor: "created_at",
					seconds: 600,
				},
				session: {
					type: "transcription",
					audio: {
						input: {
							noise_reduction: {
								type: "near_field",
							},
							turn_detection: {
								type: "server_vad",
								threshold: 0.5,
								prefix_padding_ms: 300,
								silence_duration_ms: 200,
							},
							transcription: {
								model: "gpt-4o-mini-transcribe",
								...(language ? { language } : {}),
							},
						},
					},
				},
			}),
		},
	);

	const payload = (await sessionResponse.json().catch(() => ({}))) as {
		error?: {
			message?: string;
		};
		value?: string;
		expires_at?: number;
		client_secret?: {
			value?: string;
			expires_at?: number;
		};
	};

	if (!sessionResponse.ok) {
		sendJson(response, sessionResponse.status, {
			error:
				payload.error?.message ||
				"Failed to create realtime transcription session.",
		});
		return;
	}

	const clientSecret = payload.value ?? payload.client_secret?.value;
	const expiresAt =
		payload.expires_at ?? payload.client_secret?.expires_at ?? null;

	if (!clientSecret) {
		sendJson(response, 500, {
			error: "OpenAI did not return a client secret.",
		});
		return;
	}

	sendJson(response, 200, {
		clientSecret,
		expiresAt,
	});
};
