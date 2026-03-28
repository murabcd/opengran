import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";

const workspaceRoleValidator = v.union(
	v.literal("startup-generalist"),
	v.literal("investing"),
	v.literal("recruiting"),
	v.literal("customer-facing"),
);

const workspaceFields = {
	_id: v.id("workspaces"),
	_creationTime: v.number(),
	ownerTokenIdentifier: v.string(),
	name: v.string(),
	normalizedName: v.string(),
	icon: v.optional(v.string()),
	role: workspaceRoleValidator,
	createdAt: v.number(),
	updatedAt: v.number(),
};

const workspaceValidator = v.object(workspaceFields);

const REMOVE_ALL_WORKSPACES_BATCH_SIZE = 100;
const MAX_RETURNED_WORKSPACES = 20;
const MAX_WORKSPACE_NAME_LENGTH = 48;

const requireIdentity = async (ctx: QueryCtx | MutationCtx) => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access workspaces.",
		});
	}

	return identity;
};

const normalizeWorkspaceName = (value: string) =>
	value.replace(/\s+/g, " ").trim();

const toNormalizedWorkspaceKey = (value: string) =>
	normalizeWorkspaceName(value).toLowerCase();

const deleteWorkspaceBatch = async (
	ctx: MutationCtx,
	ownerTokenIdentifier: string,
) => {
	const workspaces = await ctx.db
		.query("workspaces")
		.withIndex("by_ownerTokenIdentifier_and_createdAt", (q) =>
			q.eq("ownerTokenIdentifier", ownerTokenIdentifier),
		)
		.take(REMOVE_ALL_WORKSPACES_BATCH_SIZE);

	await Promise.all(
		workspaces.map((workspace) => ctx.db.delete(workspace._id)),
	);

	return {
		deletedCount: workspaces.length,
		hasMore: workspaces.length === REMOVE_ALL_WORKSPACES_BATCH_SIZE,
	};
};

export const list = query({
	args: {},
	returns: v.array(workspaceValidator),
	handler: async (ctx) => {
		const identity = await requireIdentity(ctx);

		return await ctx.db
			.query("workspaces")
			.withIndex("by_ownerTokenIdentifier_and_createdAt", (q) =>
				q.eq("ownerTokenIdentifier", identity.tokenIdentifier),
			)
			.take(MAX_RETURNED_WORKSPACES);
	},
});

export const create = mutation({
	args: {
		name: v.string(),
		icon: v.optional(v.string()),
		role: v.optional(workspaceRoleValidator),
	},
	returns: workspaceValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const ownerTokenIdentifier = identity.tokenIdentifier;
		const name = normalizeWorkspaceName(args.name);

		if (name.length < 2) {
			throw new ConvexError({
				code: "INVALID_WORKSPACE_NAME",
				message: "Workspace name must be at least 2 characters.",
			});
		}

		if (name.length > MAX_WORKSPACE_NAME_LENGTH) {
			throw new ConvexError({
				code: "INVALID_WORKSPACE_NAME",
				message: `Workspace name must be ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`,
			});
		}

		const normalizedName = toNormalizedWorkspaceKey(name);
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_ownerTokenIdentifier_and_normalizedName", (q) =>
				q
					.eq("ownerTokenIdentifier", ownerTokenIdentifier)
					.eq("normalizedName", normalizedName),
			)
			.unique();

		if (existing) {
			throw new ConvexError({
				code: "WORKSPACE_ALREADY_EXISTS",
				message: "A workspace with that name already exists.",
			});
		}

		const now = Date.now();
		const workspaceId = await ctx.db.insert("workspaces", {
			ownerTokenIdentifier,
			name,
			normalizedName,
			icon: args.icon,
			role: args.role ?? "startup-generalist",
			createdAt: now,
			updatedAt: now,
		});
		const workspace = await ctx.db.get(workspaceId);

		if (!workspace) {
			throw new ConvexError({
				code: "WORKSPACE_CREATE_FAILED",
				message: "Failed to create workspace.",
			});
		}

		return workspace;
	},
});

export const update = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.optional(v.string()),
		icon: v.optional(v.string()),
		role: v.optional(workspaceRoleValidator),
	},
	returns: workspaceValidator,
	handler: async (ctx, args) => {
		const identity = await requireIdentity(ctx);
		const existingWorkspace = await ctx.db.get(args.workspaceId);

		if (
			!existingWorkspace ||
			existingWorkspace.ownerTokenIdentifier !== identity.tokenIdentifier
		) {
			throw new ConvexError({
				code: "WORKSPACE_NOT_FOUND",
				message: "Workspace not found.",
			});
		}

		const nextName =
			args.name === undefined
				? existingWorkspace.name
				: normalizeWorkspaceName(args.name);

		if (nextName.length < 2) {
			throw new ConvexError({
				code: "INVALID_WORKSPACE_NAME",
				message: "Workspace name must be at least 2 characters.",
			});
		}

		if (nextName.length > MAX_WORKSPACE_NAME_LENGTH) {
			throw new ConvexError({
				code: "INVALID_WORKSPACE_NAME",
				message: `Workspace name must be ${MAX_WORKSPACE_NAME_LENGTH} characters or fewer.`,
			});
		}

		const nextRole = args.role ?? existingWorkspace.role;
		const nextNormalizedName = toNormalizedWorkspaceKey(nextName);
		const nextIcon = args.icon ?? existingWorkspace.icon;
		const hasNameChange = nextName !== existingWorkspace.name;
		const hasIconChange = nextIcon !== existingWorkspace.icon;
		const hasRoleChange = nextRole !== existingWorkspace.role;

		if (hasNameChange) {
			const duplicateWorkspace = await ctx.db
				.query("workspaces")
				.withIndex("by_ownerTokenIdentifier_and_normalizedName", (q) =>
					q
						.eq("ownerTokenIdentifier", identity.tokenIdentifier)
						.eq("normalizedName", nextNormalizedName),
				)
				.unique();

			if (
				duplicateWorkspace &&
				duplicateWorkspace._id !== existingWorkspace._id
			) {
				throw new ConvexError({
					code: "WORKSPACE_ALREADY_EXISTS",
					message: "A workspace with that name already exists.",
				});
			}
		}

		if (!hasNameChange && !hasIconChange && !hasRoleChange) {
			return existingWorkspace;
		}

		await ctx.db.patch(args.workspaceId, {
			name: nextName,
			normalizedName: nextNormalizedName,
			icon: nextIcon,
			role: nextRole,
			updatedAt: Date.now(),
		});

		const updatedWorkspace = await ctx.db.get(args.workspaceId);

		if (!updatedWorkspace) {
			throw new ConvexError({
				code: "WORKSPACE_UPDATE_FAILED",
				message: "Failed to update workspace.",
			});
		}

		return updatedWorkspace;
	},
});

export const removeAllForOwner = internalMutation({
	args: {
		ownerTokenIdentifier: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const result = await deleteWorkspaceBatch(ctx, args.ownerTokenIdentifier);

		if (result.hasMore) {
			await ctx.scheduler.runAfter(0, internal.workspaces.removeAllForOwner, {
				ownerTokenIdentifier: args.ownerTokenIdentifier,
			});
		}

		return null;
	},
});
