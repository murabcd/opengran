import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
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

afterEach(() => {
	vi.useRealTimers();
});

const createWorkspaceAndNote = async () => {
	const t = convexTest(schema, modules);
	const asOwner = t.withIdentity(ownerIdentity);

	const { noteId, workspaceId } = await t.run(async (ctx) => {
		const createdAt = 1_000;
		const sharedAt = 2_000;
		const workspaceId = await ctx.db.insert("workspaces", {
			ownerTokenIdentifier: ownerIdentity.tokenIdentifier,
			name: "Workspace",
			normalizedName: "workspace",
			role: "startup-generalist",
			createdAt,
			updatedAt: createdAt,
		});
		const noteId = await ctx.db.insert("notes", {
			ownerTokenIdentifier: ownerIdentity.tokenIdentifier,
			workspaceId,
			authorName: "Existing Author",
			isStarred: true,
			title: "Old title",
			templateSlug: "enhanced",
			content: "old-content",
			searchableText: "old text",
			visibility: "public",
			shareId: "share-1",
			sharedAt,
			isArchived: false,
			archivedAt: undefined,
			createdAt,
			updatedAt: createdAt,
		});

		return { noteId, workspaceId };
	});

	return {
		asOwner,
		noteId,
		t,
		workspaceId,
	};
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
		t,
		workspaceId,
	};
};

test("notes.save updates content without dropping existing metadata", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-10T18:00:00.000Z"));

	const { asOwner, noteId, workspaceId } = await createWorkspaceAndNote();

	const savedId = await asOwner.mutation(api.notes.save, {
		workspaceId,
		id: noteId,
		title: "Updated title",
		content: "new-content",
		searchableText: "new text",
	});

	expect(savedId).toBe(noteId);

	const note = await asOwner.query(api.notes.get, {
		id: noteId,
		workspaceId,
	});

	expect(note).not.toBeNull();
	expect(note).toMatchObject({
		_id: noteId,
		workspaceId,
		authorName: "Existing Author",
		isStarred: true,
		title: "Updated title",
		templateSlug: "enhanced",
		content: "new-content",
		searchableText: "new text",
		visibility: "public",
		shareId: "share-1",
		sharedAt: 2_000,
		isArchived: false,
	});
	expect(note?.updatedAt).toBe(Date.now());
});

test("notes.save is a no-op when the payload is unchanged", async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-10T18:00:00.000Z"));

	const { asOwner, noteId, workspaceId } = await createWorkspaceAndNote();
	const noteBeforeSave = await asOwner.query(api.notes.get, {
		id: noteId,
		workspaceId,
	});

	expect(noteBeforeSave).not.toBeNull();

	vi.setSystemTime(new Date("2026-04-10T18:05:00.000Z"));

	const savedId = await asOwner.mutation(api.notes.save, {
		workspaceId,
		id: noteId,
		title: "Old title",
		content: "old-content",
		searchableText: "old text",
	});

	expect(savedId).toBe(noteId);

	const noteAfterSave = await asOwner.query(api.notes.get, {
		id: noteId,
		workspaceId,
	});

	expect(noteAfterSave).not.toBeNull();
	expect(noteAfterSave?.updatedAt).toBe(noteBeforeSave?.updatedAt);
	expect(noteAfterSave).toMatchObject({
		_id: noteId,
		title: "Old title",
		content: "old-content",
		searchableText: "old text",
		templateSlug: "enhanced",
		visibility: "public",
	});
});

test("notes.create and notes.rename preserve empty titles", async () => {
	const { asOwner, workspaceId } = await createWorkspace();

	const noteId = await asOwner.mutation(api.notes.create, {
		workspaceId,
	});
	const createdNote = await asOwner.query(api.notes.get, {
		id: noteId,
		workspaceId,
	});

	expect(createdNote).not.toBeNull();
	expect(createdNote?.title).toBe("");

	const renamed = await asOwner.mutation(api.notes.rename, {
		workspaceId,
		id: noteId,
		title: "   ",
	});
	const renamedNote = await asOwner.query(api.notes.get, {
		id: noteId,
		workspaceId,
	});

	expect(renamed.title).toBe("");
	expect(renamedNote).not.toBeNull();
	expect(renamedNote?.title).toBe("");
});

test("notes.setProject assigns and clears a project without dropping note metadata", async () => {
	const { asOwner, noteId, t, workspaceId } = await createWorkspaceAndNote();

	const projectId = await t.run(async (ctx) =>
		ctx.db.insert("projects", {
			ownerTokenIdentifier: ownerIdentity.tokenIdentifier,
			workspaceId,
			name: "Product",
			normalizedName: "product",
			isStarred: false,
			createdAt: 3_000,
			updatedAt: 3_000,
		}),
	);

	const assigned = await asOwner.mutation(api.notes.setProject, {
		workspaceId,
		id: noteId,
		projectId,
	});
	const assignedNote = await asOwner.query(api.notes.get, {
		id: noteId,
		workspaceId,
	});

	expect(assigned.projectId).toBe(projectId);
	expect(assignedNote).not.toBeNull();
	expect(assignedNote).toMatchObject({
		_id: noteId,
		projectId,
		title: "Old title",
		templateSlug: "enhanced",
		visibility: "public",
	});

	const cleared = await asOwner.mutation(api.notes.setProject, {
		workspaceId,
		id: noteId,
		projectId: null,
	});
	const clearedNote = await asOwner.query(api.notes.get, {
		id: noteId,
		workspaceId,
	});

	expect(cleared.projectId).toBeNull();
	expect(clearedNote).not.toBeNull();
	expect(clearedNote?.projectId).toBeUndefined();
	expect(clearedNote?.title).toBe("Old title");
});
