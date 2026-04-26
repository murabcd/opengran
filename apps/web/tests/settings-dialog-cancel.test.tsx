import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useActionMock = vi.fn();
const useMutationMock = vi.fn();
const useQueryMock = vi.fn();
const updateUserMock = vi.fn();

vi.mock("convex/react", () => ({
	useAction: useActionMock,
	useMutation: useMutationMock,
	useQuery: useQueryMock,
}));

vi.mock("../src/lib/auth-client", () => ({
	authClient: {
		$fetch: vi.fn().mockResolvedValue([]),
		updateUser: updateUserMock,
		useSession: () => ({
			data: {
				user: {
					email: "jane@example.com",
				},
			},
		}),
	},
}));

describe("settings dialog cancel actions", () => {
	beforeEach(() => {
		useActionMock.mockReturnValue(vi.fn());
		useQueryMock.mockReturnValue({
			jobTitle: "PM",
			companyName: "OpenGran",
			avatarStorageId: null,
			avatarUrl: null,
		});
		useMutationMock.mockImplementation(() => {
			const mutation = vi.fn();
			(
				mutation as typeof mutation & {
					withOptimisticUpdate: (fn: unknown) => typeof mutation;
				}
			).withOptimisticUpdate = () => mutation;
			return mutation;
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("resets profile edits and closes settings", async () => {
		const onOpenChange = vi.fn();
		const { SettingsDialog } = await import(
			"../src/components/settings/settings-dialog"
		);

		render(
			<SettingsDialog
				open
				onOpenChange={onOpenChange}
				initialPage="Profile"
				user={{
					name: "Jane Doe",
					email: "jane@example.com",
					avatar: "",
				}}
				workspace={null}
			/>,
		);

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		const nameInput = screen.getByLabelText("Full name");

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);

		fireEvent.change(nameInput, { target: { value: "Jane Updated" } });

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(cancelButton);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe(
			"Jane Doe",
		);
		expect(
			(screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});

	it("resets workspace edits and closes settings", async () => {
		const onOpenChange = vi.fn();
		const { SettingsDialog } = await import(
			"../src/components/settings/settings-dialog"
		);

		render(
			<SettingsDialog
				open
				onOpenChange={onOpenChange}
				initialPage="Workspace"
				user={{
					name: "Jane Doe",
					email: "jane@example.com",
					avatar: "",
				}}
				workspace={{
					_id: "workspace-1",
					_creationTime: 0,
					ownerTokenIdentifier: "owner-1",
					name: "OpenGran",
					normalizedName: "opengran",
					role: "startup-generalist",
					createdAt: 0,
					updatedAt: 0,
					iconStorageId: null,
					iconUrl: null,
				}}
			/>,
		);

		const cancelButton = screen.getByRole("button", { name: "Cancel" });
		const nameInput = screen.getByLabelText("Name");

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);

		fireEvent.change(nameInput, { target: { value: "New workspace" } });

		expect((cancelButton as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(cancelButton);

		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe(
			"OpenGran",
		);
		expect(
			(screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
	});
});
