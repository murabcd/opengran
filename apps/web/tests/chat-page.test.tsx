import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveWorkspaceProvider } from "../src/hooks/use-active-workspace";

const convexTokenMock = vi.fn();
const sendMessageMock = vi.fn();
const toastSuccessMock = vi.fn();
const useChatMock = vi.fn();
const useQueryMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock("@ai-sdk/react", () => ({
	useChat: useChatMock,
}));

vi.mock("convex/react", () => ({
	useQuery: useQueryMock,
	useMutation: useMutationMock,
}));

vi.mock("ai", () => ({
	DefaultChatTransport: class DefaultChatTransport {
		constructor(readonly options: unknown) {}
	},
}));

vi.mock("../src/components/chat/messages", () => ({
	ChatMessages: () => <div>chat messages</div>,
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		convex: {
			token: convexTokenMock,
		},
	},
}));

vi.mock("sonner", () => ({
	toast: {
		success: toastSuccessMock,
	},
}));

vi.mock("@workspace/ui/components/avatar", () => ({
	Avatar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AvatarFallback: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/command", () => ({
	Command: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CommandEmpty: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	CommandGroup: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	CommandInput: ({
		onValueChange,
		value,
		placeholder,
	}: {
		onValueChange?: (value: string) => void;
		value?: string;
		placeholder?: string;
	}) => (
		<input
			placeholder={placeholder}
			value={value}
			onChange={(event) => onValueChange?.(event.target.value)}
		/>
	),
	CommandItem: ({
		children,
		onSelect,
	}: React.PropsWithChildren<{ onSelect?: () => void }>) => (
		<button type="button" onClick={() => onSelect?.()}>
			{children}
		</button>
	),
	CommandList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuCheckboxItem: ({
		children,
		checked,
		onCheckedChange,
	}: React.PropsWithChildren<{
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}>) => (
		<button type="button" onClick={() => onCheckedChange?.(!checked)}>
			{children}
		</button>
	),
	DropdownMenuContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuGroup: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({
		children,
		onClick,
		onSelect,
	}: React.PropsWithChildren<{
		onClick?: () => void;
		onSelect?: (event: { preventDefault: () => void }) => void;
	}>) => (
		<button
			type="button"
			onClick={() => {
				onClick?.();
				onSelect?.({ preventDefault: () => {} });
			}}
		>
			{children}
		</button>
	),
	DropdownMenuLabel: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuSub: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuSubContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuSubTrigger: ({ children }: React.PropsWithChildren) => (
		<button type="button">{children}</button>
	),
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => (
		<>{children}</>
	),
}));

vi.mock("@workspace/ui/components/input-group", () => ({
	InputGroup: ({
		children,
		className,
	}: React.PropsWithChildren<{ className?: string }>) => (
		<div className={className}>{children}</div>
	),
	InputGroupAddon: ({
		children,
		className,
	}: React.PropsWithChildren<{ className?: string }>) => (
		<div className={className}>{children}</div>
	),
	InputGroupButton: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			variant?: string;
			size?: string;
		}
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	InputGroupTextarea: React.forwardRef<
		HTMLTextAreaElement,
		React.TextareaHTMLAttributes<HTMLTextAreaElement>
	>((props, ref) => <textarea ref={ref} {...props} />),
}));

vi.mock("@workspace/ui/components/popover", () => ({
	Popover: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	PopoverContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@workspace/ui/components/switch", () => ({
	Switch: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			id={id}
			type="checkbox"
			checked={checked}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
		/>
	),
}));

vi.mock("@workspace/ui/components/tooltip", () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	TooltipContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe("ChatPage", () => {
	beforeEach(() => {
		convexTokenMock.mockReset();
		sendMessageMock.mockReset();
		toastSuccessMock.mockReset();
		useQueryMock.mockReset();
		useMutationMock.mockReset();
		convexTokenMock.mockResolvedValue({ data: { token: "convex-token" } });
		useMutationMock.mockReturnValue({
			withOptimisticUpdate: vi.fn(() => vi.fn()),
		});
		useChatMock.mockReturnValue({
			messages: [],
			sendMessage: sendMessageMock,
			error: undefined,
			status: "ready",
		});
		useQueryMock.mockImplementation((_query, args) => {
			if (
				args &&
				typeof args === "object" &&
				"workspaceId" in args &&
				args.workspaceId === "workspace-1"
			) {
				return [
					{
						_id: "meeting-notes",
						title: "Meeting notes",
						searchableText: "Team sync",
					},
					{
						_id: "guidelines",
						title: "Brand guidelines",
						searchableText: "Voice and tone",
					},
				];
			}

			return [];
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("focuses the chat prompt on open", async () => {
		const { ChatPage } = await import("../src/components/chat/chat-page");
		const priorFocus = document.createElement("button");
		priorFocus.type = "button";
		document.body.appendChild(priorFocus);
		priorFocus.focus();

		render(
			<ActiveWorkspaceProvider workspaceId={"workspace-1" as never}>
				<ChatPage
					chatId="chat-1"
					initialMessages={[]}
					onChatPersisted={vi.fn()}
					chats={[]}
					isChatsLoading={false}
					activeChatId={null}
					onOpenChat={vi.fn()}
					onChatRemoved={vi.fn()}
					onOpenConnectionsSettings={vi.fn()}
					activeWorkspace={null}
				/>
			</ActiveWorkspaceProvider>,
		);

		expect(document.activeElement).toBe(
			screen.getByPlaceholderText("Ask, search, or make anything..."),
		);
		priorFocus.remove();
	});

	it("submits the selected AI context in the chat request body", async () => {
		const user = userEvent.setup();
		const { ChatPage } = await import("../src/components/chat/chat-page");

		render(
			<ActiveWorkspaceProvider workspaceId={"workspace-1" as never}>
				<ChatPage
					chatId="chat-1"
					initialMessages={[]}
					onChatPersisted={vi.fn()}
					chats={[]}
					isChatsLoading={false}
					activeChatId={null}
					onOpenChat={vi.fn()}
					onChatRemoved={vi.fn()}
					onOpenConnectionsSettings={vi.fn()}
					activeWorkspace={null}
				/>
			</ActiveWorkspaceProvider>,
		);

		await user.type(
			screen.getByPlaceholderText("Ask, search, or make anything..."),
			"hello",
		);
		await user.click(screen.getByLabelText("Web search"));
		await user.click(screen.getByLabelText("Apps and Integrations"));
		const meetingNotesButtons = screen.getAllByRole("button", {
			name: "Meeting notes",
		});
		const brandGuidelinesButtons = screen.getAllByRole("button", {
			name: "Brand guidelines",
		});
		expect(meetingNotesButtons[0]).toBeDefined();
		expect(brandGuidelinesButtons[0]).toBeDefined();
		await user.click(meetingNotesButtons[0]);
		await user.click(brandGuidelinesButtons[0]);
		await user.click(screen.getByRole("button", { name: "Send" }));

		expect(sendMessageMock).toHaveBeenCalledTimes(1);
		expect(sendMessageMock).toHaveBeenCalledWith(
			{ text: "hello" },
			{
				body: {
					model: "gpt-5.4",
					webSearchEnabled: true,
					appsEnabled: false,
					mentions: ["meeting-notes", "guidelines"],
					selectedSourceIds: [],
					workspaceId: "workspace-1",
					convexToken: "convex-token",
				},
			},
		);
	}, 10_000);

	it("opens connections settings without mutating the chat route directly", async () => {
		const user = userEvent.setup();
		const pushStateSpy = vi.spyOn(window.history, "pushState");
		const onOpenConnectionsSettings = vi.fn();
		const { ChatPage } = await import("../src/components/chat/chat-page");

		vi.mocked(useChatMock).mockReturnValue({
			messages: [],
			sendMessage: sendMessageMock,
			error: undefined,
			status: "ready",
		});

		render(
			<ActiveWorkspaceProvider workspaceId={"workspace-1" as never}>
				<ChatPage
					chatId="chat-1"
					initialMessages={[]}
					onChatPersisted={vi.fn()}
					chats={[]}
					isChatsLoading={false}
					activeChatId={null}
					onOpenChat={vi.fn()}
					onChatRemoved={vi.fn()}
					onOpenConnectionsSettings={onOpenConnectionsSettings}
					activeWorkspace={null}
				/>
			</ActiveWorkspaceProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Connect Apps" }));

		expect(onOpenConnectionsSettings).toHaveBeenCalledTimes(1);
		expect(pushStateSpy).not.toHaveBeenCalledWith(
			null,
			"",
			"/settings/connections",
		);
	});

	it("shows a toast when web search is enabled or disabled", async () => {
		const user = userEvent.setup();
		const { ChatPage } = await import("../src/components/chat/chat-page");

		render(
			<ActiveWorkspaceProvider workspaceId={"workspace-1" as never}>
				<ChatPage
					chatId="chat-1"
					initialMessages={[]}
					onChatPersisted={vi.fn()}
					chats={[]}
					isChatsLoading={false}
					activeChatId={null}
					onOpenChat={vi.fn()}
					onChatRemoved={vi.fn()}
					onOpenConnectionsSettings={vi.fn()}
					activeWorkspace={null}
				/>
			</ActiveWorkspaceProvider>,
		);

		await user.click(screen.getByLabelText("Web search"));
		await user.click(screen.getByLabelText("Web search"));

		expect(toastSuccessMock).toHaveBeenNthCalledWith(1, "Web search enabled");
		expect(toastSuccessMock).toHaveBeenNthCalledWith(2, "Web search disabled");
	});
});
