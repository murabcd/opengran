import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const ownerIdentity = {
	issuer: "https://opengran.test",
	subject: "owner-subject",
	tokenIdentifier: "test|owner",
	name: "Owner",
	email: "owner@example.com",
};

const createWorkspace = async () => {
	const t = convexTest(schema, modules);
	const asOwner = t.withIdentity(ownerIdentity);

	const workspaceId = await t.run(async (ctx) =>
		ctx.db.insert("workspaces", {
			ownerTokenIdentifier: ownerIdentity.tokenIdentifier,
			name: "Workspace",
			normalizedName: "workspace",
			role: "startup-generalist",
			createdAt: 1_000,
			updatedAt: 1_000,
		}),
	);

	return {
		asOwner,
		workspaceId,
	};
};

test("projects.create trims names and projects.list sorts them by normalized name", async () => {
	const { asOwner, workspaceId } = await createWorkspace();

	const zebraId = await asOwner.mutation(api.projects.create, {
		workspaceId,
		name: "  Zebra  ",
	});
	const alphaId = await asOwner.mutation(api.projects.create, {
		workspaceId,
		name: "Alpha",
	});

	expect(zebraId.name).toBe("Zebra");
	expect(alphaId.name).toBe("Alpha");

	const projects = await asOwner.query(api.projects.list, {
		workspaceId,
	});

	expect(projects.map((project) => project.name)).toEqual(["Alpha", "Zebra"]);
});

test("projects.create rejects duplicate names in the same workspace", async () => {
	const { asOwner, workspaceId } = await createWorkspace();

	await asOwner.mutation(api.projects.create, {
		workspaceId,
		name: "Product",
	});

	await expect(
		asOwner
			.mutation(api.projects.create, {
				workspaceId,
				name: "  product  ",
			})
			.catch((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(String((error as { data?: string }).data)).toContain(
					"PROJECT_ALREADY_EXISTS",
				);
				throw error;
			}),
	).rejects.toBeInstanceOf(Error);
});

test("projects.rename updates the project and preserves workspace uniqueness", async () => {
	const { asOwner, workspaceId } = await createWorkspace();

	const project = await asOwner.mutation(api.projects.create, {
		workspaceId,
		name: "Product",
	});
	await asOwner.mutation(api.projects.create, {
		workspaceId,
		name: "Research",
	});

	const renamed = await asOwner.mutation(api.projects.rename, {
		workspaceId,
		id: project._id,
		name: "  Founding Team  ",
	});

	expect(renamed.name).toBe("Founding Team");

	const projects = await asOwner.query(api.projects.list, {
		workspaceId,
	});
	expect(projects.map((entry) => entry.name)).toEqual([
		"Founding Team",
		"Research",
	]);

	await expect(
		asOwner
			.mutation(api.projects.rename, {
				workspaceId,
				id: project._id,
				name: "research",
			})
			.catch((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(String((error as { data?: string }).data)).toContain(
					"PROJECT_ALREADY_EXISTS",
				);
				throw error;
			}),
	).rejects.toBeInstanceOf(Error);
});

test("projects.remove deletes the project and clears it from assigned notes", async () => {
	const { asOwner, workspaceId } = await createWorkspace();

	const project = await asOwner.mutation(api.projects.create, {
		workspaceId,
		name: "Flomni",
	});

	const { noteId, archivedNoteId } = await asOwner.run(async (ctx) => {
		const noteId = await ctx.db.insert("notes", {
			ownerTokenIdentifier: ownerIdentity.tokenIdentifier,
			workspaceId,
			projectId: project._id,
			title: "Current note",
			content: "",
			searchableText: "",
			visibility: "private",
			isArchived: false,
			createdAt: 1_000,
			updatedAt: 1_000,
		});
		const archivedNoteId = await ctx.db.insert("notes", {
			ownerTokenIdentifier: ownerIdentity.tokenIdentifier,
			workspaceId,
			projectId: project._id,
			title: "Archived note",
			content: "",
			searchableText: "",
			visibility: "private",
			isArchived: true,
			archivedAt: 2_000,
			createdAt: 1_000,
			updatedAt: 1_000,
		});

		return { noteId, archivedNoteId };
	});

	await asOwner.mutation(api.projects.remove, {
		workspaceId,
		id: project._id,
	});

	const projects = await asOwner.query(api.projects.list, {
		workspaceId,
	});
	expect(projects).toHaveLength(0);

	const currentNote = await asOwner.run(async (ctx) => ctx.db.get(noteId));
	const archivedNote = await asOwner.run(async (ctx) =>
		ctx.db.get(archivedNoteId),
	);

	expect(currentNote?.projectId).toBeUndefined();
	expect(archivedNote?.projectId).toBeUndefined();
});
