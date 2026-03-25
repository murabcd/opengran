type TranscriptionLogLevel = "debug" | "info" | "warn" | "error";

type TranscriptionLoggerContext = {
	sessionId: string;
	scopeKey: string | null;
};

const LOG_LEVELS: Record<TranscriptionLogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

const resolveMinimumLogLevel = (): TranscriptionLogLevel =>
	import.meta.env.DEV ? "debug" : "info";

export type TranscriptionLogger = {
	debug: (event: string, details?: Record<string, unknown>) => void;
	info: (event: string, details?: Record<string, unknown>) => void;
	warn: (event: string, details?: Record<string, unknown>) => void;
	error: (event: string, details?: Record<string, unknown>) => void;
};

export const createTranscriptionLogger = ({
	sessionId,
	scopeKey,
}: TranscriptionLoggerContext): TranscriptionLogger => {
	const minimumLevel = resolveMinimumLogLevel();

	const write = (
		level: TranscriptionLogLevel,
		event: string,
		details?: Record<string, unknown>,
	) => {
		if (LOG_LEVELS[level] < LOG_LEVELS[minimumLevel]) {
			return;
		}

		const payload = {
			event,
			scopeKey,
			sessionId,
			timestamp: new Date().toISOString(),
			...(details ?? {}),
		};

		const method =
			level === "debug"
				? console.debug
				: level === "info"
					? console.info
					: level === "warn"
						? console.warn
						: console.error;

		method("[transcription]", payload);
	};

	return {
		debug: (event, details) => write("debug", event, details),
		info: (event, details) => write("info", event, details),
		warn: (event, details) => write("warn", event, details),
		error: (event, details) => write("error", event, details),
	};
};
