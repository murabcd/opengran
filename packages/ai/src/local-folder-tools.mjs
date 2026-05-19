import { execFile } from "node:child_process";
import {
	access,
	mkdtemp,
	readdir,
	readFile,
	realpath,
	rm,
	stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { experimental_transcribe as transcribe, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { createBashTool } from "bash-tool";
import { z } from "zod";
import { TRANSCRIPTION_MODEL } from "./transcription.mjs";

export { extractTextFromUIMessage } from "./local-path-references.mjs";

const MAX_ROOTS = 4;
const MAX_DIRECTORY_ENTRIES = 200;
const MAX_WALK_FILES = 1000;
const MAX_FILE_BYTES = 120_000;
const MAX_SEARCH_MATCHES = 40;
const MAX_SEARCH_FILE_BYTES = 250_000;
const MAX_BASH_SNAPSHOT_FILES = 500;
const MAX_BASH_SNAPSHOT_FILE_BYTES = 250_000;
const MAX_BASH_SNAPSHOT_BYTES = 3_000_000;
const MAX_BASH_OUTPUT_LENGTH = 20_000;
const MAX_TRANSCRIPTION_SOURCE_BYTES = 250_000_000;
const MAX_TRANSCRIPTION_CHUNK_BYTES = 25_000_000;
const MAX_TRANSCRIPTION_SECONDS = 1_380;
const TRANSCRIPTION_CHUNK_SECONDS = 1_200;
const MAX_TRANSCRIPTION_PROMPT_LENGTH = 1_000;
const transcriptionCache = new Map();
const bashToolCache = new Map();
const execFileAsync = promisify(execFile);
const aiRuntimeDir = dirname(fileURLToPath(import.meta.url));
const IGNORED_DIRECTORY_NAMES = new Set([
	".cache",
	".git",
	".next",
	".turbo",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"out",
	"target",
]);
const TEXT_FILE_EXTENSIONS = new Set([
	".c",
	".cc",
	".conf",
	".cpp",
	".cs",
	".css",
	".csv",
	".go",
	".h",
	".hpp",
	".html",
	".java",
	".js",
	".json",
	".jsx",
	".kt",
	".log",
	".md",
	".mdx",
	".mjs",
	".py",
	".rb",
	".rs",
	".sh",
	".sql",
	".swift",
	".toml",
	".ts",
	".tsx",
	".txt",
	".xml",
	".yaml",
	".yml",
]);
const LOCAL_TRANSCRIPTION_EXTENSIONS = new Set([
	".m4a",
	".mov",
	".mp3",
	".mp4",
	".mpeg",
	".mpga",
	".wav",
	".webm",
]);
const TRANSCRIPTION_MEDIA_TYPES = {
	".m4a": "audio/mp4",
	".mov": "video/quicktime",
	".mp3": "audio/mpeg",
	".mp4": "video/mp4",
	".mpeg": "audio/mpeg",
	".mpga": "audio/mpeg",
	".wav": "audio/wav",
	".webm": "audio/webm",
};
const VIDEO_TRANSCRIPTION_EXTENSIONS = new Set([".mov", ".mp4"]);
const MEDIA_TOOL_CANDIDATES = {
	ffmpeg: [
		process.env.OPENGRAN_FFMPEG_PATH,
		process.env.OPENGRAN_MEDIA_TOOLS_DIR
			? resolve(process.env.OPENGRAN_MEDIA_TOOLS_DIR, "ffmpeg")
			: null,
		process.resourcesPath
			? resolve(
					process.resourcesPath,
					"app.asar.unpacked",
					".bundle-root",
					"apps",
					"desktop",
					"dist",
					"bin",
					"ffmpeg",
				)
			: null,
		resolve(
			aiRuntimeDir,
			"..",
			"..",
			"..",
			"apps",
			"desktop",
			"dist",
			"bin",
			"ffmpeg",
		),
		"ffmpeg",
		"/opt/homebrew/bin/ffmpeg",
		"/usr/local/bin/ffmpeg",
		"/usr/bin/ffmpeg",
	].filter(Boolean),
	ffprobe: [
		process.env.OPENGRAN_FFPROBE_PATH,
		process.env.OPENGRAN_MEDIA_TOOLS_DIR
			? resolve(process.env.OPENGRAN_MEDIA_TOOLS_DIR, "ffprobe")
			: null,
		process.resourcesPath
			? resolve(
					process.resourcesPath,
					"app.asar.unpacked",
					".bundle-root",
					"apps",
					"desktop",
					"dist",
					"bin",
					"ffprobe",
				)
			: null,
		resolve(
			aiRuntimeDir,
			"..",
			"..",
			"..",
			"apps",
			"desktop",
			"dist",
			"bin",
			"ffprobe",
		),
		"ffprobe",
		"/opt/homebrew/bin/ffprobe",
		"/usr/local/bin/ffprobe",
		"/usr/bin/ffprobe",
	].filter(Boolean),
};

const isIgnoredDirectory = (name) => IGNORED_DIRECTORY_NAMES.has(name);

const getExtension = (path) => {
	const name = basename(path);
	const index = name.lastIndexOf(".");
	return index >= 0 ? name.slice(index).toLowerCase() : "";
};

const isProbablyTextFile = (path) => {
	const name = basename(path).toLowerCase();
	return (
		TEXT_FILE_EXTENSIONS.has(getExtension(path)) ||
		name === "makefile" ||
		name === "dockerfile" ||
		name === "license"
	);
};

const isSupportedTranscriptionFile = (path) =>
	LOCAL_TRANSCRIPTION_EXTENSIONS.has(getExtension(path));

export const getTranscriptionMediaType = (path) =>
	TRANSCRIPTION_MEDIA_TYPES[getExtension(path)] ?? "audio/wav";

const createTranscriptionModel = (mediaType) => {
	const model = openai.transcription(TRANSCRIPTION_MODEL);

	return Object.assign(Object.create(model), {
		doGenerate: (options) =>
			model.doGenerate({
				...options,
				mediaType,
			}),
	});
};

const findExecutable = async (name) => {
	for (const candidate of MEDIA_TOOL_CANDIDATES[name] ?? [name]) {
		try {
			if (candidate.includes("/")) {
				await access(candidate);
				return candidate;
			}

			await execFileAsync(candidate, ["-version"], {
				maxBuffer: 16_000,
			});
			return candidate;
		} catch {
			// Try the next common install location.
		}
	}

	throw new Error(
		`${name} is required to transcribe long local media files. Install ffmpeg or bundle it with the desktop app.`,
	);
};

const probeMediaDuration = async (filePath) => {
	const ffprobe = await findExecutable("ffprobe");
	const { stdout } = await execFileAsync(
		ffprobe,
		[
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			filePath,
		],
		{
			maxBuffer: 16_000,
		},
	);
	const duration = Number.parseFloat(stdout.trim());

	return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const serializeTranscriptionError = (error) => {
	if (!error || typeof error !== "object") {
		return {
			message: String(error),
		};
	}

	const dataError =
		error.data && typeof error.data === "object" ? error.data.error : null;
	const cause =
		error.cause && typeof error.cause === "object"
			? {
					message: error.cause.message,
					name: error.cause.name,
				}
			: error.cause;

	return {
		cause,
		dataError:
			dataError && typeof dataError === "object"
				? {
						code: dataError.code,
						message: dataError.message,
						param: dataError.param,
						type: dataError.type,
					}
				: dataError,
		message: error.message,
		name: error.name,
		responseBody: error.responseBody,
		statusCode: error.statusCode,
		url: error.url,
	};
};

const resolveInsideRoot = ({ relativePath = ".", root }) => {
	const candidate = resolve(root.path, relativePath);
	const rootRelativePath = relative(root.path, candidate);

	if (
		rootRelativePath.startsWith("..") ||
		rootRelativePath === ".." ||
		isAbsolute(rootRelativePath)
	) {
		throw new Error("Path is outside the shared folder.");
	}

	return candidate;
};

const withDuration = async (operation) => {
	const startedAt = Date.now();
	const output = await operation();

	return {
		...output,
		totalDurationMs: Date.now() - startedAt,
	};
};

const toRootSummary = (root, index) => ({
	index,
	name: root.name,
	path: root.path,
	source: root.source,
});

export const resolveLocalFolderRoots = async (references) => {
	const roots = [];
	const seen = new Set();

	for (const source of references.slice(0, MAX_ROOTS * 2)) {
		try {
			const resolvedPath = await realpath(source);
			const pathStat = await stat(resolvedPath);
			const rootPath = pathStat.isDirectory()
				? resolvedPath
				: dirname(resolvedPath);

			if (seen.has(rootPath)) {
				continue;
			}

			seen.add(rootPath);
			roots.push({
				name: basename(rootPath) || rootPath,
				path: rootPath,
				source,
			});

			if (roots.length >= MAX_ROOTS) {
				break;
			}
		} catch {
			// Ignore stale pasted paths; the assistant can still answer normally.
		}
	}

	return roots;
};

const listDirectory = async ({ relativePath = ".", root }) => {
	const directoryPath = resolveInsideRoot({ relativePath, root });
	const directoryStat = await stat(directoryPath);

	if (!directoryStat.isDirectory()) {
		throw new Error("Path is not a directory.");
	}

	const entries = await readdir(directoryPath, { withFileTypes: true });
	const displayableEntries = entries
		.filter(
			(entry) => !entry.name.startsWith(".") || entry.name === ".env.example",
		)
		.filter(
			(entry) => !(entry.isDirectory() && isIgnoredDirectory(entry.name)),
		);
	const visibleEntries = displayableEntries.slice(0, MAX_DIRECTORY_ENTRIES);

	return {
		path: relative(root.path, directoryPath) || ".",
		truncated: displayableEntries.length > visibleEntries.length,
		entries: visibleEntries.map((entry) => ({
			name: entry.name,
			type: entry.isDirectory()
				? "directory"
				: entry.isFile()
					? "file"
					: "other",
		})),
	};
};

const readLocalFile = async ({ relativePath, root }) => {
	const filePath = resolveInsideRoot({ relativePath, root });
	const fileStat = await stat(filePath);

	if (!fileStat.isFile()) {
		throw new Error("Path is not a file.");
	}

	if (!isProbablyTextFile(filePath)) {
		throw new Error("Only text-like files can be read.");
	}

	const buffer = await readFile(filePath);
	const truncated = buffer.byteLength > MAX_FILE_BYTES;
	const content = buffer.subarray(0, MAX_FILE_BYTES).toString("utf8");

	return {
		path: relative(root.path, filePath),
		sizeBytes: fileStat.size,
		truncated,
		content,
	};
};

const buildTranscriptionCacheKey = ({ filePath, fileStat }) =>
	[filePath, fileStat.size, fileStat.mtimeMs].join(":");

const buildOpenAITranscriptionOptions = ({ language, prompt }) => {
	const openaiOptions = {};
	const normalizedLanguage =
		typeof language === "string" ? language.trim().toLowerCase() : "";
	const normalizedPrompt =
		typeof prompt === "string"
			? prompt.trim().slice(0, MAX_TRANSCRIPTION_PROMPT_LENGTH)
			: "";

	if (normalizedLanguage) {
		openaiOptions.language = normalizedLanguage;
	}

	if (normalizedPrompt) {
		openaiOptions.prompt = normalizedPrompt;
	}

	if (Object.keys(openaiOptions).length > 0) {
		openaiOptions.timestampGranularities = [];
	}

	return openaiOptions;
};

const transcribeBuffer = async ({ audio, language, mediaType, prompt }) => {
	const openaiOptions = buildOpenAITranscriptionOptions({ language, prompt });

	return transcribe({
		model: createTranscriptionModel(mediaType),
		audio,
		providerOptions:
			Object.keys(openaiOptions).length > 0
				? {
						openai: openaiOptions,
					}
				: undefined,
	});
};

const splitMediaIntoAudioChunks = async ({ durationInSeconds, filePath }) => {
	const ffmpeg = await findExecutable("ffmpeg");
	const tempDirectory = await mkdtemp(join(tmpdir(), "opengran-transcribe-"));
	const chunkCount = Math.ceil(durationInSeconds / TRANSCRIPTION_CHUNK_SECONDS);
	const chunks = [];

	try {
		for (let index = 0; index < chunkCount; index += 1) {
			const startSecond = index * TRANSCRIPTION_CHUNK_SECONDS;
			const duration = Math.min(
				TRANSCRIPTION_CHUNK_SECONDS,
				durationInSeconds - startSecond,
			);
			const outputPath = join(
				tempDirectory,
				`chunk-${String(index).padStart(4, "0")}.m4a`,
			);

			await execFileAsync(
				ffmpeg,
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-y",
					"-ss",
					String(startSecond),
					"-t",
					String(duration),
					"-i",
					filePath,
					"-vn",
					"-ac",
					"1",
					"-ar",
					"24000",
					"-c:a",
					"aac",
					"-b:a",
					"48k",
					outputPath,
				],
				{
					maxBuffer: 1_000_000,
				},
			);

			const outputStat = await stat(outputPath);
			if (outputStat.size > MAX_TRANSCRIPTION_CHUNK_BYTES) {
				throw new Error(
					`Generated transcription chunk is too large (${outputStat.size} bytes).`,
				);
			}

			chunks.push({
				durationInSeconds: duration,
				path: outputPath,
				sizeBytes: outputStat.size,
				startSecond,
			});
		}

		return {
			chunks,
			cleanup: () => rm(tempDirectory, { force: true, recursive: true }),
		};
	} catch (error) {
		await rm(tempDirectory, { force: true, recursive: true });
		throw error;
	}
};

const transcribeLocalAudio = async ({
	language,
	prompt,
	relativePath,
	root,
}) => {
	const filePath = resolveInsideRoot({ relativePath, root });
	const fileStat = await stat(filePath);

	if (!fileStat.isFile()) {
		throw new Error("Path is not a file.");
	}

	if (!isSupportedTranscriptionFile(filePath)) {
		throw new Error("Only supported audio or video files can be transcribed.");
	}

	if (fileStat.size > MAX_TRANSCRIPTION_SOURCE_BYTES) {
		throw new Error(
			`Audio file is too large to transcribe directly. Maximum size is ${MAX_TRANSCRIPTION_SOURCE_BYTES} bytes.`,
		);
	}

	const cacheKey = buildTranscriptionCacheKey({ filePath, fileStat });
	const cached = transcriptionCache.get(cacheKey);
	if (cached) {
		return {
			...cached,
			cached: true,
		};
	}

	const durationInSeconds = await probeMediaDuration(filePath).catch(() => null);

	let result;
	try {
		if (
			durationInSeconds !== null &&
			(durationInSeconds > MAX_TRANSCRIPTION_SECONDS ||
				VIDEO_TRANSCRIPTION_EXTENSIONS.has(getExtension(filePath)))
		) {
			const { cleanup, chunks } = await splitMediaIntoAudioChunks({
				durationInSeconds,
				filePath,
			});

			try {
				const transcribedChunks = [];
				for (const chunk of chunks) {
					const transcript = await transcribeBuffer({
						audio: await readFile(chunk.path),
						language,
						mediaType: "audio/mp4",
						prompt,
					});
					transcribedChunks.push({
						text: transcript.text,
					});
				}
				const text = transcribedChunks
					.map((chunk) => chunk.text?.trim())
					.filter(Boolean)
					.join("\n\n");

				result = {
					path: relative(root.path, filePath),
					sizeBytes: fileStat.size,
					cached: false,
					chunked: true,
					chunkCount: transcribedChunks.length,
					durationInSeconds,
					text,
					textLength: text.length,
				};
			} finally {
				await cleanup();
			}
		} else {
			const transcript = await transcribeBuffer({
				audio: await readFile(filePath),
				language,
				mediaType: getTranscriptionMediaType(filePath),
				prompt,
			});
			result = {
				path: relative(root.path, filePath),
				sizeBytes: fileStat.size,
				cached: false,
				chunked: false,
				text: transcript.text,
				language: transcript.language,
				durationInSeconds: transcript.durationInSeconds ?? durationInSeconds,
				segments: transcript.segments,
			};
		}
	} catch (error) {
		const serializedError = serializeTranscriptionError(error);
		const localPath = relative(root.path, filePath);
		const providerMessage =
			serializedError.dataError?.message ??
			serializedError.message ??
			"Unknown provider error";
		throw new Error(
			`Local audio transcription failed for ${localPath}: ${providerMessage}`,
			{ cause: error },
		);
	}

	transcriptionCache.set(cacheKey, result);

	return result;
};

const walkFiles = async ({ directory, files, root }) => {
	if (files.length >= MAX_WALK_FILES) {
		return;
	}

	const entries = await readdir(directory, { withFileTypes: true }).catch(
		() => [],
	);

	for (const entry of entries) {
		if (files.length >= MAX_WALK_FILES) {
			return;
		}

		if (entry.name.startsWith(".") && entry.name !== ".env.example") {
			continue;
		}

		const entryPath = join(directory, entry.name);

		if (entry.isDirectory()) {
			if (!isIgnoredDirectory(entry.name)) {
				await walkFiles({ directory: entryPath, files, root });
			}
			continue;
		}

		if (entry.isFile()) {
			files.push(relative(root.path, entryPath));
		}
	}
};

const searchLocalFiles = async ({ query, root }) => {
	const needle = query.trim().toLowerCase();

	if (!needle) {
		throw new Error("Search query is required.");
	}

	const files = [];
	await walkFiles({ directory: root.path, files, root });

	const matches = [];

	for (const relativePath of files) {
		if (matches.length >= MAX_SEARCH_MATCHES) {
			break;
		}

		const pathMatches = relativePath.toLowerCase().includes(needle);
		const absolutePath = resolveInsideRoot({ relativePath, root });
		const fileStat = await stat(absolutePath).catch(() => null);

		if (!fileStat?.isFile()) {
			continue;
		}

		const lineMatches = [];

		if (
			isProbablyTextFile(absolutePath) &&
			fileStat.size <= MAX_SEARCH_FILE_BYTES
		) {
			const content = await readFile(absolutePath, "utf8").catch(() => "");
			const lines = content.split(/\r?\n/u);

			for (let index = 0; index < lines.length; index += 1) {
				if (lines[index].toLowerCase().includes(needle)) {
					lineMatches.push({
						line: index + 1,
						text: lines[index].slice(0, 500),
					});
				}

				if (lineMatches.length >= 5) {
					break;
				}
			}
		}

		if (pathMatches || lineMatches.length > 0) {
			matches.push({
				path: relativePath,
				sizeBytes: fileStat.size,
				matches: lineMatches,
				matchedPath: pathMatches,
			});
		}
	}

	return {
		truncated:
			files.length >= MAX_WALK_FILES || matches.length >= MAX_SEARCH_MATCHES,
		matches,
	};
};

const buildBashSnapshotCacheKey = ({ files, root }) =>
	[
		root.path,
		...files.map((file) => [file.path, file.sizeBytes, file.mtimeMs].join(":")),
	].join("|");

const normalizeBashOutput = (output) => {
	if (!/^\d+(,\d+)*$/u.test(output.trim())) {
		return output;
	}

	const bytes = output
		.trim()
		.split(",")
		.map((value) => Number.parseInt(value, 10));

	if (bytes.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
		return output;
	}

	return Buffer.from(bytes).toString("utf8");
};

const createLocalBashSnapshot = async ({ root }) => {
	const relativePaths = [];
	await walkFiles({ directory: root.path, files: relativePaths, root });

	const files = {};
	const mountedFiles = [];
	const skippedFiles = [];
	let totalBytes = 0;

	for (const relativePath of relativePaths) {
		if (mountedFiles.length >= MAX_BASH_SNAPSHOT_FILES) {
			skippedFiles.push({
				path: relativePath,
				reason: "snapshot file limit reached",
			});
			continue;
		}

		const absolutePath = resolveInsideRoot({ relativePath, root });
		const fileStat = await stat(absolutePath).catch(() => null);

		if (!fileStat?.isFile()) {
			continue;
		}

		if (!isProbablyTextFile(absolutePath)) {
			skippedFiles.push({
				path: relativePath,
				reason: "not a text-like file",
			});
			continue;
		}

		if (fileStat.size > MAX_BASH_SNAPSHOT_FILE_BYTES) {
			skippedFiles.push({
				path: relativePath,
				reason: "file too large",
			});
			continue;
		}

		if (totalBytes + fileStat.size > MAX_BASH_SNAPSHOT_BYTES) {
			skippedFiles.push({
				path: relativePath,
				reason: "snapshot byte limit reached",
			});
			continue;
		}

		const content = await readFile(absolutePath, "utf8").catch(() => null);
		if (content === null) {
			skippedFiles.push({
				path: relativePath,
				reason: "file could not be read",
			});
			continue;
		}

		files[relativePath] = content;
		totalBytes += fileStat.size;
		mountedFiles.push({
			path: relativePath,
			sizeBytes: fileStat.size,
			mtimeMs: fileStat.mtimeMs,
		});
	}

	return {
		files,
		mountedFiles,
		skippedFiles,
		totalBytes,
		truncated:
			relativePaths.length >= MAX_WALK_FILES ||
			mountedFiles.length >= MAX_BASH_SNAPSHOT_FILES ||
			totalBytes >= MAX_BASH_SNAPSHOT_BYTES,
	};
};

const getLocalBashTool = async ({ root }) => {
	const snapshot = await createLocalBashSnapshot({ root });
	const cacheKey = buildBashSnapshotCacheKey({
		files: snapshot.mountedFiles,
		root,
	});
	const cached = bashToolCache.get(cacheKey);
	if (cached) {
		return {
			...cached,
			cached: true,
		};
	}

	const { tools } = await createBashTool({
		files: snapshot.files,
		maxFiles: MAX_BASH_SNAPSHOT_FILES,
		maxOutputLength: MAX_BASH_OUTPUT_LENGTH,
		extraInstructions:
			"This is a virtual snapshot of text-like files from one user-shared local folder. It is not the user's real filesystem. Use commands for read/search/analysis such as find, grep, cat, head, tail, wc, sort, uniq, sed, awk, and jq. Do not claim that snapshot writes change the user's real files.",
		onAfterBashCall: ({ result }) => ({
			result: {
				...result,
				stdout: normalizeBashOutput(result.stdout),
				stderr: normalizeBashOutput(result.stderr),
				snapshot: {
					mountedFileCount: snapshot.mountedFiles.length,
					skippedFileCount: snapshot.skippedFiles.length,
					totalBytes: snapshot.totalBytes,
					truncated: snapshot.truncated,
				},
			},
		}),
	});
	const value = {
		tool: tools.bash,
		snapshot,
	};

	bashToolCache.clear();
	bashToolCache.set(cacheKey, value);

	return {
		...value,
		cached: false,
	};
};

const runLocalBash = async ({ command, root }) => {
	const trimmedCommand = command.trim();

	if (!trimmedCommand) {
		throw new Error("Command is required.");
	}

	const { cached, snapshot, tool: bashTool } = await getLocalBashTool({ root });
	const result = await bashTool.execute(
		{
			command: trimmedCommand,
		},
		{
			messages: [],
			toolCallId: "run_local_bash",
		},
	);

	return {
		...result,
		cached,
		snapshot: {
			mountedFileCount: snapshot.mountedFiles.length,
			skippedFileCount: snapshot.skippedFiles.length,
			totalBytes: snapshot.totalBytes,
			truncated: snapshot.truncated,
		},
	};
};

export const buildLocalFolderSystemContext = (roots) =>
	roots.length === 0
		? ""
		: [
				"The user shared local folders from the desktop app. You can inspect only these shared folders through the local folder tools. Do not claim access to other local paths.",
				"When the user asks about a shared local path, folder contents, local file, local audio, local video, transcript, recording, or media inside a shared folder, use the local folder tools before answering. Do not use connected app tools such as Notion for local filesystem questions unless the user explicitly asks about those connected apps.",
				"Do not say you cannot access the folder, and do not ask the user to run terminal commands, unless a local folder tool fails or the needed path is outside the shared folders.",
				"For broad text exploration, use run_local_bash. It runs only inside a virtual snapshot of text-like files from one shared folder, not on the user's real filesystem. Use structured local tools for direct folder listing, direct file reads, and media transcription.",
				"Shared local folders:",
				...roots.map((root, index) => `${index}: ${root.name} (${root.path})`),
			].join("\n");

export const buildLocalFolderTools = (roots) => {
	if (roots.length === 0) {
		return {};
	}

	const rootSchema = z
		.number()
		.int()
		.min(0)
		.max(Math.max(roots.length - 1, 0));
	const getRoot = (rootIndex) => {
		const root = roots[rootIndex];

		if (!root) {
			throw new Error("Unknown shared folder.");
		}

		return root;
	};

	return {
		list_local_directory: tool({
			description:
				"List files and folders inside a local folder explicitly shared by the desktop user.",
			inputSchema: z.object({
				rootIndex: rootSchema.describe(
					"Shared folder index from the system context.",
				),
				relativePath: z
					.string()
					.default(".")
					.describe("Path relative to the shared folder root."),
			}),
			execute: async ({ rootIndex, relativePath }) =>
				withDuration(() =>
					listDirectory({ relativePath, root: getRoot(rootIndex) }),
				),
		}),
		read_local_file: tool({
			description:
				"Read a text-like file inside a local folder explicitly shared by the desktop user.",
			inputSchema: z.object({
				rootIndex: rootSchema.describe(
					"Shared folder index from the system context.",
				),
				relativePath: z
					.string()
					.min(1)
					.describe("File path relative to the shared folder root."),
			}),
			execute: async ({ rootIndex, relativePath }) =>
				withDuration(() =>
					readLocalFile({ relativePath, root: getRoot(rootIndex) }),
				),
		}),
		transcribe_local_audio: tool({
			description:
				"Transcribe an audio or video file inside a local folder explicitly shared by the desktop user. Use this when the user asks what an audio or video recording says or what a meeting recording was about.",
			inputSchema: z.object({
				rootIndex: rootSchema.describe(
					"Shared folder index from the system context.",
				),
				relativePath: z
					.string()
					.min(1)
					.describe("Audio or video file path relative to the shared folder root."),
				language: z
					.string()
					.optional()
					.describe("Optional ISO-639-1 language hint, for example en or ru."),
				prompt: z
					.string()
					.optional()
					.describe("Optional short transcription context or vocabulary hint."),
			}),
			execute: async ({ rootIndex, relativePath, language, prompt }) =>
				withDuration(() =>
					transcribeLocalAudio({
						language,
						prompt,
						relativePath,
						root: getRoot(rootIndex),
					}),
				),
		}),
		search_local_files: tool({
			description:
				"Search file names and text-like file contents inside a local folder explicitly shared by the desktop user.",
			inputSchema: z.object({
				rootIndex: rootSchema.describe(
					"Shared folder index from the system context.",
				),
				query: z.string().min(1).describe("Case-insensitive text to find."),
			}),
			execute: async ({ rootIndex, query }) =>
				withDuration(() =>
					searchLocalFiles({ query, root: getRoot(rootIndex) }),
				),
		}),
		run_local_bash: tool({
			description:
				"Run bash commands inside a virtual snapshot of text-like files from one local folder explicitly shared by the desktop user. Use for broad, multi-step text exploration with commands like find, grep, cat, head, tail, wc, sort, uniq, sed, awk, and jq. This does not run on the user's real filesystem and snapshot writes do not modify real files.",
			inputSchema: z.object({
				rootIndex: rootSchema.describe(
					"Shared folder index from the system context.",
				),
				command: z
					.string()
					.min(1)
					.describe(
						"Bash command to run in the virtual snapshot working directory.",
					),
			}),
			execute: async ({ rootIndex, command }) =>
				withDuration(() => runLocalBash({ command, root: getRoot(rootIndex) })),
		}),
		get_shared_local_folders: tool({
			description: "Return the local folders shared with this chat request.",
			inputSchema: z.object({}),
			execute: async () =>
				withDuration(async () => ({
					folders: roots.map(toRootSummary),
				})),
		}),
	};
};
