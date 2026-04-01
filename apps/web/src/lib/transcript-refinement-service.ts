import {
	createRefinedSpeakerUtterances,
	MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES,
	type TranscriptUtterance,
} from "@/lib/transcript";
import { isSuspiciousRefinementTranscript } from "@/lib/transcript-guard";
import {
	createTranscriptText,
	replaceTranscriptUtterancesLocally,
} from "@/lib/transcript-session";
import { normalizeTranscriptionLanguage } from "../../../../packages/ai/src/transcription.mjs";

type RefineTranscriptAudioPayload = {
	error?: string;
	text?: string;
};

type RefineSystemAudioTranscriptArgs = {
	blob: Blob;
	chunks?: Array<{
		blob: Blob;
		endedAt: number;
		startedAt: number;
	}>;
	currentUtterances: TranscriptUtterance[];
	endedAt: number;
	language?: string | null;
	startedAt: number;
};

type RefinedSystemAudioTranscript = {
	nextTranscript: string;
	nextUtterances: TranscriptUtterance[];
	refinedUtterances: TranscriptUtterance[];
	targetSpeakers: string[];
	targetUtteranceIds: string[];
};

type RefinementUpload = {
	blob: Blob;
	endedAt: number;
	startedAt: number;
};

const getAudioUploadFilename = (blob: Blob) => {
	if (isWaveBlob(blob)) {
		return "system-audio.wav";
	}

	if (blob.type === "audio/mp4" || blob.type === "audio/m4a") {
		return "system-audio.m4a";
	}

	if (blob.type === "audio/mpeg" || blob.type === "audio/mp3") {
		return "system-audio.mp3";
	}

	if (blob.type === "audio/ogg") {
		return "system-audio.ogg";
	}

	return "system-audio.webm";
};

const isWaveBlob = (blob: Blob) =>
	["audio/wav", "audio/wave", "audio/x-wav"].includes(blob.type);

const createPcm16WaveBlob = ({
	pcmData,
	sampleRate,
}: {
	pcmData: Uint8Array;
	sampleRate: number;
}) => {
	const header = new ArrayBuffer(44);
	const view = new DataView(header);
	const byteRate = sampleRate * 2;

	view.setUint32(0, 0x52494646, false);
	view.setUint32(4, 36 + pcmData.byteLength, true);
	view.setUint32(8, 0x57415645, false);
	view.setUint32(12, 0x666d7420, false);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	view.setUint32(36, 0x64617461, false);
	view.setUint32(40, pcmData.byteLength, true);

	return new Blob([header, pcmData], {
		type: "audio/wav",
	});
};

const splitWaveBlob = async ({
	blob,
	endedAt,
	startedAt,
}: RefinementUpload): Promise<RefinementUpload[]> => {
	const bytes = new Uint8Array(await blob.arrayBuffer());

	if (bytes.byteLength <= 44) {
		return [];
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const sampleRate = view.getUint32(24, true);
	const blockAlign = view.getUint16(32, true);
	const pcmData = bytes.slice(44);
	const maxPcmBytes =
		Math.floor(
			(MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES - 44) / Math.max(blockAlign, 1),
		) * Math.max(blockAlign, 1);

	if (sampleRate <= 0 || maxPcmBytes <= 0 || pcmData.byteLength === 0) {
		return [];
	}

	const totalDurationMs = Math.max(endedAt - startedAt, 1);
	const uploads: RefinementUpload[] = [];

	for (let offset = 0; offset < pcmData.byteLength; offset += maxPcmBytes) {
		const nextOffset = Math.min(offset + maxPcmBytes, pcmData.byteLength);
		uploads.push({
			blob: createPcm16WaveBlob({
				pcmData: pcmData.slice(offset, nextOffset),
				sampleRate,
			}),
			endedAt:
				startedAt +
				Math.round((nextOffset / pcmData.byteLength) * totalDurationMs),
			startedAt:
				startedAt + Math.round((offset / pcmData.byteLength) * totalDurationMs),
		});
	}

	if (uploads.length > 0) {
		uploads[uploads.length - 1] = {
			...uploads[uploads.length - 1],
			endedAt,
		};
	}

	return uploads;
};

const batchRecordedChunks = ({
	blob,
	chunks,
	endedAt,
	startedAt,
}: {
	blob: Blob;
	chunks?: RefineSystemAudioTranscriptArgs["chunks"];
	endedAt: number;
	startedAt: number;
}) => {
	if (!Array.isArray(chunks) || chunks.length === 0) {
		return null;
	}

	const uploads: RefinementUpload[] = [];
	let pending: NonNullable<RefineSystemAudioTranscriptArgs["chunks"]> = [];
	let pendingSize = 0;

	for (const chunk of chunks) {
		if (chunk.blob.size > MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES) {
			return null;
		}

		if (
			pending.length > 0 &&
			pendingSize + chunk.blob.size > MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES
		) {
			uploads.push({
				blob: new Blob(
					pending.map((entry) => entry.blob),
					{
						type: pending[0]?.blob.type || blob.type || "audio/webm",
					},
				),
				endedAt: pending[pending.length - 1]?.endedAt ?? endedAt,
				startedAt: pending[0]?.startedAt ?? startedAt,
			});
			pending = [];
			pendingSize = 0;
		}

		pending.push(chunk);
		pendingSize += chunk.blob.size;
	}

	if (pending.length > 0) {
		uploads.push({
			blob: new Blob(
				pending.map((entry) => entry.blob),
				{
					type: pending[0]?.blob.type || blob.type || "audio/webm",
				},
			),
			endedAt: pending[pending.length - 1]?.endedAt ?? endedAt,
			startedAt: pending[0]?.startedAt ?? startedAt,
		});
	}

	return uploads;
};

const buildRefinementUploads = async ({
	blob,
	chunks,
	endedAt,
	startedAt,
}: {
	blob: Blob;
	chunks?: RefineSystemAudioTranscriptArgs["chunks"];
	endedAt: number;
	startedAt: number;
}) => {
	const chunkBatches = batchRecordedChunks({
		blob,
		chunks,
		endedAt,
		startedAt,
	});

	if (chunkBatches && chunkBatches.length > 0) {
		return chunkBatches;
	}

	if (blob.size <= MAX_TRANSCRIPT_REFINEMENT_AUDIO_BYTES) {
		return [
			{
				blob,
				endedAt,
				startedAt,
			},
		];
	}

	if (isWaveBlob(blob)) {
		return await splitWaveBlob({
			blob,
			endedAt,
			startedAt,
		});
	}

	return [];
};

const refineTranscriptUpload = async ({
	blob,
	language,
}: {
	blob: Blob;
	language?: string | null;
}) => {
	const formData = new FormData();
	formData.append("audio", blob, getAudioUploadFilename(blob));
	const normalizedLanguage = normalizeTranscriptionLanguage(language);
	if (normalizedLanguage) {
		formData.append("lang", normalizedLanguage);
	}

	const response = await fetch("/api/refine-transcript-audio", {
		method: "POST",
		body: formData,
	});
	const payload = (await response
		.json()
		.catch(() => ({}))) as RefineTranscriptAudioPayload;

	if (!response.ok || !payload.text?.trim()) {
		throw new Error(
			payload.error || "Failed to refine system audio transcript.",
		);
	}

	return payload;
};

export const refineSystemAudioTranscript = async ({
	blob,
	chunks,
	currentUtterances,
	endedAt,
	language,
	startedAt,
}: RefineSystemAudioTranscriptArgs): Promise<RefinedSystemAudioTranscript | null> => {
	const systemTrackUtterances = currentUtterances.filter(
		(utterance) =>
			utterance.speaker !== "you" &&
			utterance.startedAt <= endedAt &&
			utterance.endedAt >= startedAt,
	);

	if (blob.size === 0 || systemTrackUtterances.length === 0) {
		return null;
	}

	const uploads = await buildRefinementUploads({
		blob,
		chunks,
		endedAt,
		startedAt,
	});

	if (uploads.length === 0) {
		return null;
	}

	let nextUtterances = currentUtterances;
	const refinedUtterances: TranscriptUtterance[] = [];
	const targetUtteranceIds = new Set<string>();
	for (const upload of uploads) {
		const targetBatchUtterances = nextUtterances.filter(
			(utterance) =>
				utterance.speaker !== "you" &&
				utterance.startedAt <= upload.endedAt &&
				utterance.endedAt >= upload.startedAt,
		);

		if (targetBatchUtterances.length === 0) {
			continue;
		}

		const payload = await refineTranscriptUpload({
			blob: upload.blob,
			language,
		});
		const batchReferenceText = targetBatchUtterances
			.map((utterance) => utterance.text)
			.join(" ");

		if (
			isSuspiciousRefinementTranscript({
				candidateText: payload.text,
				language,
				referenceText: batchReferenceText,
			})
		) {
			continue;
		}
		const batchTargetUtteranceIds = targetBatchUtterances.map(
			(utterance) => utterance.id,
		);
		const batchRefinedUtterances = createRefinedSpeakerUtterances({
			referenceUtterances: targetBatchUtterances,
			refinedText: payload.text,
			speaker: "them",
		});

		nextUtterances = replaceTranscriptUtterancesLocally({
			currentUtterances: nextUtterances,
			nextUtterances: batchRefinedUtterances,
			targetUtteranceIds: batchTargetUtteranceIds,
		});

		for (const utterance of batchRefinedUtterances) {
			refinedUtterances.push(utterance);
		}

		for (const utteranceId of batchTargetUtteranceIds) {
			targetUtteranceIds.add(utteranceId);
		}
	}

	if (refinedUtterances.length === 0) {
		return null;
	}

	return {
		nextTranscript: createTranscriptText(nextUtterances),
		nextUtterances,
		refinedUtterances,
		targetSpeakers: [
			...new Set(
				systemTrackUtterances
					.filter((utterance) => targetUtteranceIds.has(utterance.id))
					.map((utterance) => utterance.speaker),
			),
		],
		targetUtteranceIds: [...targetUtteranceIds],
	};
};
