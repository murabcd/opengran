export const formatElapsedTime = (ms: number) => {
	if (!Number.isFinite(ms) || ms <= 0) {
		return "";
	}

	if (ms < 1000) {
		return `${Math.max(1, Math.round(ms))}ms`;
	}

	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	return remainingSeconds === 0
		? `${minutes}m`
		: `${minutes}m ${remainingSeconds}s`;
};

export const getToolStartedAt = (part: {
	callProviderMetadata?: { custom?: { startedAt?: unknown } };
	startedAt?: unknown;
}) => {
	const metadataStartedAt = part.callProviderMetadata?.custom?.startedAt;
	if (typeof metadataStartedAt === "number") {
		return metadataStartedAt;
	}

	if (typeof part.startedAt === "number") {
		return part.startedAt;
	}

	return null;
};

export const getToolDurationMs = (part: {
	output?: Record<string, unknown>;
	result?: Record<string, unknown>;
}) => {
	const output = part.output ?? part.result;
	const duration =
		output?.totalDurationMs ?? output?.durationMs ?? output?.duration_ms;

	return typeof duration === "number" ? duration : null;
};

export const formatToolPayload = (value: unknown) => {
	if (value === undefined || value === null || value === "") {
		return "";
	}

	if (typeof value === "string") {
		return value;
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
};
