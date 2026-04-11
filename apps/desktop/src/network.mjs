const transientNetworkErrorCodes = new Set([
	"ECONNRESET",
	"ECONNREFUSED",
	"EAI_AGAIN",
	"ENETDOWN",
	"ENETRESET",
	"ENETUNREACH",
	"ENOTFOUND",
	"EHOSTDOWN",
	"EHOSTUNREACH",
	"ETIMEDOUT",
]);

const wait = (durationMs) =>
	new Promise((resolvePromise) => {
		setTimeout(resolvePromise, durationMs);
	});

const getNestedErrorCode = (value) => {
	if (!value || typeof value !== "object") {
		return null;
	}

	if (
		"code" in value &&
		typeof value.code === "string" &&
		value.code.length > 0
	) {
		return value.code;
	}

	if ("cause" in value) {
		return getNestedErrorCode(value.cause);
	}

	return null;
};

export const getErrorCode = (error) => getNestedErrorCode(error);

export const isTransientNetworkError = (error) => {
	const code = getErrorCode(error);
	return code ? transientNetworkErrorCodes.has(code) : false;
};

export const toErrorLogDetails = (error) => {
	const message = error instanceof Error ? error.message : String(error);
	const code = getErrorCode(error);

	return code ? { code, message } : { message };
};

export const fetchWithRetry = async (
	input,
	init,
	{ retryDelayMs = [0, 300, 1_000] } = {},
) => {
	let lastError = null;

	for (const delayMs of retryDelayMs) {
		if (delayMs > 0) {
			await wait(delayMs);
		}

		try {
			return await fetch(input, init);
		} catch (error) {
			lastError = error;

			if (!isTransientNetworkError(error) || delayMs === retryDelayMs.at(-1)) {
				throw error;
			}
		}
	}

	throw lastError ?? new Error("Request failed.");
};
