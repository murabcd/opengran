import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

type JiraWebhookConnection = {
	connectionId: Id<"appConnections">;
	ownerTokenIdentifier: string;
	workspaceId: Id<"workspaces">;
	baseUrl: string;
	email: string;
	token: string;
	accountId?: string;
};

type JiraWebhookLogEvent = {
	outcome: "success" | "ignored" | "error" | "unauthorized";
	reason: string;
	status: number;
	sourceId: string;
	webhookEvent?: string | null;
	connectionId?: Id<"appConnections">;
	workspaceId?: Id<"workspaces">;
	accountId?: string | null;
	commentId?: string | null;
	issueKey?: string | null;
	actorAccountId?: string | null;
	hasMention?: boolean;
	bodyPreview?: string;
};

const jsonResponse = (payload: unknown, status: number) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json",
		},
	});

const getJiraAuthHeader = (email: string, token: string) =>
	`Basic ${btoa(`${email}:${token}`)}`;

const asRecord = (value: unknown): Record<string, unknown> | null =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const readString = (value: unknown) =>
	typeof value === "string" && value.trim().length > 0 ? value : null;

const normalizeWebhookSourceId = (value: string) => {
	let normalizedValue = value.trim();

	for (let attempt = 0; attempt < 2; attempt += 1) {
		if (!normalizedValue.includes("%")) {
			break;
		}

		try {
			const decodedValue = decodeURIComponent(normalizedValue);

			if (decodedValue === normalizedValue) {
				break;
			}

			normalizedValue = decodedValue;
		} catch {
			break;
		}
	}

	return normalizedValue;
};

const buildJiraUrl = (
	baseUrl: string,
	pathname: string,
	query?: Record<string, string>,
) => {
	const url = new URL(baseUrl);
	const basePath = url.pathname.endsWith("/")
		? url.pathname.slice(0, -1)
		: url.pathname;
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;

	url.pathname = `${basePath}${normalizedPath}`;

	if (query) {
		for (const [key, value] of Object.entries(query)) {
			if (value) {
				url.searchParams.set(key, value);
			}
		}
	}

	return url;
};

const toCommentExternalId = (commentId: string) => `jira-comment:${commentId}`;

const toIssueCommentUrl = (
	baseUrl: string,
	issueKey: string,
	commentId: string,
) =>
	buildJiraUrl(baseUrl, `/browse/${encodeURIComponent(issueKey)}`, {
		focusedCommentId: commentId,
	}).toString();

const clampWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stringHasMention = (value: string, accountId: string) => {
	const normalizedValue = value.trim();

	if (!normalizedValue) {
		return false;
	}

	if (normalizedValue.includes(`[~accountid:${accountId}]`)) {
		return true;
	}

	const accountIdPattern = new RegExp(
		`\\[~accountid:${escapeRegExp(accountId)}\\]`,
		"i",
	);

	return accountIdPattern.test(normalizedValue);
};

const stripLegacyMentionSyntax = (value: string) =>
	value.replace(/\[~accountid:[^\]]+\]/gi, "").trim();

const extractJiraText = (value: unknown, limit = 240) => {
	const parts: string[] = [];
	let currentLength = 0;

	const push = (text: string) => {
		if (!text || currentLength >= limit) {
			return;
		}

		const trimmedText = text.trim();

		if (!trimmedText) {
			return;
		}

		parts.push(trimmedText);
		currentLength += trimmedText.length;
	};

	const walk = (node: unknown) => {
		if (!node || currentLength >= limit) {
			return;
		}

		if (typeof node === "string") {
			push(node);
			return;
		}

		if (Array.isArray(node)) {
			for (const item of node) {
				walk(item);
			}
			return;
		}

		const record = asRecord(node);

		if (!record) {
			return;
		}

		if (typeof record.text === "string") {
			push(record.text);
		}

		if (Array.isArray(record.content)) {
			for (const item of record.content) {
				walk(item);
			}
		}
	};

	walk(value);

	return clampWhitespace(stripLegacyMentionSyntax(parts.join(" "))).slice(
		0,
		limit,
	);
};

const documentHasMention = (value: unknown, accountId: string): boolean => {
	if (!value) {
		return false;
	}

	if (typeof value === "string") {
		return stringHasMention(value, accountId);
	}

	if (Array.isArray(value)) {
		return value.some((item) => documentHasMention(item, accountId));
	}

	const record = asRecord(value);

	if (!record) {
		return false;
	}

	if (typeof record.text === "string" && stringHasMention(record.text, accountId)) {
		return true;
	}

	if (record.type === "mention") {
		const attrs = asRecord(record.attrs);
		return typeof attrs?.id === "string" && attrs.id === accountId;
	}

	return Array.isArray(record.content)
		? record.content.some((item) => documentHasMention(item, accountId))
		: false;
};

const resolveJiraAccountId = async (
	connection: JiraWebhookConnection,
): Promise<string | null> => {
	if (connection.accountId) {
		return connection.accountId;
	}

	const response = await fetch(
		buildJiraUrl(connection.baseUrl, "/rest/api/3/myself").toString(),
		{
			headers: {
				Authorization: getJiraAuthHeader(connection.email, connection.token),
				Accept: "application/json",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Failed to load Jira account (${response.status}).`);
	}

	const currentUser = asRecord(await response.json().catch(() => null));
	return readString(currentUser?.accountId);
};

const isCommentWebhookEvent = (value: string | null) =>
	value === "comment_created" ||
	value === "comment_updated" ||
	value === "comment_deleted";

const logJiraWebhookEvent = (_event: JiraWebhookLogEvent) => {};

export const handleJiraWebhookRequest = async (
	ctx: ActionCtx,
	request: Request,
) => {
	const requestUrl = new URL(request.url);
	const sourceId = normalizeWebhookSourceId(
		requestUrl.searchParams.get("sourceId") ?? "",
	);
	const webhookSecret = requestUrl.searchParams.get("secret")?.trim() ?? "";

	if (!sourceId || !webhookSecret) {
		logJiraWebhookEvent({
			outcome: "unauthorized",
			reason: "missing_credentials",
			status: 400,
			sourceId,
		});
		return jsonResponse({ message: "Missing Jira webhook credentials." }, 400);
	}

	const connection = (await ctx.runQuery(
		internal.appConnections.getJiraWebhookConnection,
		{
			sourceId,
			webhookSecret,
		},
	)) as JiraWebhookConnection | null;

	if (!connection) {
		logJiraWebhookEvent({
			outcome: "unauthorized",
			reason: "connection_not_found",
			status: 401,
			sourceId,
		});
		return jsonResponse({ message: "Jira webhook is not authorized." }, 401);
	}

	let payload: Record<string, unknown>;

	try {
		payload = (await request.json()) as Record<string, unknown>;
	} catch {
		logJiraWebhookEvent({
			outcome: "error",
			reason: "invalid_json",
			status: 400,
			sourceId,
			connectionId: connection.connectionId,
			workspaceId: connection.workspaceId,
		});
		return jsonResponse({ message: "Jira webhook payload must be valid JSON." }, 400);
	}

	const receivedAt = Date.now();
	const webhookEvent = readString(payload.webhookEvent);

	let accountId: string | null;

	try {
		accountId = await resolveJiraAccountId(connection);
	} catch (error) {
		logJiraWebhookEvent({
			outcome: "error",
			reason: "account_resolution_failed",
			status: 502,
			sourceId,
			connectionId: connection.connectionId,
			workspaceId: connection.workspaceId,
			webhookEvent,
		});
		return jsonResponse(
			{
				message:
					error instanceof Error
						? error.message
						: "Failed to resolve Jira account for mention sync.",
			},
			502,
		);
	}

	if (!accountId) {
		logJiraWebhookEvent({
			outcome: "error",
			reason: "missing_account_id",
			status: 500,
			sourceId,
			connectionId: connection.connectionId,
			workspaceId: connection.workspaceId,
			webhookEvent,
		});
		return jsonResponse(
			{ message: "Connected Jira account is missing an account id." },
			500,
		);
	}

	if (!isCommentWebhookEvent(webhookEvent)) {
		await ctx.runMutation(internal.appConnections.recordJiraWebhookActivity, {
			connectionId: connection.connectionId,
			lastWebhookReceivedAt: receivedAt,
			accountId,
		});
		logJiraWebhookEvent({
			outcome: "ignored",
			reason: "non_comment_event",
			status: 200,
			sourceId,
			connectionId: connection.connectionId,
			workspaceId: connection.workspaceId,
			accountId,
			webhookEvent,
		});
		return jsonResponse({ message: "Ignored Jira webhook event." }, 200);
	}

	const issue = asRecord(payload.issue);
	const comment = asRecord(payload.comment);
	const actor = asRecord(payload.user) ?? asRecord(comment?.author);
	const commentId = readString(comment?.id);

	if (!commentId) {
		await ctx.runMutation(internal.appConnections.recordJiraWebhookActivity, {
			connectionId: connection.connectionId,
			lastWebhookReceivedAt: receivedAt,
			accountId,
		});
		logJiraWebhookEvent({
			outcome: "ignored",
			reason: "missing_comment_id",
			status: 200,
			sourceId,
			connectionId: connection.connectionId,
			workspaceId: connection.workspaceId,
			accountId,
			webhookEvent,
		});
		return jsonResponse({ message: "Ignored Jira comment event without id." }, 200);
	}

	const externalId = toCommentExternalId(commentId);

	if (webhookEvent === "comment_deleted") {
		await ctx.runMutation(internal.inboxItems.removeJiraMention, {
			ownerTokenIdentifier: connection.ownerTokenIdentifier,
			workspaceId: connection.workspaceId,
			externalId,
		});
		await ctx.runMutation(internal.appConnections.recordJiraWebhookActivity, {
			connectionId: connection.connectionId,
			lastWebhookReceivedAt: receivedAt,
			lastMentionSyncAt: receivedAt,
			accountId,
		});
		logJiraWebhookEvent({
			outcome: "success",
			reason: "comment_deleted",
			status: 200,
			sourceId,
			connectionId: connection.connectionId,
			workspaceId: connection.workspaceId,
			accountId,
			webhookEvent,
			commentId,
		});
		return jsonResponse({ message: "Deleted Jira mention inbox item." }, 200);
	}

	const actorAccountId = readString(actor?.accountId);
	const body = comment?.body;
	const hasMention = documentHasMention(body, accountId);
	const issueKey = readString(issue?.key) ?? "Jira";
	const issueFields = asRecord(issue?.fields);
	const issueSummary = readString(issueFields?.summary) ?? undefined;
	const bodyPreview = extractJiraText(body);

	if (!hasMention) {
		await ctx.runMutation(internal.inboxItems.removeJiraMention, {
			ownerTokenIdentifier: connection.ownerTokenIdentifier,
			workspaceId: connection.workspaceId,
			externalId,
		});
		await ctx.runMutation(internal.appConnections.recordJiraWebhookActivity, {
			connectionId: connection.connectionId,
			lastWebhookReceivedAt: receivedAt,
			lastMentionSyncAt: receivedAt,
			accountId,
		});
		logJiraWebhookEvent({
			outcome: "ignored",
			reason: "mention_not_detected",
			status: 200,
			sourceId,
			connectionId: connection.connectionId,
			workspaceId: connection.workspaceId,
			accountId,
			webhookEvent,
			commentId,
			issueKey,
			actorAccountId,
			hasMention,
			bodyPreview,
		});
		return jsonResponse({ message: "Processed Jira comment without mention." }, 200);
	}

	const actorDisplayName = readString(actor?.displayName) ?? undefined;
	const avatarUrls = asRecord(actor?.avatarUrls);
	const actorAvatarUrl =
		readString(avatarUrls?.["48x48"]) ??
		readString(avatarUrls?.["24x24"]) ??
		undefined;
	const preview =
		bodyPreview || `${actorDisplayName ?? "Someone"} mentioned you`;
	const title = actorDisplayName
		? `${actorDisplayName} mentioned you`
		: "Someone mentioned you";

	await ctx.runMutation(internal.inboxItems.upsertJiraMention, {
		ownerTokenIdentifier: connection.ownerTokenIdentifier,
		workspaceId: connection.workspaceId,
		externalId,
		issueKey,
		...(issueSummary ? { issueSummary } : {}),
		title,
		preview,
		url: toIssueCommentUrl(connection.baseUrl, issueKey, commentId),
		occurredAt: receivedAt,
		...(actorDisplayName ? { actorDisplayName } : {}),
		...(actorAvatarUrl ? { actorAvatarUrl } : {}),
	});
	await ctx.runMutation(internal.appConnections.recordJiraWebhookActivity, {
		connectionId: connection.connectionId,
		lastWebhookReceivedAt: receivedAt,
		lastMentionSyncAt: receivedAt,
		accountId,
	});
	logJiraWebhookEvent({
		outcome: "success",
		reason: "mention_synced",
		status: 200,
		sourceId,
		connectionId: connection.connectionId,
		workspaceId: connection.workspaceId,
		accountId,
		webhookEvent,
		commentId,
		issueKey,
		actorAccountId,
		hasMention,
		bodyPreview,
	});

	return jsonResponse({ message: "Synced Jira mention into inbox." }, 200);
};
