type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord =>
	typeof value === "object" && value !== null;

const parseStructuredJson = (value: unknown) => {
	if (typeof value !== "string") {
		return value;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return value;
	}

	try {
		const parsed = JSON.parse(trimmed) as unknown;
		return isRecord(parsed) || Array.isArray(parsed) ? parsed : value;
	} catch {
		return value;
	}
};

export function normalizeToolPart(part: unknown): unknown {
	if (!isRecord(part)) {
		return part;
	}

	if (
		typeof part.type !== "string" ||
		(!part.type.startsWith("tool-") && part.type !== "dynamic-tool")
	) {
		return part;
	}

	const normalizedInput = parseStructuredJson(part.input);
	const normalizedOutput = parseStructuredJson(part.output);
	const normalizedResult = parseStructuredJson(part.result);

	if (
		normalizedInput === part.input &&
		normalizedOutput === part.output &&
		normalizedResult === part.result
	) {
		return part;
	}

	const normalizedPart: AnyRecord = { ...part };
	if (normalizedInput !== part.input) {
		normalizedPart.input = normalizedInput;
	}

	if (normalizedOutput !== part.output) {
		normalizedPart.output = normalizedOutput;
	}

	if (normalizedResult !== part.result) {
		normalizedPart.result = normalizedResult;
	}

	return normalizedPart;
}
