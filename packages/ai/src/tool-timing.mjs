const isRecord = (value) =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const withToolTiming = async (operation) => {
	const startedAt = Date.now();
	const result = await operation();
	const durationMs = Date.now() - startedAt;

	if (!isRecord(result)) {
		return result;
	}

	return {
		...result,
		durationMs,
		totalDurationMs:
			typeof result.totalDurationMs === "number"
				? result.totalDurationMs
				: durationMs,
	};
};
