import { ConvexError, v } from "convex/values";
import {
	DEFAULT_CHAT_MODEL_ID,
	isSupportedChatModel,
} from "../packages/ai/src/models.mjs";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const automationSchedulePeriodValidator = v.union(
	v.literal("hourly"),
	v.literal("daily"),
	v.literal("weekdays"),
	v.literal("weekly"),
	v.literal("custom"),
);

const automationRunReasonValidator = v.union(
	v.literal("scheduled"),
	v.literal("manual"),
);

const automationListItemValidator = v.object({
	id: v.id("automations"),
	title: v.string(),
	prompt: v.string(),
	model: v.string(),
	authorName: v.optional(v.string()),
	schedulePeriod: automationSchedulePeriodValidator,
	scheduledAt: v.number(),
	timezone: v.string(),
	target: v.object({
		kind: v.literal("project"),
		label: v.string(),
		projectId: v.id("projects"),
	}),
	chatId: v.string(),
	createdAt: v.number(),
	updatedAt: v.number(),
	isPaused: v.boolean(),
	lastRunAt: v.union(v.number(), v.null()),
	nextRunAt: v.union(v.number(), v.null()),
});

const automationRunStartValidator = v.union(
	v.object({
		status: v.literal("started"),
		automationId: v.id("automations"),
		runId: v.id("automationRuns"),
		ownerTokenIdentifier: v.string(),
		workspaceId: v.id("workspaces"),
		authorName: v.optional(v.string()),
		title: v.string(),
		prompt: v.string(),
		model: v.string(),
		chatId: v.string(),
		targetLabel: v.string(),
		scheduledFor: v.number(),
		reason: automationRunReasonValidator,
		notes: v.array(
			v.object({
				title: v.string(),
				text: v.string(),
				updatedAt: v.number(),
			}),
		),
	}),
	v.object({
		status: v.literal("skipped"),
	}),
);

const runningAutomationRunValidator = v.union(
	v.object({
		automationId: v.id("automations"),
		runId: v.id("automationRuns"),
		title: v.string(),
		scheduledFor: v.number(),
		startedAt: v.number(),
	}),
	v.null(),
);

const MAX_RETURNED_AUTOMATIONS = 100;
const MAX_DUE_AUTOMATIONS = 50;
const MAX_CONTEXT_NOTES = 8;
const MAX_CONTEXT_NOTE_LENGTH = 2_000;
const STALE_SCHEDULED_FUNCTION_MS = 2 * 60 * 1000;
const DELETE_RUNS_BATCH_SIZE = 50;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type AutomationSchedulePeriod = Doc<"automations">["schedulePeriod"];

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access automations.",
		});
	}

	return identity;
};

const requireOwnedWorkspace = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
) => {
	const workspace = await ctx.db.get(workspaceId);

	if (!workspace || workspace.ownerTokenIdentifier !== ownerTokenIdentifier) {
		throw new ConvexError({
			code: "WORKSPACE_NOT_FOUND",
			message: "Workspace not found.",
		});
	}

	return workspace;
};

const requireOwnedProject = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	workspaceId: Id<"workspaces">,
	projectId: Id<"projects">,
) => {
	const project = await ctx.db.get(projectId);

	if (
		!project ||
		project.ownerTokenIdentifier !== ownerTokenIdentifier ||
		project.workspaceId !== workspaceId
	) {
		throw new ConvexError({
			code: "PROJECT_NOT_FOUND",
			message: "Project not found.",
		});
	}

	return project;
};

const requireOwnedAutomation = async (
	ctx: QueryCtx | MutationCtx,
	ownerTokenIdentifier: string,
	automationId: Id<"automations">,
) => {
	const automation = await ctx.db.get(automationId);

	if (!automation || automation.ownerTokenIdentifier !== ownerTokenIdentifier) {
		throw new ConvexError({
			code: "AUTOMATION_NOT_FOUND",
			message: "Automation not found.",
		});
	}

	return automation;
};

const getAuthorName = (identity: Awaited<ReturnType<typeof requireIdentity>>) =>
	identity.name?.trim() || identity.email?.trim() || "Unknown user";

const clampWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, maxLength: number) =>
	value.length > maxLength
		? `${value.slice(0, maxLength - 1).trimEnd()}…`
		: value;

const normalizeTitle = (title: string, prompt: string) =>
	truncate(clampWhitespace(title) || clampWhitespace(prompt), 80) ||
	"Automation";

const normalizePrompt = (prompt: string) => {
	const normalized = clampWhitespace(prompt);

	if (!normalized) {
		throw new ConvexError({
			code: "PROMPT_REQUIRED",
			message: "Automation prompt is required.",
		});
	}

	return normalized;
};

const normalizeModel = (model: string | undefined) => {
	const normalized = clampWhitespace(model ?? "") || DEFAULT_CHAT_MODEL_ID;

	if (isSupportedChatModel(normalized)) {
		return normalized;
	}

	throw new ConvexError({
		code: "UNSUPPORTED_MODEL",
		message: "Unsupported automation model.",
	});
};

const normalizeTimezone = (timezone: string | undefined) =>
	clampWhitespace(timezone ?? "") || "UTC";

const createAutomationChatId = () =>
	`automation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getTimeParts = (scheduledAt: number) => {
	const scheduledDate = new Date(scheduledAt);

	return {
		dayOfWeek: scheduledDate.getUTCDay(),
		hours: scheduledDate.getUTCHours(),
		minutes: scheduledDate.getUTCMinutes(),
	};
};

const getDailyCandidate = (from: number, scheduledAt: number) => {
	const { hours, minutes } = getTimeParts(scheduledAt);
	const candidate = new Date(from);
	candidate.setUTCHours(hours, minutes, 0, 0);

	if (candidate.getTime() <= from) {
		candidate.setUTCDate(candidate.getUTCDate() + 1);
	}

	return candidate.getTime();
};

const getHourlyCandidate = (from: number, scheduledAt: number) => {
	const { minutes } = getTimeParts(scheduledAt);
	const candidate = new Date(from);
	candidate.setUTCMinutes(minutes, 0, 0);

	if (candidate.getTime() <= from) {
		candidate.setTime(candidate.getTime() + HOUR_MS);
	}

	return candidate.getTime();
};

const getWeekdayCandidate = (from: number, scheduledAt: number) => {
	let candidate = getDailyCandidate(from, scheduledAt);

	for (let attempt = 0; attempt < 7; attempt += 1) {
		const day = new Date(candidate).getUTCDay();
		if (day >= 1 && day <= 5) {
			return candidate;
		}
		candidate += DAY_MS;
	}

	return candidate;
};

const getWeeklyCandidate = (from: number, scheduledAt: number) => {
	const { dayOfWeek, hours, minutes } = getTimeParts(scheduledAt);
	const candidate = new Date(from);
	candidate.setUTCHours(hours, minutes, 0, 0);

	const dayOffset = (dayOfWeek - candidate.getUTCDay() + 7) % 7;
	candidate.setUTCDate(candidate.getUTCDate() + dayOffset);

	if (candidate.getTime() <= from) {
		candidate.setUTCDate(candidate.getUTCDate() + 7);
	}

	return candidate.getTime();
};

const getNextRunAt = ({
	from,
	scheduledAt,
	schedulePeriod,
}: {
	from: number;
	scheduledAt: number;
	schedulePeriod: AutomationSchedulePeriod;
}) => {
	switch (schedulePeriod) {
		case "hourly":
			return getHourlyCandidate(from, scheduledAt);
		case "weekdays":
			return getWeekdayCandidate(from, scheduledAt);
		case "weekly":
			return getWeeklyCandidate(from, scheduledAt);
		case "custom":
		case "daily":
			return getDailyCandidate(from, scheduledAt);
	}
};

const cancelScheduledFunction = async (
	ctx: MutationCtx,
	scheduledFunctionId: Id<"_scheduled_functions"> | undefined,
) => {
	if (!scheduledFunctionId) {
		return;
	}

	try {
		await ctx.scheduler.cancel(scheduledFunctionId);
	} catch (error) {
		console.warn("Failed to cancel automation scheduled function", error);
	}
};

const scheduleAutomationRun = async (
	ctx: MutationCtx,
	automationId: Id<"automations">,
	nextRunAt: number,
) =>
	await ctx.scheduler.runAt(
		nextRunAt,
		internal.automationActions.runAutomation,
		{
			automationId,
			scheduledFor: nextRunAt,
			reason: "scheduled",
		},
	);

const toListItem = (automation: Doc<"automations">) => ({
	id: automation._id,
	title: automation.title,
	prompt: automation.prompt,
	model: normalizeModel(automation.model),
	authorName: automation.authorName,
	schedulePeriod: automation.schedulePeriod,
	scheduledAt: automation.scheduledAt,
	timezone: automation.timezone,
	target: {
		kind: "project" as const,
		label: automation.targetLabel,
		projectId: automation.targetProjectId,
	},
	chatId: automation.chatId,
	createdAt: automation.createdAt,
	updatedAt: automation.updatedAt,
	isPaused: automation.isPaused,
	lastRunAt: automation.lastRunAt ?? null,
	nextRunAt: automation.nextRunAt ?? null,
});

const getRecentContextNotes = async (
	ctx: MutationCtx,
	automation: Doc<"automations">,
) => {
	const notes = await ctx.db
		.query("notes")
		.withIndex("by_owner_ws_project_arch_upd", (q) =>
			q
				.eq("ownerTokenIdentifier", automation.ownerTokenIdentifier)
				.eq("workspaceId", automation.workspaceId)
				.eq("projectId", automation.targetProjectId)
				.eq("isArchived", false),
		)
		.order("desc")
		.take(MAX_CONTEXT_NOTES);

	return notes.map((note) => ({
		title: note.title,
		text: truncate(note.searchableText, MAX_CONTEXT_NOTE_LENGTH),
		updatedAt: note.updatedAt,
	}));
};

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(automationListItemValidator),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);

		const automations = await ctx.db
			.query("automations")
			.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_createdAt", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId),
			)
			.order("desc")
			.take(MAX_RETURNED_AUTOMATIONS);

		return automations.map(toListItem);
	},
});

export const getRunningRunForChat = query({
	args: {
		workspaceId: v.id("workspaces"),
		chatId: v.string(),
	},
	returns: runningAutomationRunValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);

		const automation = await ctx.db
			.query("automations")
			.withIndex("by_ownerTokenIdentifier_and_workspaceId_and_chatId", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("workspaceId", args.workspaceId)
					.eq("chatId", args.chatId),
			)
			.unique();

		if (!automation?.activeRunId) {
			return null;
		}

		const run = await ctx.db.get(automation.activeRunId);

		if (!run || run.status !== "running") {
			return null;
		}

		return {
			automationId: automation._id,
			runId: run._id,
			title: automation.title,
			scheduledFor: run.scheduledFor,
			startedAt: run.startedAt,
		};
	},
});

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		title: v.string(),
		prompt: v.string(),
		model: v.optional(v.string()),
		schedulePeriod: automationSchedulePeriodValidator,
		scheduledAt: v.number(),
		timezone: v.optional(v.string()),
		target: v.object({
			kind: v.literal("project"),
			projectId: v.id("projects"),
		}),
	},
	returns: automationListItemValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		await requireOwnedWorkspace(ctx, ownerTokenIdentifier, args.workspaceId);
		const project = await requireOwnedProject(
			ctx,
			ownerTokenIdentifier,
			args.workspaceId,
			args.target.projectId,
		);
		const now = Date.now();
		const prompt = normalizePrompt(args.prompt);
		const nextRunAt = getNextRunAt({
			from: now,
			scheduledAt: args.scheduledAt,
			schedulePeriod: args.schedulePeriod,
		});
		const automationId = await ctx.db.insert("automations", {
			ownerTokenIdentifier,
			workspaceId: args.workspaceId,
			authorName: getAuthorName(identity),
			title: normalizeTitle(args.title, prompt),
			prompt,
			model: normalizeModel(args.model),
			schedulePeriod: args.schedulePeriod,
			scheduledAt: args.scheduledAt,
			timezone: normalizeTimezone(args.timezone),
			targetKind: "project",
			targetProjectId: project._id,
			targetLabel: project.name,
			chatId: createAutomationChatId(),
			isPaused: false,
			nextRunAt,
			lastRunAt: undefined,
			activeRunId: undefined,
			scheduledFunctionId: undefined,
			createdAt: now,
			updatedAt: now,
		});
		const scheduledFunctionId = await scheduleAutomationRun(
			ctx,
			automationId,
			nextRunAt,
		);
		await ctx.db.patch(automationId, {
			scheduledFunctionId,
		});

		const automation = await ctx.db.get(automationId);
		if (!automation) {
			throw new ConvexError({
				code: "AUTOMATION_SAVE_FAILED",
				message: "Failed to save automation.",
			});
		}

		return toListItem(automation);
	},
});

export const update = mutation({
	args: {
		automationId: v.id("automations"),
		title: v.string(),
		prompt: v.string(),
		model: v.optional(v.string()),
		schedulePeriod: automationSchedulePeriodValidator,
		scheduledAt: v.number(),
		timezone: v.optional(v.string()),
		target: v.object({
			kind: v.literal("project"),
			projectId: v.id("projects"),
		}),
	},
	returns: automationListItemValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const automation = await requireOwnedAutomation(
			ctx,
			ownerTokenIdentifier,
			args.automationId,
		);
		const project = await requireOwnedProject(
			ctx,
			ownerTokenIdentifier,
			automation.workspaceId,
			args.target.projectId,
		);
		await cancelScheduledFunction(ctx, automation.scheduledFunctionId);
		const now = Date.now();
		const prompt = normalizePrompt(args.prompt);
		const nextRunAt = automation.isPaused
			? undefined
			: getNextRunAt({
					from: now,
					scheduledAt: args.scheduledAt,
					schedulePeriod: args.schedulePeriod,
				});
		const scheduledFunctionId = nextRunAt
			? await scheduleAutomationRun(ctx, automation._id, nextRunAt)
			: undefined;

		await ctx.db.patch(automation._id, {
			title: normalizeTitle(args.title, prompt),
			prompt,
			model: normalizeModel(args.model),
			schedulePeriod: args.schedulePeriod,
			scheduledAt: args.scheduledAt,
			timezone: normalizeTimezone(args.timezone),
			targetKind: "project",
			targetProjectId: project._id,
			targetLabel: project.name,
			nextRunAt,
			scheduledFunctionId,
			updatedAt: now,
		});

		const updatedAutomation = await ctx.db.get(automation._id);
		if (!updatedAutomation) {
			throw new ConvexError({
				code: "AUTOMATION_SAVE_FAILED",
				message: "Failed to save automation.",
			});
		}

		return toListItem(updatedAutomation);
	},
});

export const togglePaused = mutation({
	args: {
		automationId: v.id("automations"),
	},
	returns: automationListItemValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const automation = await requireOwnedAutomation(
			ctx,
			ownerTokenIdentifier,
			args.automationId,
		);
		const now = Date.now();

		if (!automation.isPaused) {
			await cancelScheduledFunction(ctx, automation.scheduledFunctionId);
			await ctx.db.patch(automation._id, {
				isPaused: true,
				nextRunAt: undefined,
				scheduledFunctionId: undefined,
				updatedAt: now,
			});
		} else {
			const nextRunAt = getNextRunAt({
				from: now,
				scheduledAt: automation.scheduledAt,
				schedulePeriod: automation.schedulePeriod,
			});
			const scheduledFunctionId = await scheduleAutomationRun(
				ctx,
				automation._id,
				nextRunAt,
			);
			await ctx.db.patch(automation._id, {
				isPaused: false,
				nextRunAt,
				scheduledFunctionId,
				updatedAt: now,
			});
		}

		const updatedAutomation = await ctx.db.get(automation._id);
		if (!updatedAutomation) {
			throw new ConvexError({
				code: "AUTOMATION_SAVE_FAILED",
				message: "Failed to save automation.",
			});
		}

		return toListItem(updatedAutomation);
	},
});

export const runNow = mutation({
	args: {
		automationId: v.id("automations"),
	},
	returns: v.object({
		chatId: v.string(),
	}),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const automation = await requireOwnedAutomation(
			ctx,
			ownerTokenIdentifier,
			args.automationId,
		);
		const now = Date.now();
		await ctx.scheduler.runAfter(0, internal.automationActions.runAutomation, {
			automationId: automation._id,
			scheduledFor: now,
			reason: "manual",
		});

		return {
			chatId: automation.chatId,
		};
	},
});

export const remove = mutation({
	args: {
		automationId: v.id("automations"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const automation = await requireOwnedAutomation(
			ctx,
			ownerTokenIdentifier,
			args.automationId,
		);
		await cancelScheduledFunction(ctx, automation.scheduledFunctionId);
		await ctx.db.delete(automation._id);
		await ctx.scheduler.runAfter(0, internal.automations.deleteRunsBatch, {
			automationId: automation._id,
		});

		return null;
	},
});

export const beginRun = internalMutation({
	args: {
		automationId: v.id("automations"),
		scheduledFor: v.number(),
		reason: automationRunReasonValidator,
	},
	returns: automationRunStartValidator,
	handler: async (ctx, args) => {
		const automation = await ctx.db.get(args.automationId);
		if (!automation || automation.activeRunId) {
			return { status: "skipped" as const };
		}

		if (
			args.reason === "scheduled" &&
			(automation.isPaused || automation.nextRunAt !== args.scheduledFor)
		) {
			return { status: "skipped" as const };
		}

		const now = Date.now();
		const runId = await ctx.db.insert("automationRuns", {
			automationId: automation._id,
			ownerTokenIdentifier: automation.ownerTokenIdentifier,
			workspaceId: automation.workspaceId,
			chatId: automation.chatId,
			scheduledFor: args.scheduledFor,
			reason: args.reason,
			status: "running",
			error: undefined,
			startedAt: now,
			completedAt: undefined,
			userMessageId: undefined,
			assistantMessageId: undefined,
			createdAt: now,
			updatedAt: now,
		});

		await ctx.db.patch(automation._id, {
			activeRunId: runId,
			lastRunAt: now,
			scheduledFunctionId: undefined,
			updatedAt: now,
		});

		return {
			status: "started" as const,
			automationId: automation._id,
			runId,
			ownerTokenIdentifier: automation.ownerTokenIdentifier,
			workspaceId: automation.workspaceId,
			authorName: automation.authorName,
			title: automation.title,
			prompt: automation.prompt,
			model: normalizeModel(automation.model),
			chatId: automation.chatId,
			targetLabel: automation.targetLabel,
			scheduledFor: args.scheduledFor,
			reason: args.reason,
			notes: await getRecentContextNotes(ctx, automation),
		};
	},
});

export const completeRun = internalMutation({
	args: {
		automationId: v.id("automations"),
		runId: v.id("automationRuns"),
		userMessageId: v.string(),
		assistantMessageId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		const automation = await ctx.db.get(args.automationId);
		const now = Date.now();

		if (run) {
			await ctx.db.patch(run._id, {
				status: "completed",
				completedAt: now,
				userMessageId: args.userMessageId,
				assistantMessageId: args.assistantMessageId,
				updatedAt: now,
			});
		}

		if (!automation || automation.activeRunId !== args.runId) {
			return null;
		}

		const shouldScheduleNext =
			run?.reason === "scheduled" &&
			!automation.isPaused &&
			automation.nextRunAt === run.scheduledFor;
		let nextRunAt = automation.nextRunAt;
		let scheduledFunctionId = automation.scheduledFunctionId;

		if (shouldScheduleNext) {
			nextRunAt = getNextRunAt({
				from: Math.max(now, run.scheduledFor),
				scheduledAt: automation.scheduledAt,
				schedulePeriod: automation.schedulePeriod,
			});
			scheduledFunctionId = await scheduleAutomationRun(
				ctx,
				automation._id,
				nextRunAt,
			);
		}

		await ctx.db.patch(automation._id, {
			activeRunId: undefined,
			nextRunAt,
			scheduledFunctionId,
			updatedAt: now,
		});

		return null;
	},
});

export const failRun = internalMutation({
	args: {
		automationId: v.id("automations"),
		runId: v.id("automationRuns"),
		error: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.runId);
		const automation = await ctx.db.get(args.automationId);
		const now = Date.now();

		if (run) {
			await ctx.db.patch(run._id, {
				status: "failed",
				error: truncate(args.error, 1_000),
				completedAt: now,
				updatedAt: now,
			});
		}

		if (!automation || automation.activeRunId !== args.runId) {
			return null;
		}

		const shouldScheduleNext =
			run?.reason === "scheduled" &&
			!automation.isPaused &&
			automation.nextRunAt === run.scheduledFor;
		let nextRunAt = automation.nextRunAt;
		let scheduledFunctionId = automation.scheduledFunctionId;

		if (shouldScheduleNext) {
			nextRunAt = getNextRunAt({
				from: Math.max(now, run.scheduledFor),
				scheduledAt: automation.scheduledAt,
				schedulePeriod: automation.schedulePeriod,
			});
			scheduledFunctionId = await scheduleAutomationRun(
				ctx,
				automation._id,
				nextRunAt,
			);
		}

		await ctx.db.patch(automation._id, {
			activeRunId: undefined,
			nextRunAt,
			scheduledFunctionId,
			updatedAt: now,
		});

		return null;
	},
});

export const reconcileDueAutomations = internalMutation({
	args: {},
	returns: v.object({
		scheduledCount: v.number(),
	}),
	handler: async (ctx) => {
		const now = Date.now();
		const dueAutomations = await ctx.db
			.query("automations")
			.withIndex("by_isPaused_and_nextRunAt", (q) =>
				q.eq("isPaused", false).lt("nextRunAt", now + 1),
			)
			.take(MAX_DUE_AUTOMATIONS);
		let scheduledCount = 0;

		for (const automation of dueAutomations) {
			if (automation.activeRunId) {
				continue;
			}

			if (
				automation.scheduledFunctionId &&
				automation.nextRunAt &&
				automation.nextRunAt > now - STALE_SCHEDULED_FUNCTION_MS
			) {
				continue;
			}

			const scheduledFunctionId = await ctx.scheduler.runAfter(
				0,
				internal.automationActions.runAutomation,
				{
					automationId: automation._id,
					scheduledFor: automation.nextRunAt ?? now,
					reason: "scheduled",
				},
			);
			await ctx.db.patch(automation._id, {
				scheduledFunctionId,
				updatedAt: now,
			});
			scheduledCount += 1;
		}

		return { scheduledCount };
	},
});

export const deleteRunsBatch = internalMutation({
	args: {
		automationId: v.id("automations"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const runs = await ctx.db
			.query("automationRuns")
			.withIndex("by_automationId_and_scheduledFor", (q) =>
				q.eq("automationId", args.automationId),
			)
			.take(DELETE_RUNS_BATCH_SIZE);

		await Promise.all(runs.map((run) => ctx.db.delete(run._id)));

		if (runs.length === DELETE_RUNS_BATCH_SIZE) {
			await ctx.scheduler.runAfter(0, internal.automations.deleteRunsBatch, {
				automationId: args.automationId,
			});
		}

		return null;
	},
});
